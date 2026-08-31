import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Slice 9 E2E requires isolated Supabase service configuration");
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
  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Slice 9 test user unavailable");
  return data.user;
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
    policy_version: "s9-e2e",
  });
  if (error) throw error;
}

async function configureVerifiedCreator(ownerEmail: string, ownerId: string, testInfo: TestInfo) {
  const ownerClient = await authenticatedClient(ownerEmail);
  await assureAdult(ownerClient);
  const { data: membershipId, error: requestError } = await ownerClient.rpc("request_workspace_role", {
    requested_role: "creator",
  });
  if (requestError || typeof membershipId !== "string") throw requestError ?? new Error("Creator request unavailable");

  const adminEmail = email("s9-admin", testInfo);
  const superAdmin = await createUser(adminEmail);
  try {
    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", { target_user_id: superAdmin.id });
    if (bootstrapError) throw bootstrapError;
    const reviewer = await authenticatedClient(adminEmail);
    const { error: reviewError } = await reviewer.rpc("review_workspace_request", {
      target_membership_id: membershipId,
      decision: "approved",
    });
    if (reviewError) throw reviewError;
    const { error: activateError } = await ownerClient.rpc("activate_workspace", { target_membership_id: membershipId });
    if (activateError) throw activateError;

    const { data: v2Session, error: v2StartError } = await ownerClient.rpc("start_verification", {
      requested_level: "v2",
      requested_provider_key: "synthetic",
      requested_provider_reference: `s9-v2:${ownerId}`,
      requested_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      requested_synthetic: true,
    });
    if (v2StartError || typeof v2Session !== "string") throw v2StartError ?? new Error("V2 session unavailable");
    const { error: v2ReviewError } = await reviewer.rpc("apply_verification_result", {
      target_session_id: v2Session,
      decision: "verified",
      requested_result_expires_at: RESULT_EXPIRY(),
      requested_liveness_passed: true,
      requested_risk_screen_passed: true,
      requested_recheck_reason: null,
    });
    if (v2ReviewError) throw v2ReviewError;
  } finally {
    await admin.auth.admin.deleteUser(superAdmin.id);
  }

  return ownerClient;
}

async function login(page: Page, address: string, target: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page).toHaveURL(new RegExp(`${escapedTarget}$`));
}

async function lockedProject(ownerClient: SupabaseClient, ownerId: string) {
  const { data: profile, error: profileError } = await ownerClient
    .from("profiles")
    .select("handle")
    .eq("user_id", ownerId)
    .single();
  if (profileError || !profile?.handle) throw profileError ?? new Error("Creator handle unavailable");

  const { data: projectResult, error: projectError } = await ownerClient.rpc("create_project_draft", {
    project_input: {
      title: "Truthful campaign browser project",
      publicSynopsis: "A public campaign synopsis that is safe to show to supporters.",
      privateBrief: "PRIVATE PRODUCTION BRIEF MUST NEVER APPEAR ON PUBLIC CAMPAIGN PAGES",
      category: "concept",
      format: "video",
      boundaries: ["closed-set"],
      compensationModel: "fixed",
      distributionScope: "platform-only",
      rightsDeclarations: ["original-concept"],
    },
  });
  if (projectError || !projectResult?.publicId) throw projectError ?? new Error("Project fixture unavailable");
  const projectPublicId = String(projectResult.publicId);

  const { data: termsResult, error: termsError } = await ownerClient.rpc("publish_project_terms", {
    requested_project_public_id: projectPublicId,
    expected_project_revision: 1,
    requested_terms: {
      participants: [{ handle: profile.handle, role: "creator", depicted: false }],
      role: "creator",
      boundaries: ["closed-set"],
      collaborators: [],
      compensation: "fixed:10000:USD",
      distributionScope: "platform-only",
      rightsScope: "streaming-only",
      schedule: "January to March 2027",
      cancellation: "Either party may leave before contract lock",
      finalCutApprovalRequired: true,
    },
  });
  if (termsError || !termsResult?.hash) throw termsError ?? new Error("Terms fixture unavailable");
  const termsHash = String(termsResult.hash);

  const { error: acceptError } = await ownerClient.rpc("accept_project_terms", {
    requested_project_public_id: projectPublicId,
    requested_terms_hash: termsHash,
    step_up_proof: "step-up-confirmed",
  });
  if (acceptError) throw acceptError;
  const { error: lockError } = await ownerClient.rpc("lock_project_contract", {
    requested_project_public_id: projectPublicId,
    requested_terms_hash: termsHash,
  });
  if (lockError) throw lockError;
  return projectPublicId;
}

