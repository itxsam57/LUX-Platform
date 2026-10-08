import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { cleanupTestUser } from "./test-user-cleanup";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Agency workflow E2E requires isolated Supabase service configuration");
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = "LuxSecureTest123";

function email(prefix: string, testInfo: TestInfo) {
  return `${prefix}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}@lux.test`;
}

async function createUser(address: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: address, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Agency workflow user unavailable");
  return data.user;
}

async function client(address: string): Promise<SupabaseClient> {
  const value = createClient(supabaseUrl!, publishableKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await value.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (error) throw error;
  return value;
}

async function assureAdult(value: SupabaseClient) {
  const { error } = await value.rpc("confirm_adult_attestation", { jurisdiction_code: "PK", policy_version: "agency-e2e" });
  if (error) throw error;
}

async function requestApproveActivate(value: SupabaseClient, reviewer: SupabaseClient, role: "agency" | "performer") {
  const { data: membershipId, error: requestError } = await value.rpc("request_workspace_role", { requested_role: role });
  if (requestError || typeof membershipId !== "string") throw requestError ?? new Error(`${role} request unavailable`);
  const { error: reviewError } = await reviewer.rpc("review_workspace_request", {
    target_membership_id: membershipId,
    decision: "approved",
  });
  if (reviewError) throw reviewError;
  const { error: activateError } = await value.rpc("activate_workspace", { target_membership_id: membershipId });
  if (activateError) throw activateError;
}

async function profileHandle(value: SupabaseClient, userId: string) {
  const { data, error } = await value.from("profiles").select("handle").eq("user_id", userId).single();
  if (error || !data?.handle) throw error ?? new Error("Profile handle unavailable");
  return String(data.handle);
}

async function login(page: Page, address: string, target: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (page.url().includes("/age-assurance")) {
    await page.getByLabel("Country code").fill("PK");
    await page.getByLabel(/I confirm that I am at least 18 years old/).check();
    await page.getByRole("button", { name: "Confirm and continue" }).click();
  }
  await expect.poll(() => new URL(page.url()).pathname).toBe(target);
}

async function secondary(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  return browser.newContext(testInfo.project.use);
}

test.describe.configure({ mode: "default" });

test("agency representation is performer-controlled from invitation through revocation", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const agencyEmail = email("agency-owner", testInfo);
  const performerEmail = email("agency-performer", testInfo);
  const staffEmail = email("agency-reviewer", testInfo);
  const agencyUser = await createUser(agencyEmail);
  const performerUser = await createUser(performerEmail);
  const staffUser = await createUser(staffEmail);
  const agencyContext = await secondary(browser, testInfo);
  const agencyPage = await agencyContext.newPage();

  try {
    const agency = await client(agencyEmail);
    const performer = await client(performerEmail);
    const reviewer = await client(staffEmail);
    await assureAdult(agency);
    await assureAdult(performer);
    await assureAdult(reviewer);
    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", { target_user_id: staffUser.id });
    if (bootstrapError) throw bootstrapError;

    await requestApproveActivate(agency, reviewer, "agency");
    await requestApproveActivate(performer, reviewer, "performer");
    const performerHandle = await profileHandle(performer, performerUser.id);

    const { data: agencyProfile, error: profileError } = await agency.rpc("ensure_agency_profile", {
      requested_display_name: "Masterplan Agency Test",
      requested_jurisdiction_code: "PK",
    });
    if (profileError || !agencyProfile?.publicId) throw profileError ?? new Error("Agency profile unavailable");
    const agencyPublicId = String(agencyProfile.publicId);

    const { error: submitError } = await agency.rpc("submit_agency_verification", {
      requested_agency_public_id: agencyPublicId,
      requested_provider: "synthetic-review",
      requested_evidence_reference: "evidence:agency-e2e",
    });
    if (submitError) throw submitError;
    const { error: reviewError } = await reviewer.rpc("review_agency_verification", {
      requested_agency_public_id: agencyPublicId,
      requested_decision: "approved",
      requested_reason: "Isolated E2E agency verification accepted",
    });
    if (reviewError) throw reviewError;

    const { data: invitation, error: invitationError } = await agency.rpc("invite_performer_representation", {
      requested_performer_handle: performerHandle,
      requested_terms: {
        communications: true,
        opportunities: true,
        negotiations: true,
        projectAdmin: false,
        contractAdmin: false,
        earningsVisibility: false,
        commissionBasisPoints: 0,
        revocationNoticeDays: 0,
      },
    });
    if (invitationError || !invitation?.publicId) throw invitationError ?? new Error("Representation invitation unavailable");
    const agreementId = String(invitation.publicId);

    await login(page, performerEmail, "/app/representation");
    const performerAgreement = page.locator("article").filter({ hasText: "Masterplan Agency Test" }).filter({ hasText: agreementId });
    await expect(performerAgreement).toContainText("proposed");
    await expect(page.getByText(/Agency access never grants consent or final-cut authority/i)).toBeVisible();
    await performerAgreement.getByRole("button", { name: "Accept these exact terms" }).click();
    await expect(page).toHaveURL(/notice=accept/);
    await page.reload();
    await expect(page.locator("article").filter({ hasText: agreementId })).toContainText("accepted");

    await login(agencyPage, agencyEmail, "/workspace/agency");
    await expect(agencyPage.getByRole("heading", { name: "Masterplan Agency Test" })).toBeVisible();
    const agencyAgreement = agencyPage.getByRole("row").filter({ hasText: agreementId });
    await expect(agencyAgreement).toContainText("accepted");
    await expect(agencyAgreement).toContainText(performerHandle);

    await agencyPage.getByLabel("Representation agreement ID").fill(agreementId);
    await agencyPage.getByLabel("Opportunity title").fill("Creator-controlled performance opportunity");
    await agencyPage.getByLabel("Opportunity summary").fill("A scoped opportunity that remains subject to performer negotiation and personal project consent.");
    await agencyPage.getByRole("button", { name: "Create opportunity" }).click();
    await expect(agencyPage.getByText("Creator-controlled performance opportunity")).toBeVisible();

    await page.reload();
    const acceptedAgreement = page.locator("article").filter({ hasText: agreementId });
    await acceptedAgreement.getByLabel("Revocation reason").fill("Performer chooses to end agency representation.");
    await acceptedAgreement.getByRole("button", { name: /revoke/i }).click();
    await expect(page).toHaveURL(/notice=revoked/);
    await page.reload();
    await expect(page.locator("article").filter({ hasText: agreementId })).toContainText("revoked");

    await agencyPage.reload();
    await expect(agencyPage.getByRole("row").filter({ hasText: agreementId })).toContainText("revoked");
    const { error: postRevocationError } = await agency.rpc("create_agency_opportunity", {
      requested_agreement_public_id: agreementId,
      requested_title: "Forbidden post-revocation opportunity",
      requested_summary: "This must be rejected because performer authority was revoked.",
    });
    expect(postRevocationError).not.toBeNull();
  } finally {
    await agencyContext.close();
    await cleanupTestUser(admin, agencyUser.id);
    await cleanupTestUser(admin, performerUser.id);
    await cleanupTestUser(admin, staffUser.id);
  }
});
