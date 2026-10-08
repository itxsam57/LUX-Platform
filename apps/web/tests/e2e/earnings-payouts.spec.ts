import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Slice 14 E2E requires isolated Supabase service configuration");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const PASSWORD = "LuxSecureTest123";
const RESULT_EXPIRY = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

function email(prefix: string, testInfo: TestInfo) {
  return `${prefix}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}@lux.test`;
}

function idempotency(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

async function createUser(address: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Slice 14 test user unavailable");
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
    policy_version: "s14-e2e",
  });
  if (error) throw error;
}

async function verifyLevel(
  client: SupabaseClient,
  reviewer: SupabaseClient,
  userId: string,
  level: "v2" | "v3",
  reference: string,
) {
  const { data: sessionId, error: startError } = await client.rpc("start_verification", {
    requested_level: level,
    requested_provider_key: "synthetic",
    requested_provider_reference: reference,
    requested_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    requested_synthetic: true,
  });
  if (startError || typeof sessionId !== "string") {
    throw startError ?? new Error(`${level.toUpperCase()} verification session unavailable for ${userId}`);
  }
  const { error: resultError } = await reviewer.rpc("apply_verification_result", {
    target_session_id: sessionId,
    decision: "verified",
    requested_result_expires_at: RESULT_EXPIRY(),
    requested_liveness_passed: true,
    requested_risk_screen_passed: true,
    requested_recheck_reason: null,
  });
  if (resultError) throw resultError;
}

async function configureCreator(ownerEmail: string, ownerId: string, reviewer: SupabaseClient) {
  const owner = await authenticatedClient(ownerEmail);
  await assureAdult(owner);
  const { data: membershipId, error: requestError } = await owner.rpc("request_workspace_role", {
    requested_role: "creator",
  });
  if (requestError || typeof membershipId !== "string") {
    throw requestError ?? new Error("Creator workspace request unavailable");
  }
  const { error: reviewError } = await reviewer.rpc("review_workspace_request", {
    target_membership_id: membershipId,
    decision: "approved",
  });
  if (reviewError) throw reviewError;
  const { error: activateError } = await owner.rpc("activate_workspace", {
    target_membership_id: membershipId,
  });
  if (activateError) throw activateError;
  await verifyLevel(owner, reviewer, ownerId, "v2", `s14-owner-v2:${ownerId}`);
  return owner;
}

