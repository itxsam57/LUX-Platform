import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Slices 4-10 journey requires isolated Supabase service configuration");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const PASSWORD = "LuxSecureTest123";
const RESULT_EXPIRY = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

function email(prefix: string, testInfo: TestInfo) {
  return `${prefix}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}@lux.test`;
}

async function createUser(address: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: address, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Marketplace journey user unavailable");
  return data.user;
}

function retryableAuthCleanup(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && String((error as { name?: unknown }).name) === "AuthRetryableFetchError"
  );
}

async function removeUser(id: string) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (!error) return;
      lastError = error;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  if (retryableAuthCleanup(lastError)) return;
  throw lastError instanceof Error ? lastError : new Error("Marketplace journey user cleanup failed");
}

async function authenticatedClient(address: string): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function assureAdult(client: SupabaseClient) {
  const { error } = await client.rpc("confirm_adult_attestation", {
    jurisdiction_code: "PK",
    policy_version: "marketplace-4-10-e2e",
  });
  if (error) throw error;
}

async function login(page: Page, address: string, target: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page).toHaveURL(new RegExp(`${escapedTarget}$`), { timeout: 15_000 });
}

async function profileHandle(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("profiles").select("handle").eq("user_id", userId).single();
  if (error || !data?.handle) throw error ?? new Error("Marketplace journey handle unavailable");
  return String(data.handle);
}

async function configureCreatorRole(
  creatorClient: SupabaseClient,
  reviewer: SupabaseClient,
) {
  const { data: membershipId, error: requestError } = await creatorClient.rpc("request_workspace_role", {
    requested_role: "creator",
  });
  if (requestError || typeof membershipId !== "string") throw requestError ?? new Error("Creator request unavailable");
  const { error: reviewError } = await reviewer.rpc("review_workspace_request", {
    target_membership_id: membershipId,
    decision: "approved",
  });
  if (reviewError) throw reviewError;
  const { error: activateError } = await creatorClient.rpc("activate_workspace", { target_membership_id: membershipId });
  if (activateError) throw activateError;
}

async function verifyCreatorV2(creatorClient: SupabaseClient, creatorId: string, reviewer: SupabaseClient) {
  const { data: v2Session, error: startError } = await creatorClient.rpc("start_verification", {
    requested_level: "v2",
    requested_provider_key: "synthetic",
    requested_provider_reference: `marketplace-v2:${creatorId}`,
    requested_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    requested_synthetic: true,
  });
  if (startError || typeof v2Session !== "string") throw startError ?? new Error("Creator V2 session unavailable");
  const { error: resultError } = await reviewer.rpc("apply_verification_result", {
    target_session_id: v2Session,
    decision: "verified",
    requested_result_expires_at: RESULT_EXPIRY(),
    requested_liveness_passed: true,
    requested_risk_screen_passed: true,
    requested_recheck_reason: null,
  });
  if (resultError) throw resultError;
}

async function verifyPerformer(
  performerClient: SupabaseClient,
  performerId: string,
  reviewer: SupabaseClient,
) {
  const { data: v2Session, error: v2StartError } = await performerClient.rpc("start_verification", {
    requested_level: "v2",
    requested_provider_key: "synthetic",
    requested_provider_reference: `marketplace-performer-v2:${performerId}`,
    requested_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    requested_synthetic: true,
  });
  if (v2StartError || typeof v2Session !== "string") throw v2StartError ?? new Error("Performer V2 session unavailable");
  const { error: v2ReviewError } = await reviewer.rpc("apply_verification_result", {
    target_session_id: v2Session,
    decision: "verified",
    requested_result_expires_at: RESULT_EXPIRY(),
    requested_liveness_passed: true,
    requested_risk_screen_passed: true,
    requested_recheck_reason: null,
  });
  if (v2ReviewError) throw v2ReviewError;

  const { error: educationError } = await performerClient.rpc("acknowledge_consent_education", {
    requested_policy_version: "slice-5-consent-v1",
  });
  if (educationError) throw educationError;
  const { error: prerequisiteError } = await reviewer.rpc("set_performer_verification_prerequisites", {
    target_user_id: performerId,
    record_active: true,
    liveness_expires_at: RESULT_EXPIRY(),
    payout_ownership_verified: true,
  });
  if (prerequisiteError) throw prerequisiteError;

  const { data: v3Session, error: v3StartError } = await performerClient.rpc("start_verification", {
    requested_level: "v3",
    requested_provider_key: "synthetic",
    requested_provider_reference: `marketplace-performer-v3:${performerId}`,
    requested_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    requested_synthetic: true,
  });
  if (v3StartError || typeof v3Session !== "string") throw v3StartError ?? new Error("Performer V3 session unavailable");
  const { error: v3ReviewError } = await reviewer.rpc("apply_verification_result", {
    target_session_id: v3Session,
    decision: "verified",
    requested_result_expires_at: RESULT_EXPIRY(),
    requested_liveness_passed: true,
    requested_risk_screen_passed: true,
    requested_recheck_reason: null,
  });
  if (v3ReviewError) throw v3ReviewError;
}

