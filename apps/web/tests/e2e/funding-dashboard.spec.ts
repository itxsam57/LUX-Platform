import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Slice 10 funding E2E requires isolated Supabase service configuration");
}
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = "LuxSecureTest123";
const RESULT_EXPIRY = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
function email(prefix: string, testInfo: TestInfo) { return `${prefix}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}@lux.test`; }
async function createUser(address: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: address, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Slice 10 test user unavailable");
  return data.user;
}
async function authenticatedClient(address: string): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl!, publishableKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (error) throw error;
  return client;
}
async function assureAdult(client: SupabaseClient) {
  const { error } = await client.rpc("confirm_adult_attestation", { jurisdiction_code: "PK", policy_version: "s10-e2e" });
  if (error) throw error;
}
async function configureVerifiedCreator(ownerEmail: string, ownerId: string, testInfo: TestInfo) {
  const ownerClient = await authenticatedClient(ownerEmail);
  await assureAdult(ownerClient);
  const { data: membershipId, error: requestError } = await ownerClient.rpc("request_workspace_role", { requested_role: "creator" });
  if (requestError || typeof membershipId !== "string") throw requestError ?? new Error("Creator request unavailable");
  const adminEmail = email("s10-admin", testInfo);
  const superAdmin = await createUser(adminEmail);
  try {
    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", { target_user_id: superAdmin.id });
    if (bootstrapError) throw bootstrapError;
    const reviewer = await authenticatedClient(adminEmail);
    const { error: reviewError } = await reviewer.rpc("review_workspace_request", { target_membership_id: membershipId, decision: "approved" });
    if (reviewError) throw reviewError;
    const { error: activateError } = await ownerClient.rpc("activate_workspace", { target_membership_id: membershipId });
    if (activateError) throw activateError;
    const { data: sessionId, error: startError } = await ownerClient.rpc("start_verification", {
      requested_level: "v2", requested_provider_key: "synthetic", requested_provider_reference: `s10-v2:${ownerId}`,
      requested_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), requested_synthetic: true,
    });
    if (startError || typeof sessionId !== "string") throw startError ?? new Error("V2 session unavailable");
    const { error: resultError } = await reviewer.rpc("apply_verification_result", {
      target_session_id: sessionId, decision: "verified", requested_result_expires_at: RESULT_EXPIRY(),
      requested_liveness_passed: true, requested_risk_screen_passed: true, requested_recheck_reason: null,
    });
    if (resultError) throw resultError;
  } finally { await admin.auth.admin.deleteUser(superAdmin.id); }
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
  const { data: profile, error: profileError } = await ownerClient.from("profiles").select("handle").eq("user_id", ownerId).single();
  if (profileError || !profile?.handle) throw profileError ?? new Error("Creator handle unavailable");
  const { data: project, error: projectError } = await ownerClient.rpc("create_project_draft", { project_input: {
    title: "Slice 10 funding lifecycle project", publicSynopsis: "A public synopsis for the Slice 10 supporter funding lifecycle dashboard.",
    privateBrief: "PRIVATE FUNDING FIXTURE BRIEF MUST NEVER APPEAR IN SUPPORTER UI", category: "concept", format: "video",
    boundaries: ["closed-set"], compensationModel: "fixed", distributionScope: "platform-only", rightsDeclarations: ["original-concept"],
  }});
  if (projectError || !project?.publicId) throw projectError ?? new Error("Project fixture unavailable");
  const projectPublicId = String(project.publicId);
  const { data: terms, error: termsError } = await ownerClient.rpc("publish_project_terms", {
    requested_project_public_id: projectPublicId, expected_project_revision: 1, requested_terms: {
      participants: [{ handle: profile.handle, role: "creator", depicted: false }], role: "creator", boundaries: ["closed-set"], collaborators: [],
      compensation: "fixed:10000:USD", distributionScope: "platform-only", rightsScope: "streaming-only", schedule: "January to March 2027",
      cancellation: "Either party may leave before contract lock", finalCutApprovalRequired: true,
    },
  });
  if (termsError || !terms?.hash) throw termsError ?? new Error("Terms fixture unavailable");
  const termsHash = String(terms.hash);
  const { error: acceptError } = await ownerClient.rpc("accept_project_terms", { requested_project_public_id: projectPublicId, requested_terms_hash: termsHash, step_up_proof: "step-up-confirmed" });
  if (acceptError) throw acceptError;
  const { error: lockError } = await ownerClient.rpc("lock_project_contract", { requested_project_public_id: projectPublicId, requested_terms_hash: termsHash });
  if (lockError) throw lockError;
  return projectPublicId;
}
async function fundedFixture(ownerClient: SupabaseClient, supporterClient: SupabaseClient, ownerId: string) {
  const projectPublicId = await lockedProject(ownerClient, ownerId);
  const { data: campaign, error: campaignError } = await ownerClient.rpc("save_campaign_draft", { requested_project_public_id: projectPublicId, requested_terms: {
    fundingTargetMinor: 250000, currency: "USD", deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), expectedDeliveryWindow: "January to March 2027",
    guarantees: ["One completed platform release"], optionalChoices: ["Creator-approved poster vote"],
    refundRules: "If the campaign fails or is cancelled, the permitted refund path is shown before confirmation.",
    materialChangeRules: "Material campaign changes require a new version and fresh supporter action where applicable.",
  }});
  if (campaignError || !campaign?.publicId) throw campaignError ?? new Error("Campaign fixture unavailable");
  const campaignPublicId = String(campaign.publicId);
  const { error: submitError } = await ownerClient.rpc("submit_campaign_for_publish", { requested_campaign_public_id: campaignPublicId, expected_terms_version: 1 });
  if (submitError) throw submitError;
  const { error: publishError } = await ownerClient.rpc("publish_campaign", { requested_campaign_public_id: campaignPublicId, expected_terms_version: 1 });
  if (publishError) throw publishError;
  const { data: commitment, error: prebookError } = await supporterClient.rpc("create_prebook", {
    requested_campaign_public_id: campaignPublicId, requested_amount_minor: 5000, requested_supporter_visibility: "anonymous",
    requested_badge_choice: "founding-supporter", requested_idempotency_key: `s10-e2e:${crypto.randomUUID()}`,
  });
  if (prebookError || !commitment?.publicId) throw prebookError ?? new Error("Funding commitment unavailable");
  const commitmentPublicId = String(commitment.publicId);
  const processorSuffix = commitmentPublicId.slice(3);
  const { error: paymentError } = await admin.rpc("record_payment_transition", {
    requested_commitment_public_id: commitmentPublicId, requested_provider_key: "sandbox", requested_customer_ref: `cus_sbx_${processorSuffix}`,
    requested_payment_method_ref: `pm_sbx_${processorSuffix}`, requested_transaction_ref: `txn_sbx_${processorSuffix}`, requested_state: "authorized",
    requested_authorized_minor: 5000, requested_captured_minor: 0, requested_refunded_minor: 0, requested_idempotency_key: `payment:${crypto.randomUUID()}`,
  });
  if (paymentError) throw paymentError;
  return { projectPublicId, campaignPublicId, commitmentPublicId };
}
async function expectNoSensitiveFundingIds(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/(?:txn|cus|pm)_sbx_/i);
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(text).not.toContain("PRIVATE FUNDING FIXTURE BRIEF MUST NEVER APPEAR IN SUPPORTER UI");
}
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("fan funding dashboard preserves private, truthful payment and change state", async ({ page }, testInfo) => {
  const ownerEmail = email("s10-owner", testInfo); const supporterEmail = email("s10-supporter", testInfo);
  const owner = await createUser(ownerEmail); const supporter = await createUser(supporterEmail);
  try {
    const ownerClient = await configureVerifiedCreator(ownerEmail, owner.id, testInfo);
    const supporterClient = await authenticatedClient(supporterEmail); await assureAdult(supporterClient);
    const fixture = await fundedFixture(ownerClient, supporterClient, owner.id);
    await login(page, supporterEmail, "/app/funding");
    await expect(page.getByRole("heading", { name: "Funding dashboard" })).toBeVisible();
    for (const tab of ["Active", "Successful", "Refunded", "All"]) await expect(page.getByRole("link", { name: tab })).toBeVisible();
    await expect(page.getByText("Slice 10 funding lifecycle project")).toBeVisible();
    await expect(page.locator(".funding-state").filter({ hasText: /^authorized$/ })).toBeVisible();
    await expect(page.getByText(/sandbox.*not production/i)).toBeVisible();
    await expectNoSensitiveFundingIds(page); await expectNoHorizontalOverflow(page);
    await page.getByRole("link", { name: "Successful" }).click(); await expect(page.getByText("No successful funding yet")).toBeVisible();
    await page.getByRole("link", { name: "Refunded" }).click(); await expect(page.getByText("No refunded funding yet")).toBeVisible();
    await page.getByRole("link", { name: "All" }).click(); await expect(page.getByText("Slice 10 funding lifecycle project")).toBeVisible();
    await page.getByRole("link", { name: "View funding" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/funding/${fixture.commitmentPublicId}$`));
    await expect(page.getByRole("heading", { name: "Slice 10 funding lifecycle project" })).toBeVisible();
    await expect(page.getByText(/sandbox.*not production revenue/i)).toBeVisible(); await expectNoSensitiveFundingIds(page);
    await page.getByLabel("Supporter badge").fill("founding-supporter"); await page.getByLabel("Badge visibility").selectOption("public");
    await page.getByRole("button", { name: "Save badge" }).click(); await expect(page.getByRole("status")).toContainText("Badge updated");
    await page.reload(); await expect(page.locator(".funding-current-badge")).toContainText(/founding-supporter.*public badge/i);
    const { data: changedTerms, error: changeError } = await admin.rpc("register_funding_material_change", {
      requested_commitment_public_id: fixture.commitmentPublicId, requested_expected_delivery_window: "April to June 2027",
      requested_reason: "Delivery window changed after the original commitment.", requested_idempotency_key: `change:${crypto.randomUUID()}`,
    });
    if (changeError || !changedTerms?.termsVersion || !changedTerms?.termsHash) throw changeError ?? new Error("Material change fixture unavailable");
    await page.reload(); await expect(page.getByRole("heading", { name: "Campaign terms changed" })).toBeVisible();
    await expect(page.getByText("January to March 2027")).toBeVisible(); await expect(page.getByText("April to June 2027")).toBeVisible();
    await page.getByRole("button", { name: "Accept changed terms" }).click(); await expect(page.getByRole("status")).toContainText("Changed terms accepted");
    const refundForm = page.locator("form[data-refund-form]");
    await refundForm.getByLabel("Refund amount (minor units)").fill("1500"); await refundForm.getByLabel("Refund reason").fill("Campaign no longer fits my needs");
    await refundForm.evaluate((node) => { const form = node as HTMLFormElement; form.requestSubmit(); form.requestSubmit(); });
    await expect(page.getByRole("status")).toContainText("Refund requested"); await expect(page.getByText(/1500/)).toBeVisible();
    const captureSuffix = fixture.commitmentPublicId.slice(3);
    const { error: captureError } = await admin.rpc("record_payment_transition", {
      requested_commitment_public_id: fixture.commitmentPublicId, requested_provider_key: "sandbox", requested_customer_ref: `cus_sbx_${captureSuffix}`,
      requested_payment_method_ref: `pm_sbx_${captureSuffix}`, requested_transaction_ref: `txn_sbx_${captureSuffix}`, requested_state: "captured",
      requested_authorized_minor: 5000, requested_captured_minor: 5000, requested_refunded_minor: 0, requested_idempotency_key: `capture:${crypto.randomUUID()}`,
    });
    if (captureError) throw captureError;
    await page.goto("/app/funding?status=successful"); await expect(page.getByText("Slice 10 funding lifecycle project")).toBeVisible();
    await expect(page.locator(".funding-state").filter({ hasText: /^captured$/ })).toBeVisible(); await expectNoSensitiveFundingIds(page); await expectNoHorizontalOverflow(page);
  } finally { await admin.auth.admin.deleteUser(owner.id); await admin.auth.admin.deleteUser(supporter.id); }
});