async function configurePerformer(performerEmail: string, performerId: string, reviewer: SupabaseClient) {
  const performer = await authenticatedClient(performerEmail);
  await assureAdult(performer);
  await verifyLevel(performer, reviewer, performerId, "v2", `s14-performer-v2:${performerId}`);
  const { error: educationError } = await performer.rpc("acknowledge_consent_education", {
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
  await verifyLevel(performer, reviewer, performerId, "v3", `s14-performer-v3:${performerId}`);
  return performer;
}

async function login(page: Page, address: string, target: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page).toHaveURL(new RegExp(`${escapedTarget}$`));
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
}

async function expectNoFinanceSecrets(page: Page, forbidden: string[] = []) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/(?:txn|cus|pm|po)_sbx_/i);
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(text).not.toMatch(/\/private\//i);
  for (const value of forbidden) expect(text).not.toContain(value);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function createLedgerFixture(
  owner: SupabaseClient,
  performer: SupabaseClient,
  supporter: SupabaseClient,
  ownerId: string,
  performerId: string,
) {
  const { data: ownerProfile, error: ownerProfileError } = await owner
    .from("profiles").select("handle").eq("user_id", ownerId).single();
  const { data: performerProfile, error: performerProfileError } = await performer
    .from("profiles").select("handle").eq("user_id", performerId).single();
  if (ownerProfileError || !ownerProfile?.handle) throw ownerProfileError ?? new Error("Owner handle unavailable");
  if (performerProfileError || !performerProfile?.handle) throw performerProfileError ?? new Error("Performer handle unavailable");

  const { data: project, error: projectError } = await owner.rpc("create_project_draft", {
    project_input: {
      title: "Slice 14 journal payout project",
      publicSynopsis: "Browser fixture for restricted earnings, reconciliation, and paid journal state.",
      privateBrief: "PRIVATE S14 FINANCE BRIEF MUST NEVER APPEAR IN PARTICIPANT OR FINANCE PROJECTIONS",
      category: "concept",
      format: "video",
      boundaries: ["closed-set"],
      compensationModel: "revenue-share",
      distributionScope: "platform-only",
      rightsDeclarations: ["original-concept"],
    },
  });
  if (projectError || !project?.publicId) throw projectError ?? new Error("Slice 14 project unavailable");
  const projectPublicId = String(project.publicId);

  const { data: terms, error: termsError } = await owner.rpc("publish_project_terms", {
    requested_project_public_id: projectPublicId,
    expected_project_revision: 1,
    requested_terms: {
      participants: [
        { handle: ownerProfile.handle, role: "creator", depicted: false },
        { handle: performerProfile.handle, role: "performer", depicted: true },
      ],
      role: "creator",
      boundaries: ["closed-set"],
      collaborators: ["editor"],
      compensation: "revenue-share:9000bps:USD",
      distributionScope: "platform-only",
      rightsScope: "streaming-only",
      schedule: "September to December 2026",
      cancellation: "Either party may leave before contract lock",
      finalCutApprovalRequired: true,
    },
  });
  if (termsError || !terms?.hash) throw termsError ?? new Error("Slice 14 terms unavailable");
  const termsHash = String(terms.hash);

  const { error: ownerAcceptError } = await owner.rpc("accept_project_terms", {
    requested_project_public_id: projectPublicId,
    requested_terms_hash: termsHash,
    step_up_proof: "owner-step-up-confirmed",
  });
  if (ownerAcceptError) throw ownerAcceptError;
  const { error: performerAcceptError } = await performer.rpc("accept_project_terms", {
    requested_project_public_id: projectPublicId,
    requested_terms_hash: termsHash,
    step_up_proof: "performer-step-up-confirmed",
  });
  if (performerAcceptError) throw performerAcceptError;
  const { error: consentError } = await performer.rpc("record_depicted_consent", {
    requested_project_public_id: projectPublicId,
    requested_terms_hash: termsHash,
    step_up_proof: "performer-consent-confirmed",
  });
  if (consentError) throw consentError;
  const { error: lockError } = await owner.rpc("lock_project_contract", {
    requested_project_public_id: projectPublicId,
    requested_terms_hash: termsHash,
  });
  if (lockError) throw lockError;

  const { data: campaign, error: campaignError } = await owner.rpc("save_campaign_draft", {
    requested_project_public_id: projectPublicId,
    requested_terms: {
      fundingTargetMinor: 250000,
      currency: "USD",
      deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      expectedDeliveryWindow: "October to December 2026",
      guarantees: ["One completed platform release"],
      optionalChoices: ["Creator-approved poster vote"],
      refundRules: "Eligible refunds follow the published campaign terms.",
      materialChangeRules: "Material changes require a new campaign version and supporter action where applicable.",
    },
  });
  if (campaignError || !campaign?.publicId) throw campaignError ?? new Error("Slice 14 campaign unavailable");
  const campaignPublicId = String(campaign.publicId);
  const { error: submitCampaignError } = await owner.rpc("submit_campaign_for_publish", {
    requested_campaign_public_id: campaignPublicId,
    expected_terms_version: 1,
  });
  if (submitCampaignError) throw submitCampaignError;
  const { error: publishCampaignError } = await owner.rpc("publish_campaign", {
    requested_campaign_public_id: campaignPublicId,
    expected_terms_version: 1,
  });
  if (publishCampaignError) throw publishCampaignError;

  const { data: commitment, error: commitmentError } = await supporter.rpc("create_prebook", {
    requested_campaign_public_id: campaignPublicId,
    requested_amount_minor: 5000,
    requested_supporter_visibility: "anonymous",
    requested_badge_choice: "founding-supporter",
    requested_idempotency_key: idempotency("s14-prebook"),
  });
  if (commitmentError || !commitment?.publicId) throw commitmentError ?? new Error("Slice 14 commitment unavailable");
  const commitmentPublicId = String(commitment.publicId);
  const processorSuffix = commitmentPublicId.slice(3);
  const providerRefs = {
    customer: `cus_sbx_${processorSuffix}`,
    paymentMethod: `pm_sbx_${processorSuffix}`,
    transaction: `txn_sbx_${processorSuffix}`,
  };
  for (const transition of [
    { state: "authorized", capturedMinor: 0 },
    { state: "captured", capturedMinor: 5000 },
  ]) {
    const { error: transitionError } = await admin.rpc("record_payment_transition", {
      requested_commitment_public_id: commitmentPublicId,
      requested_provider_key: "sandbox",
      requested_customer_ref: providerRefs.customer,
      requested_payment_method_ref: providerRefs.paymentMethod,
      requested_transaction_ref: providerRefs.transaction,
      requested_state: transition.state,
      requested_authorized_minor: 5000,
      requested_captured_minor: transition.capturedMinor,
      requested_refunded_minor: 0,
      requested_idempotency_key: idempotency(`s14-payment-${transition.state}`),
    });
    if (transitionError) throw transitionError;
  }

  const { error: rulesError } = await owner.rpc("configure_project_revenue_rules", {
    requested_project_public_id: projectPublicId,
    requested_rules: {
      lines: [
        { kind: "platform_fee", basisPoints: 1000 },
        { kind: "participant", handle: performerProfile.handle, basisPoints: 9000 },
      ],
    },
    requested_idempotency_key: idempotency("s14-rules"),
  });
  if (rulesError) throw rulesError;
  const { error: syncError } = await admin.rpc("sync_payment_ledger", {
    requested_provider_key: "sandbox",
    requested_provider_transaction_ref: providerRefs.transaction,
    requested_processing_fee_minor: 0,
    requested_idempotency_key: idempotency("s14-ledger-sync"),
  });
  if (syncError) throw syncError;

  return {
    projectPublicId,
    campaignPublicId,
    commitmentPublicId,
    performerHandle: String(performerProfile.handle),
    providerRefs,
    privateBrief: "PRIVATE S14 FINANCE BRIEF MUST NEVER APPEAR IN PARTICIPANT OR FINANCE PROJECTIONS",
  };
}

test("journal earnings, holds, payout retries, reconciliation, and paid history stay idempotent and private", async ({ page }, testInfo) => {
  test.slow();
  const ownerEmail = email("s14-owner", testInfo);
  const performerEmail = email("s14-performer", testInfo);
  const supporterEmail = email("s14-supporter", testInfo);
  const staffEmail = email("s14-staff", testInfo);
  const [ownerUser, performerUser, supporterUser, staffUser] = await Promise.all([
    createUser(ownerEmail),
    createUser(performerEmail),
    createUser(supporterEmail),
    createUser(staffEmail),
  ]);
  const providerPayoutRef = `po_sbx_${crypto.randomUUID().replaceAll("-", "")}`;

  try {
    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", { target_user_id: staffUser.id });
    if (bootstrapError) throw bootstrapError;
    const reviewer = await authenticatedClient(staffEmail);
    await assureAdult(reviewer);
    const owner = await configureCreator(ownerEmail, ownerUser.id, reviewer);
    const performer = await configurePerformer(performerEmail, performerUser.id, reviewer);
    const supporter = await authenticatedClient(supporterEmail);
    await assureAdult(supporter);
    const fixture = await createLedgerFixture(owner, performer, supporter, ownerUser.id, performerUser.id);

    const { error: earlyPromotionError } = await reviewer.rpc("promote_project_earnings", {
      requested_project_public_id: fixture.projectPublicId,
      requested_idempotency_key: idempotency("s14-promotion-before-release"),
    });
    expect(earlyPromotionError).not.toBeNull();

    await login(page, performerEmail, "/app/earnings");
    await expect(page.getByRole("heading", { name: "Earnings" })).toBeVisible();
    const restrictedRow = page.getByRole("row").filter({ hasText: "Slice 14 journal payout project" });
    await expect(restrictedRow).toContainText("$45.00");
    await expect(restrictedRow).toContainText("$0.00");
    await expect(restrictedRow).toContainText("Not eligible yet");
    await expectNoFinanceSecrets(page, [fixture.privateBrief, ...Object.values(fixture.providerRefs)]);
    await expectNoHorizontalOverflow(page);
    await signOut(page);

    const assetSpecs = [
      ["final-release.mp4", "13"],
      ["poster.png", "14"],
      ["preview.mp4", "15"],
    ] as const;
    const assets: string[] = [];
    for (const [name, nibble] of assetSpecs) {
      const { data: asset, error: assetError } = await owner.rpc("register_production_asset", {
        requested_project_public_id: fixture.projectPublicId,
        requested_kind: "media",
        requested_object_path: `${fixture.projectPublicId}/private/${name}`,
        requested_sha256: nibble.repeat(64),
      });
      if (assetError || !asset?.publicId) throw assetError ?? new Error(`Slice 14 ${name} asset unavailable`);
      assets.push(String(asset.publicId));
    }
    const [finalAssetPublicId, posterAssetPublicId, previewAssetPublicId] = assets;
    const { data: delivery, error: deliveryError } = await owner.rpc("submit_final_delivery", {
      requested_project_public_id: fixture.projectPublicId,
      requested_asset_public_id: finalAssetPublicId,
      requested_idempotency_key: idempotency("s14-final-delivery"),
    });
    if (deliveryError || !delivery?.publicId) throw deliveryError ?? new Error("Slice 14 delivery unavailable");
    const deliveryPublicId = String(delivery.publicId);

    await login(page, ownerEmail, `/studio/projects/${fixture.projectPublicId}/production`);
    await expect(page.getByRole("heading", { name: "Slice 14 journal payout project" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Private assets" })).toBeVisible();
    await expect(page.getByText(finalAssetPublicId)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Slice 14 journal payout project" })).toBeVisible();
    await signOut(page);

    await login(page, staffEmail, `/workspace/staff/delivery-review/${fixture.projectPublicId}`);
    await expect(page.getByRole("heading", { name: "Required checklist" })).toBeVisible();
    await expect(page.getByText("Safety")).toBeVisible();
    await expect(page.getByText(/Approval remains blocked/)).toBeVisible();
    await signOut(page);

    const { error: processingError } = await reviewer.rpc("set_final_delivery_processing", {
      requested_delivery_public_id: deliveryPublicId,
      requested_state: "ready",
      requested_note: "Transcode, malware, and media checks completed",
    });
    if (processingError) throw processingError;
    for (const [item, note] of [
      ["legality", "Contract and legality evidence match"],
      ["consent", "Consent evidence matches the locked terms"],
      ["copyright", "Rights evidence matches the submitted media"],
      ["safety", "Release content passes the platform safety review"],
      ["quality", "Release media passes technical quality review"],
    ] as const) {
      const { error } = await reviewer.rpc("set_delivery_review_check", {
        requested_delivery_public_id: deliveryPublicId,
        requested_item_key: item,
        requested_state: "pass",
        requested_note: note,
      });
      if (error) throw error;
    }
    const { error: approvalError } = await performer.rpc("record_final_cut_approval", {
      requested_delivery_public_id: deliveryPublicId,
      requested_state: "approved",
      requested_note: "I approve this exact final cut for release",
    });
    if (approvalError) throw approvalError;
    const { error: reviewError } = await reviewer.rpc("decide_delivery_review", {
      requested_delivery_public_id: deliveryPublicId,
      requested_decision: "approve",
      requested_reason: "All release gates pass for this immutable version",
    });
    if (reviewError) throw reviewError;
    const { data: release, error: releaseError } = await owner.rpc("create_release", {
      requested_delivery_public_id: deliveryPublicId,
      requested_metadata: {
        title: "Slice 14 Premiere",
        synopsis: "Approved release metadata bound to one immutable final delivery.",
        posterAssetPublicId,
        previewAssetPublicId,
      },
      requested_idempotency_key: idempotency("s14-release"),
    });
    if (releaseError || !release?.publicId) throw releaseError ?? new Error("Slice 14 release unavailable");
    const releasePublicId = String(release.publicId);

    await login(page, supporterEmail, `/releases/${releasePublicId}`);
    await expect(page.getByRole("heading", { name: "Slice 14 Premiere" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ready to watch" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Watch securely" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Ready to watch" })).toBeVisible();
    await page.getByLabel("Copy URL").fill("https://copies.example/slice-14-premiere");
    await page.getByLabel("What did you find?").fill("A copied release appears to reproduce the approved final delivery.");
    await page.getByRole("button", { name: "Report copied release" }).click();
    await expect(page).toHaveURL(/notice=report/);
    await page.goto("/workspace/fan");
    await expect(page.getByRole("heading", { name: "Your released titles" })).toBeVisible();
    await expect(page.getByText("Slice 14 Premiere")).toBeVisible();
    await signOut(page);

    await login(page, ownerEmail, "/app/copyright");
    const rightsCard = page.locator("article.workspace-request-panel").filter({ hasText: "Slice 14 Premiere" });
    await expect(rightsCard).toHaveCount(1);
    await rightsCard.getByLabel("Rights basis").selectOption("owner");
    await rightsCard.getByLabel("Evidence reference").fill("evidence:slice-14-owner-contract");
    await rightsCard.getByLabel(/Manual perceptual fingerprint/).fill("phash:8f0a1134de89bc22");
    await rightsCard.getByRole("button", { name: "Register rights" }).click();
    await expect(page).toHaveURL(/notice=registered/);
    await expect(page.getByText("Registered", { exact: true })).toBeVisible();
    await signOut(page);

    await login(page, staffEmail, "/workspace/staff/copyright");
    const intakeRow = page.getByRole("row").filter({ hasText: "https://copies.example/slice-14-premiere" });
    await expect(intakeRow).toHaveCount(1);
    await intakeRow.getByLabel("Opening reason").fill("Reported copy requires audited source matching and rights review.");
    await intakeRow.getByRole("button", { name: "Open case" }).click();
    await expect(page).toHaveURL(/notice=opened/);
    let copyrightCase = page.locator("article.workspace-request-panel").filter({ hasText: "Slice 14 Premiere" }).filter({ hasText: "https://copies.example/slice-14-premiere" });
    await expect(copyrightCase).toHaveCount(1);
    const caseText = await copyrightCase.innerText();
    const copyrightCaseId = caseText.match(/cpy[0-9a-f]{24}/)?.[0];
    if (!copyrightCaseId) throw new Error("Copyright case public ID unavailable");

    await copyrightCase.getByLabel("Case action").selectOption("begin_matching");
    await copyrightCase.getByLabel("Audited reason").fill("Begin fingerprint comparison against the registered release.");
    await copyrightCase.getByRole("button", { name: "Apply transition" }).click();
    await expect(page).toHaveURL(/notice=updated/);
    copyrightCase = page.locator("article.workspace-request-panel").filter({ hasText: copyrightCaseId });
    await copyrightCase.getByLabel("Source match").selectOption("no_match");
    await copyrightCase.getByLabel("Match reason").fill("No supported source-session fingerprint matched the reported copy.");
    await copyrightCase.getByRole("button", { name: "Record match" }).click();
    await expect(page).toHaveURL(/notice=match/);

    copyrightCase = page.locator("article.workspace-request-panel").filter({ hasText: copyrightCaseId });
    await copyrightCase.getByLabel("Case action").selectOption("mark_false_positive");
    await copyrightCase.getByLabel("Audited reason").fill("Close as false positive after the audited source comparison found no supported match.");
    await copyrightCase.getByRole("button", { name: "Apply transition" }).click();
    await expect(page).toHaveURL(/notice=updated/);
    await signOut(page);

    await login(page, ownerEmail, "/app/copyright");
    const creatorCaseRow = page.getByRole("row").filter({ hasText: "https://copies.example/slice-14-premiere" });
    await expect(creatorCaseRow).toContainText("false positive");
    await signOut(page);

    const { data: promotion, error: promotionError } = await reviewer.rpc("promote_project_earnings", {
      requested_project_public_id: fixture.projectPublicId,
      requested_idempotency_key: idempotency("s14-promotion-after-release"),
    });
    if (promotionError) throw promotionError;
    expect(Number(promotion?.promotedMinor)).toBe(4500);

    await login(page, staffEmail, "/workspace/staff/finance");
    await expect(page.getByRole("heading", { name: "Finance queue" })).toBeVisible();
    await page.getByLabel("Project public ID", { exact: true }).nth(1).fill(fixture.projectPublicId);
    await page.getByLabel("Participant handle").fill(fixture.performerHandle);
    await page.getByLabel("Amount (minor units)").fill("1000");
    await page.getByLabel("Hold kind").selectOption("verification");
    await page.getByLabel("Reason").fill("Temporary payout verification review");
    await page.getByRole("button", { name: "Place hold" }).click();
    await expect(page.getByRole("status")).toContainText("Earnings hold placed");
    const holdRow = page.getByRole("row").filter({ hasText: `@${fixture.performerHandle}` }).filter({ hasText: "verification" });
    await expect(holdRow).toContainText("$10.00");
    await expectNoFinanceSecrets(page, [fixture.privateBrief, providerPayoutRef, ...Object.values(fixture.providerRefs)]);
    await expectNoHorizontalOverflow(page);
    await signOut(page);

    await login(page, performerEmail, "/app/earnings");
    const heldRow = page.getByRole("row").filter({ hasText: "Slice 14 journal payout project" });
    await expect(heldRow).toContainText("$35.00");
    await expect(heldRow).toContainText("$10.00");
    await expect(heldRow).toContainText("Not eligible yet");
    await signOut(page);

    await login(page, staffEmail, "/workspace/staff/finance");
    const openHold = page.getByRole("row").filter({ hasText: `@${fixture.performerHandle}` }).filter({ hasText: "verification" });
    await openHold.getByRole("button", { name: "Release" }).click();
    await expect(page.getByRole("status")).toContainText("Earnings hold released");
    await signOut(page);

    await login(page, performerEmail, "/app/earnings");
    const payoutForm = page.locator("form[data-payout-form]");
    await expect(payoutForm).toBeVisible();
    await payoutForm.getByLabel("Amount (minor units)").fill("1500");
    const payoutIdempotencyKey = await payoutForm.locator('input[name="idempotency_key"]').inputValue();
    await payoutForm.evaluate((node) => {
      const form = node as HTMLFormElement;
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(page.getByRole("status")).toContainText("Payout requested");
    const { data: payoutListAfterRequest, error: payoutListError } = await performer.rpc("list_my_payouts");
    if (payoutListError || !Array.isArray(payoutListAfterRequest) || !payoutListAfterRequest[0]?.publicId) {
      throw payoutListError ?? new Error("Slice 14 payout history unavailable");
    }
    const payoutPublicId = String(payoutListAfterRequest[0].publicId);
    expect(payoutListAfterRequest[0].state).toBe("requested");
    expect(Number(payoutListAfterRequest[0].amountMinor)).toBe(1500);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data: duplicateRequest, error: duplicateRequestError } = await performer.rpc("request_payout", {
        requested_project_public_id: fixture.projectPublicId,
        requested_amount_minor: 1500,
        requested_currency: "USD",
        requested_idempotency_key: payoutIdempotencyKey,
      });
      if (duplicateRequestError) throw duplicateRequestError;
      expect(duplicateRequest?.publicId).toBe(payoutPublicId);
    }
    const { data: projectRow, error: projectRowError } = await admin.from("projects").select("id").eq("public_id", fixture.projectPublicId).single();
    if (projectRowError || !projectRow?.id) throw projectRowError ?? new Error("Slice 14 project row unavailable");
    const { count: payoutCount, error: payoutCountError } = await admin.from("payout_requests").select("id", { count: "exact", head: true })
      .eq("project_id", projectRow.id).eq("participant_user_id", performerUser.id);
    if (payoutCountError) throw payoutCountError;
    expect(payoutCount).toBe(1);
    await expectNoFinanceSecrets(page, [fixture.privateBrief, providerPayoutRef, ...Object.values(fixture.providerRefs)]);
    await signOut(page);

    await login(page, staffEmail, "/workspace/staff/finance");
    await page.getByRole("button", { name: "Create batch" }).click();
    await expect(page.getByRole("status")).toContainText("Monthly payout batch created");
    const processingRow = page.getByRole("row").filter({ hasText: payoutPublicId });
    await expect(processingRow).toContainText("processing");
    const { data: firstQueue, error: firstQueueError } = await reviewer.rpc("list_finance_payout_queue");
    if (firstQueueError) throw firstQueueError;
    const firstQueuedPayout = firstQueue?.payouts?.find((row: { publicId?: string }) => row.publicId === payoutPublicId);
    const firstBatchPublicId = String(firstQueuedPayout?.batchPublicId ?? "");
    expect(firstBatchPublicId).toMatch(/^pbt[0-9a-f]{24}$/);

    const { data: mismatch, error: mismatchError } = await admin.rpc("apply_payout_provider_event", {
      requested_payout_public_id: payoutPublicId,
      requested_provider_key: "sandbox",
      requested_event_id: idempotency("s14-provider-mismatch"),
      requested_provider_payout_ref: providerPayoutRef,
      requested_state: "paid",
      requested_reported_amount_minor: 1499,
      requested_occurred_at: new Date().toISOString(),
      requested_signature_verified: true,
    });
    if (mismatchError) throw mismatchError;
    expect(mismatch?.ignored).toBe(true);
    await page.reload();
    await expect(page.getByText("payout_amount_mismatch")).toBeVisible();
    await expect(page.getByText("Provider-reported payout amount differs from the reserved payout amount.")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: payoutPublicId })).toContainText("processing");
    await expectNoFinanceSecrets(page, [fixture.privateBrief, providerPayoutRef, ...Object.values(fixture.providerRefs)]);

    const { data: failed, error: failedError } = await admin.rpc("apply_payout_provider_event", {
      requested_payout_public_id: payoutPublicId,
      requested_provider_key: "sandbox",
      requested_event_id: idempotency("s14-provider-failed"),
      requested_provider_payout_ref: providerPayoutRef,
      requested_state: "failed",
      requested_reported_amount_minor: 1500,
      requested_occurred_at: new Date().toISOString(),
      requested_signature_verified: true,
    });
    if (failedError) throw failedError;
    expect(failed?.state).toBe("failed");
    await signOut(page);

    await login(page, performerEmail, "/app/earnings");
    const failedPayoutRow = page.getByRole("row").filter({ hasText: "Slice 14 journal payout project" }).filter({ hasText: "failed" });
    await expect(failedPayoutRow).toContainText("1").catch(() => undefined);
    await failedPayoutRow.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("status")).toContainText("Payout retry queued");
    const { data: payoutAfterRetry, error: payoutAfterRetryError } = await performer.rpc("list_my_payouts");
    if (payoutAfterRetryError || !Array.isArray(payoutAfterRetry)) throw payoutAfterRetryError ?? new Error("Retry history unavailable");
    expect(payoutAfterRetry[0]?.state).toBe("requested");
    expect(Number(payoutAfterRetry[0]?.attemptCount)).toBe(1);
    await signOut(page);

    await login(page, staffEmail, "/workspace/staff/finance");
    await page.getByRole("button", { name: "Create batch" }).click();
    await expect(page.getByRole("status")).toContainText("Monthly payout batch created");
    const { data: secondQueue, error: secondQueueError } = await reviewer.rpc("list_finance_payout_queue");
    if (secondQueueError) throw secondQueueError;
    const secondQueuedPayout = secondQueue?.payouts?.find((row: { publicId?: string }) => row.publicId === payoutPublicId);
    const secondBatchPublicId = String(secondQueuedPayout?.batchPublicId ?? "");
    expect(secondBatchPublicId).toMatch(/^pbt[0-9a-f]{24}$/);
    expect(secondBatchPublicId).not.toBe(firstBatchPublicId);

    const { data: paid, error: paidError } = await admin.rpc("apply_payout_provider_event", {
      requested_payout_public_id: payoutPublicId,
      requested_provider_key: "sandbox",
      requested_event_id: idempotency("s14-provider-paid"),
      requested_provider_payout_ref: providerPayoutRef,
      requested_state: "paid",
      requested_reported_amount_minor: 1500,
      requested_occurred_at: new Date().toISOString(),
      requested_signature_verified: true,
    });
    if (paidError) throw paidError;
    expect(paid?.state).toBe("paid");
    await expectNoFinanceSecrets(page, [fixture.privateBrief, providerPayoutRef, ...Object.values(fixture.providerRefs)]);
    await signOut(page);

    await login(page, performerEmail, "/app/earnings");
    await page.reload();
    const paidPayoutRow = page.getByRole("row").filter({ hasText: "Slice 14 journal payout project" }).filter({ hasText: "paid" });
    await expect(paidPayoutRow).toContainText("$15.00");
    await expect(paidPayoutRow).toContainText("1");
    await expectNoFinanceSecrets(page, [fixture.privateBrief, providerPayoutRef, ...Object.values(fixture.providerRefs)]);
    await expectNoHorizontalOverflow(page);
    await page.goto("/app/funding");
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Earnings" })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("heading", { name: "Funding dashboard" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Earnings" })).toBeVisible();

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const statementUrl = `/app/earnings/statement?project=${encodeURIComponent(fixture.projectPublicId)}&from=${monthStart}&to=${today}`;
    const csv = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`statement status ${response.status}`);
      return response.text();
    }, statementUrl);
    expect(csv).toContain("projectPublicId,journalPublicId,kind,currency,account,side,amountMinor,occurredAt");
    expect(csv).toContain(fixture.projectPublicId);
    expect(csv).not.toMatch(/(?:txn|cus|pm|po)_sbx_/i);
    expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(csv).not.toMatch(/\/private\//i);
    expect(csv).not.toContain(fixture.privateBrief);

    const { data: auditRows, error: auditError } = await admin.from("audit_events")
      .select("event_type,actor_user_id,details")
      .contains("details", { projectPublicId: fixture.projectPublicId });
    if (auditError) throw auditError;
    const eventTypes = new Set((auditRows ?? []).map((row) => row.event_type));
    for (const expectedType of [
      "project_revenue_rules_configured",
      "payment_ledger_synced",
      "project_earnings_promoted",
      "earnings_hold_placed",
      "earnings_hold_released",
      "payout_requested",
      "payout_reconciliation_case_opened",
      "payout_provider_event_applied",
      "payout_retried",
    ]) expect(eventTypes.has(expectedType), `missing project audit event ${expectedType}`).toBe(true);
    const { data: batchAudits, error: batchAuditError } = await admin.from("audit_events")
      .select("event_type,actor_user_id,details")
      .eq("event_type", "monthly_payout_batch_created")
      .eq("actor_user_id", staffUser.id);
    if (batchAuditError) throw batchAuditError;
    const batchIds = new Set((batchAudits ?? []).map((row) => String(row.details?.batchPublicId ?? "")));
    expect(batchIds.has(firstBatchPublicId)).toBe(true);
    expect(batchIds.has(secondBatchPublicId)).toBe(true);
  } finally {
    await Promise.all([
      admin.auth.admin.deleteUser(ownerUser.id),
      admin.auth.admin.deleteUser(performerUser.id),
      admin.auth.admin.deleteUser(supporterUser.id),
      admin.auth.admin.deleteUser(staffUser.id),
    ]);
  }
});