async function openContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  return browser.newContext(testInfo.project.use);
}

function futureDate(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNoFundingSecrets(page: Page) {
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/(?:txn|cus|pm)_sbx_/i);
  expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(body).not.toContain("MARKETPLACE JOURNEY PRIVATE BRIEF MUST NEVER LEAK");
}

test("Slices 4-10 form one creator-controlled marketplace journey", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);

  const fanEmail = email("marketplace-fan", testInfo);
  const creatorEmail = email("marketplace-creator", testInfo);
  const performerEmail = email("marketplace-performer", testInfo);
  const reviewerEmail = email("marketplace-reviewer", testInfo);
  const fan = await createUser(fanEmail);
  const creator = await createUser(creatorEmail);
  const performer = await createUser(performerEmail);
  const reviewerUser = await createUser(reviewerEmail);
  const creatorContext = await openContext(browser, testInfo);
  const performerContext = await openContext(browser, testInfo);
  const creatorPage = await creatorContext.newPage();
  const performerPage = await performerContext.newPage();

  try {
    const fanClient = await authenticatedClient(fanEmail);
    const creatorClient = await authenticatedClient(creatorEmail);
    const performerClient = await authenticatedClient(performerEmail);
    await Promise.all([assureAdult(fanClient), assureAdult(creatorClient), assureAdult(performerClient)]);

    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", { target_user_id: reviewerUser.id });
    if (bootstrapError) throw bootstrapError;
    const reviewer = await authenticatedClient(reviewerEmail);
    await configureCreatorRole(creatorClient, reviewer);

    const creatorHandle = await profileHandle(creatorClient, creator.id);
    const performerHandle = await profileHandle(performerClient, performer.id);

    // Slice 4: a fan can discover the public creator without private identifiers.
    await login(page, fanEmail, "/app/explore");
    await expect(page.getByRole("heading", { name: "Discover public creators" })).toBeVisible();
    const creatorCard = page.getByRole("article").filter({ hasText: `@${creatorHandle}` });
    await expect(creatorCard).toHaveCount(1);
    await expect(creatorCard.getByText("Creator", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(creator.id);

    // Slice 6: the fan requests an idea; only the named creator can opt in.
    await page.goto("/app/demand/new");
    await page.getByLabel("Title").fill("Marketplace journey concept");
    await page.getByLabel("Brief").fill("A voluntary adult creator concept with explicit boundaries and no implied commitment from the suggested creator.");
    await page.getByLabel("Category").fill("creator_idea");
    await page.getByLabel("Format").fill("short_film");
    await page.getByLabel("Suggested creator handle").fill(creatorHandle);
    await page.getByRole("button", { name: "Publish demand" }).click();
    await expect(page).toHaveURL(/\/demand\/dem[A-Za-z0-9_-]{24}$/);
    const demandPublicId = new URL(page.url()).pathname.split("/").at(-1);
    if (!demandPublicId) throw new Error("Marketplace demand public id unavailable");
    await expect(page.getByTestId("demand-state")).toHaveText("Open");
    await expect(page.getByTestId("demand-suggested-creator")).toContainText(/suggested|requested/i);

    await login(creatorPage, creatorEmail, "/workspace/creator/demand");
    const demandCard = creatorPage.getByTestId("creator-demand-card").filter({ hasText: "Marketplace journey concept" });
    await expect(demandCard).toHaveCount(1);
    await demandCard.getByRole("button", { name: "Mark interested" }).click();
    await expect(demandCard.getByTestId("creator-demand-response")).toHaveText("Interested");

    // Slice 5 verification gates are completed only after the creator has voluntarily shown interest.
    await verifyCreatorV2(creatorClient, creator.id, reviewer);
    await verifyPerformer(performerClient, performer.id, reviewer);

    await demandCard.getByRole("link", { name: "Create project draft" }).click();
    await expect(creatorPage).toHaveURL(new RegExp(`/studio/projects/new\\?demand=${demandPublicId}$`));

    // Slice 7: the interested demand converts into a creator-owned, versioned project.
    await creatorPage.getByLabel("Project title").fill("Marketplace journey project");
    await creatorPage.getByLabel("Public synopsis").fill("A public-safe marketplace journey synopsis for a creator-controlled production.");
    await creatorPage.getByLabel("Private production brief").fill("MARKETPLACE JOURNEY PRIVATE BRIEF MUST NEVER LEAK");
    await creatorPage.getByLabel("Category").fill("concept");
    await creatorPage.getByLabel("Format").fill("video");
    await creatorPage.getByLabel("Boundaries").fill("closed-set, no-surprises");
    await creatorPage.getByLabel("Compensation model").selectOption("fixed");
    await creatorPage.getByLabel("Distribution scope").fill("Platform release only");
    await creatorPage.getByLabel("Rights declarations").fill("original-concept");
    await creatorPage.getByRole("button", { name: "Create project draft" }).click();
    await expect(creatorPage).toHaveURL(/\/studio\/projects\/prj[0-9a-f]{24}$/);
    const projectPublicId = new URL(creatorPage.url()).pathname.split("/").at(-1);
    if (!projectPublicId) throw new Error("Marketplace project public id unavailable");

    const { data: ownedProject, error: ownedProjectError } = await creatorClient.rpc("get_project_private", {
      requested_public_id: projectPublicId,
    });
    if (ownedProjectError || !ownedProject || typeof ownedProject !== "object" || Array.isArray(ownedProject)) {
      throw ownedProjectError ?? new Error("Converted project is not visible through the creator-owner projection");
    }
    const ownedProjectRecord = ownedProject as Record<string, unknown>;
    expect(ownedProjectRecord.publicId).toBe(projectPublicId);
    expect(ownedProjectRecord.title).toBe("Marketplace journey project");

    await page.goto(`/demand/${demandPublicId}`);
    await expect(page.getByTestId("demand-state")).toHaveText("Converted");

    await creatorPage.getByLabel("Recipient handle").fill(performerHandle);
    await creatorPage.getByLabel("Role").fill("performer");
    await creatorPage.getByLabel("Proposal note").fill("Perform under the exact project terms and personal consent boundary.");
    await creatorPage.getByRole("button", { name: "Send invitation" }).click();
    await expect(creatorPage).toHaveURL(/\/studio\/invitations\/inv[0-9a-f]{24}$/);
    const invitationPublicId = new URL(creatorPage.url()).pathname.split("/").at(-1);
    if (!invitationPublicId) throw new Error("Marketplace invitation public id unavailable");

    await login(performerPage, performerEmail, `/studio/invitations/${invitationPublicId}`);
    await expect(performerPage.getByRole("heading", { name: "Collaboration invitation" })).toBeVisible();
    await performerPage.getByRole("button", { name: "interested", exact: true }).click();
    await expect(performerPage).toHaveURL(/notice=interested/);
    await performerPage.getByLabel("Structured proposal note").fill("I can participate if the exact boundaries and final-cut approval remain explicit.");
    await performerPage.getByRole("button", { name: "Propose change" }).click();
    await expect(performerPage).toHaveURL(/notice=proposal/);
    await performerPage.getByRole("button", { name: "accepted", exact: true }).click();
    await expect(performerPage).toHaveURL(/notice=accepted/);
    await expect(performerPage.getByText(/not a contract or depicted-person consent/i)).toBeVisible();

    // Slice 8: exact terms and depicted-person consent are personal and precede contract lock.
    await creatorPage.goto(`/studio/projects/${projectPublicId}/terms`);
    await expect(creatorPage.getByRole("heading", { name: "Contract terms and consent" })).toBeVisible();
    await creatorPage.getByLabel("Participants").fill(`${performerHandle}|performer|true`);
    await creatorPage.getByLabel("Primary role").fill("performer");
    await creatorPage.getByLabel("Boundaries").fill("closed-set, no-surprises");
    await creatorPage.getByLabel("Collaborators").fill(creatorHandle);
    await creatorPage.getByLabel("Compensation").fill("fixed:10000:USD");
    await creatorPage.getByLabel("Distribution scope").fill("platform-only");
    await creatorPage.getByLabel("Rights scope").fill("streaming-only");
    await creatorPage.getByLabel("Schedule").fill("January to March 2027");
    await creatorPage.getByLabel("Cancellation terms").fill("Either party may leave before contract lock");
    await creatorPage.getByLabel("Final-cut approval required").selectOption("true");
    await creatorPage.getByRole("button", { name: "Publish immutable terms" }).click();
    await expect(creatorPage.getByRole("status")).toContainText("Immutable terms published");

    await performerPage.goto(`/studio/projects/${projectPublicId}/terms`);
    await performerPage.getByLabel("Step-up confirmation").fill("step-up-confirmed");
    await performerPage.getByRole("button", { name: "Accept exact terms" }).click();
    await expect(performerPage.getByRole("status")).toContainText("Terms accepted personally");
    await performerPage.getByLabel("Consent step-up confirmation").fill("step-up-confirmed");
    await performerPage.getByRole("button", { name: "Record depicted-person consent" }).click();
    await expect(performerPage.getByRole("status")).toContainText("Depicted-person consent recorded personally");

    await creatorPage.goto(`/studio/projects/${projectPublicId}/terms`);
    await creatorPage.getByRole("button", { name: "Lock contract" }).click();
    await expect(creatorPage.getByRole("status")).toContainText("Contract locked");
    await creatorPage.getByRole("link", { name: "Project" }).click();
    await expect(creatorPage).toHaveURL(new RegExp(`/studio/projects/${projectPublicId}$`));

    // Slice 9 integration seam: a locked project must provide a real continuation into campaign preparation.
    await creatorPage.getByRole("link", { name: "Campaign publishing" }).click();
    await expect(creatorPage).toHaveURL(new RegExp(`/studio/projects/${projectPublicId}/campaign$`));
    await creatorPage.getByLabel("Funding target (minor units)").fill("250000");
    await creatorPage.getByLabel("Currency").fill("USD");
    await creatorPage.getByLabel("Funding deadline").fill(futureDate(60));
    await creatorPage.getByLabel("Expected delivery window").fill("January to March 2027");
    await creatorPage.getByLabel("Guaranteed outcomes").fill("One completed platform release");
    await creatorPage.getByLabel("Optional supporter choices").fill("Creator-approved poster vote");
    await creatorPage.getByLabel("Refund rules").fill("If the campaign fails or is cancelled, the permitted refund path is shown before confirmation.");
    await creatorPage.getByLabel("Material change rules").fill("Material campaign changes require a new version and fresh supporter action where applicable.");
    await creatorPage.getByRole("button", { name: "Save campaign draft" }).click();
    await expect(creatorPage.getByRole("status")).toContainText("Campaign draft saved");
    const campaignPublicId = new URL(creatorPage.url()).searchParams.get("campaign");
    if (!campaignPublicId) throw new Error("Marketplace campaign public id unavailable");
    await creatorPage.getByRole("button", { name: "Submit for publish review" }).click();
    await expect(creatorPage.getByRole("status")).toContainText("Campaign ready for publish review");
    await creatorPage.getByRole("button", { name: "Publish campaign" }).click();
    await expect(creatorPage.getByRole("status")).toContainText("Campaign published");
    await creatorPage.getByRole("link", { name: "View public campaign" }).click();
    await expect(creatorPage).toHaveURL(new RegExp(`/p/${campaignPublicId}$`));
    await expect(creatorPage.getByText("MARKETPLACE JOURNEY PRIVATE BRIEF MUST NEVER LEAK")).toHaveCount(0);

    // Slice 9 integration seam: the public campaign must expose the supporter pre-book path.
    await page.goto(`/p/${campaignPublicId}`);
    await page.getByRole("link", { name: "Pre-book" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/funding/${campaignPublicId}$`));
    await page.getByLabel("Pre-book amount (minor units)").fill("5000");
    await page.getByLabel("Supporter visibility").selectOption("default");
    await page.getByLabel("Supporter badge choice").fill("founding-supporter");
    await page.locator("form[data-prebook-form]").evaluate((node) => {
      const form = node as HTMLFormElement;
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(page.getByRole("status")).toContainText("Pre-book confirmed", { timeout: 15_000 });

    const { data: fundingRows, error: fundingRowsError } = await fanClient.rpc("list_funding_commitments");
    if (fundingRowsError || !Array.isArray(fundingRows)) throw fundingRowsError ?? new Error("Funding projection unavailable");
    const funding = fundingRows.find((row) => row?.campaignPublicId === campaignPublicId);
    if (!funding || typeof funding.publicId !== "string") throw new Error("Marketplace funding commitment unavailable");
    const commitmentPublicId = funding.publicId;
    const processorSuffix = commitmentPublicId.slice(3);
    const { error: paymentError } = await admin.rpc("record_payment_transition", {
      requested_commitment_public_id: commitmentPublicId,
      requested_provider_key: "sandbox",
      requested_customer_ref: `cus_sbx_${processorSuffix}`,
      requested_payment_method_ref: `pm_sbx_${processorSuffix}`,
      requested_transaction_ref: `txn_sbx_${processorSuffix}`,
      requested_state: "authorized",
      requested_authorized_minor: 5000,
      requested_captured_minor: 0,
      requested_refunded_minor: 0,
      requested_idempotency_key: `marketplace-payment:${crypto.randomUUID()}`,
    });
    if (paymentError) throw paymentError;

    // Slice 10: funding stays private/truthful and changed terms/refund remain explicit.
    await page.goto("/app/funding");
    await expect(page.getByRole("heading", { name: "Funding dashboard" })).toBeVisible();
    await expect(page.getByText("Marketplace journey project")).toBeVisible();
    await expect(page.locator(".funding-state").filter({ hasText: /^authorized$/ })).toBeVisible();
    await expect(page.getByText(/sandbox.*not production/i)).toBeVisible();
    await expectNoFundingSecrets(page);
    await page.getByRole("link", { name: "View funding" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/funding/${commitmentPublicId}$`));

    const { error: changeError } = await admin.rpc("register_funding_material_change", {
      requested_commitment_public_id: commitmentPublicId,
      requested_expected_delivery_window: "April to June 2027",
      requested_reason: "Delivery window changed after the original commitment.",
      requested_idempotency_key: `marketplace-change:${crypto.randomUUID()}`,
    });
    if (changeError) throw changeError;
    await page.reload();
    const deliveryChange = page.getByLabel("Changed campaign delivery window");
    await expect(deliveryChange.getByText("January to March 2027", { exact: true })).toBeVisible();
    await expect(deliveryChange.getByText("April to June 2027", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Accept changed terms" }).click();
    await expect(page.getByRole("status")).toContainText("Changed terms accepted");

    const refundForm = page.locator("form[data-refund-form]");
    await refundForm.getByLabel("Refund amount (minor units)").fill("1500");
    await refundForm.getByLabel("Refund reason").fill("Campaign no longer fits my needs");
    await refundForm.evaluate((node) => {
      const form = node as HTMLFormElement;
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(page.getByRole("status")).toContainText("Refund requested");
    await expectNoFundingSecrets(page);
    await expectNoHorizontalOverflow(page);
  } finally {
    await creatorContext.close();
    await performerContext.close();
    await removeUser(fan.id);
    await removeUser(creator.id);
    await removeUser(performer.id);
    await removeUser(reviewerUser.id);
  }
});