function futureDate(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("campaign publish and pre-book surfaces preserve exact truthful state", async ({ page }, testInfo) => {
  const ownerEmail = email("s9-owner", testInfo);
  const supporterEmail = email("s9-supporter", testInfo);
  const owner = await createUser(ownerEmail);
  const supporter = await createUser(supporterEmail);

  try {
    const ownerClient = await configureVerifiedCreator(ownerEmail, owner.id, testInfo);
    const supporterClient = await authenticatedClient(supporterEmail);
    await assureAdult(supporterClient);
    const projectPublicId = await lockedProject(ownerClient, owner.id);
    const campaignPath = `/studio/projects/${projectPublicId}/campaign`;

    await login(page, ownerEmail, campaignPath);
    await expect(page.getByRole("heading", { name: "Campaign publishing" })).toBeVisible();
    await page.getByLabel("Funding target (minor units)").fill("250000");
    await page.getByLabel("Currency").fill("USD");
    await page.getByLabel("Funding deadline").fill(futureDate(60));
    await page.getByLabel("Expected delivery window").fill("January to March 2027");
    await page.getByLabel("Guaranteed outcomes").fill("One completed platform release");
    await page.getByLabel("Optional supporter choices").fill("Creator-approved poster vote");
    await page.getByLabel("Refund rules").fill("If the campaign fails or is cancelled, the permitted refund path is shown before confirmation.");
    await page.getByLabel("Material change rules").fill("Material campaign changes require a new version and fresh supporter action where applicable.");
    await page.getByRole("button", { name: "Save campaign draft" }).click();
    await expect(page.getByRole("status")).toContainText("Campaign draft saved");
    await expect(page).toHaveURL(/campaign\?campaign=cmp[0-9a-f]{24}&version=1/);
    const savedUrl = page.url();
    const campaignPublicId = new URL(savedUrl).searchParams.get("campaign");
    if (!campaignPublicId) throw new Error("Saved campaign public id unavailable");

    await page.reload();
    await expect(page.getByLabel("Funding target (minor units)")).toHaveValue("250000");
    await expect(page.getByLabel("Expected delivery window")).toHaveValue("January to March 2027");
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Submit for publish review" }).click();
    await expect(page.getByRole("status")).toContainText("Campaign ready for publish review");

    const { error: restrictError } = await admin
      .from("projects")
      .update({ funding_restricted: true })
      .eq("public_id", projectPublicId);
    if (restrictError) throw restrictError;
    await page.getByRole("button", { name: "Publish campaign" }).click();
    await expect(page.getByRole("alert")).toContainText("Campaign publication denied");

    const { error: clearRestrictionError } = await admin
      .from("projects")
      .update({ funding_restricted: false })
      .eq("public_id", projectPublicId);
    if (clearRestrictionError) throw clearRestrictionError;
    await page.getByRole("button", { name: "Publish campaign" }).click();
    await expect(page.getByRole("status")).toContainText("Campaign published");
    await page.getByRole("link", { name: "View public campaign" }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${campaignPublicId}$`));
    await expect(page.getByRole("heading", { name: "Truthful campaign browser project" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Guaranteed outcomes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Optional supporter choices" })).toBeVisible();
    await expect(page.getByText("PRIVATE PRODUCTION BRIEF MUST NEVER APPEAR ON PUBLIC CAMPAIGN PAGES")).toHaveCount(0);
    await expect(page.getByText(ownerEmail)).toHaveCount(0);
    await expect(page.getByText(/0 supporters/i)).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Sign out" }).click();
    const fundingPath = `/app/funding/${campaignPublicId}`;
    await login(page, supporterEmail, fundingPath);
    await expect(page.getByRole("heading", { name: "Confirm your pre-book" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm pre-book" })).toBeVisible();
    await expect(page.getByRole("button", { name: /pay|authorize/i })).toHaveCount(0);
    await page.getByLabel("Pre-book amount (minor units)").fill("5000");
    await page.getByLabel("Supporter visibility").selectOption("default");
    await page.getByLabel("Supporter badge choice").fill("founding-supporter");

    await page.locator("form[data-prebook-form]").evaluate((node) => {
      const form = node as HTMLFormElement;
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(page.getByRole("status")).toContainText("Pre-book confirmed", { timeout: 15_000 });
    await expect(page.getByRole("status")).toContainText("not a payment or card authorization");

    const { data: publicCampaign, error: publicCampaignError } = await supporterClient.rpc("get_public_campaign", {
      requested_campaign_public_id: campaignPublicId,
    });
    if (publicCampaignError) throw publicCampaignError;
    expect(publicCampaign?.supporterCount).toBe(1);
    expect(publicCampaign?.fundedAmountMinor).toBe(5000);
    expect(JSON.stringify(publicCampaign)).not.toContain(supporterEmail);

    await page.goto(`/p/${campaignPublicId}`);
    await expect(page.getByText(/1 supporter/i)).toBeVisible();
    await expect(page.getByText(supporterEmail)).toHaveCount(0);
    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/p/${campaignPublicId}$`));
    await expectNoHorizontalOverflow(page);
  } finally {
    await admin.auth.admin.deleteUser(owner.id);
    await admin.auth.admin.deleteUser(supporter.id);
  }
});
