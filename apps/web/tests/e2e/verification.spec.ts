import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error(
    "Verification E2E requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const testSupabaseUrl: string = supabaseUrl;
const testPublishableKey: string = publishableKey;
const testServiceRoleKey: string = serviceRoleKey;

const admin = createClient(testSupabaseUrl, testServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "LuxSecureTest123";

function testEmail(prefix: string, testInfo: TestInfo) {
  const project = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const stamp = `${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${project}-${stamp}@lux.test`;
}

async function createConfirmedUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Confirmed verification test user was not created.");
  return data.user;
}

async function removeUser(userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

async function bootstrapSuperAdmin(userId: string) {
  const { error } = await admin.rpc("bootstrap_super_admin", { target_user_id: userId });
  if (error) throw error;
}

async function createAuthenticatedUserClient(email: string) {
  const client = createClient(testSupabaseUrl, testPublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function readOwnVerificationSummary(email: string) {
  const client = await createAuthenticatedUserClient(email);
  const { data, error } = await client.rpc("get_my_verification_summary");
  if (error) throw error;
  return data;
}

async function readOwnHandle(email: string, userId: string) {
  const client = await createAuthenticatedUserClient(email);
  const { data, error } = await client
    .from("profiles")
    .select("handle")
    .eq("user_id", userId)
    .single();
  if (error || !data?.handle) throw error ?? new Error("Verification test profile handle was unavailable.");
  return data.handle;
}

async function loginAndAssure(page: Page, email: string, target: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent("/workspace/fan")}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/age-assurance/);
  await page.getByLabel("Country code").fill("PK");
  await page.getByLabel(/I confirm that I am at least 18 years old/).check();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page).toHaveURL(/\/workspace\/fan$/);
  await page.goto(target);
  await expect(page).toHaveURL(new RegExp(`${target.replaceAll("/", "\\/")}$`));
}

async function openSecondaryContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  return browser.newContext(testInfo.project.use);
}

function verificationRow(page: Page, handle: string, level: "V2" | "V3") {
  return page.getByRole("row").filter({ hasText: handle }).filter({ hasText: level });
}

async function expectReviewerMutationCompleted(
  page: Page,
  notice: "approve" | "complete_performer" | "revoke" | "expire",
) {
  await expect(page).toHaveURL(new RegExp(`/workspace/staff/verification\\?notice=${notice}$`));
  await expect(page.getByRole("status")).toHaveText("Verification review completed.");
}

test.describe.configure({ mode: "default" });

test("adult-assured user can start synthetic V2 without self-promoting", async ({ page }, testInfo) => {
  const email = testEmail("verification-v2", testInfo);
  const user = await createConfirmedUser(email);

  try {
    await loginAndAssure(page, email, "/settings/verification");

    await expect(page.getByRole("heading", { name: "Identity and performer verification" })).toBeVisible();
    await expect(page.getByText("Synthetic development verification")).toBeVisible();
    await expect(page.getByTestId("verification-v2-status")).toHaveText("Not started");

    await page.getByRole("button", { name: "Start development V2" }).click();

    await expect(page.getByTestId("verification-v2-status")).toHaveText("Pending review");
    await expect(page.getByText(/development-only workflow/i)).toBeVisible();

    const summary = await readOwnVerificationSummary(email);
    expect(summary?.v2?.status).toBe("pending");
    expect(summary?.v2?.current).toBe(false);
    expect(summary?.v2?.verifiedAt).toBeNull();
  } finally {
    await removeUser(user.id);
  }
});

test("verification review surface denies ordinary users and admits super-admin reviewers", async ({ page, browser }, testInfo) => {
  const fanEmail = testEmail("verification-review-fan", testInfo);
  const adminEmail = testEmail("verification-review-admin", testInfo);
  const fan = await createConfirmedUser(fanEmail);
  const superAdmin = await createConfirmedUser(adminEmail);
  const adminContext = await openSecondaryContext(browser, testInfo);
  const adminPage = await adminContext.newPage();

  try {
    await loginAndAssure(page, fanEmail, "/workspace/fan");
    await page.goto("/workspace/staff/verification");
    await expect(page).toHaveURL(/\/access-denied\?route=staff-verification/);

    await bootstrapSuperAdmin(superAdmin.id);
    await loginAndAssure(adminPage, adminEmail, "/workspace/staff");
    await adminPage.goto("/workspace/staff/verification");
    await expect(adminPage.getByRole("heading", { name: "Verification review queue" })).toBeVisible();
  } finally {
    await adminContext.close();
    await removeUser(fan.id);
    await removeUser(superAdmin.id);
  }
});

test("reviewed synthetic V3 exposes only a safe public badge and revoke or expiry removes current state", async ({ page, browser }, testInfo) => {
  const subjectEmail = testEmail("verification-v3-subject", testInfo);
  const adminEmail = testEmail("verification-v3-admin", testInfo);
  const subject = await createConfirmedUser(subjectEmail);
  const superAdmin = await createConfirmedUser(adminEmail);
  const adminContext = await openSecondaryContext(browser, testInfo);
  const publicContext = await openSecondaryContext(browser, testInfo);
  const adminPage = await adminContext.newPage();
  const publicPage = await publicContext.newPage();

  try {
    await bootstrapSuperAdmin(superAdmin.id);
    const handle = await readOwnHandle(subjectEmail, subject.id);

    await loginAndAssure(page, subjectEmail, "/settings/verification");
    await page.getByRole("button", { name: "Start development V2" }).click();
    await expect(page.getByTestId("verification-v2-status")).toHaveText("Pending review");

    await loginAndAssure(adminPage, adminEmail, "/workspace/staff");
    await adminPage.goto("/workspace/staff/verification");
    await verificationRow(adminPage, handle, "V2").getByRole("button", { name: "Approve V2" }).click();
    await expectReviewerMutationCompleted(adminPage, "approve");

    await page.goto("/settings/verification");
    await expect(page.getByTestId("verification-v2-status")).toHaveText("Verified");
    await page.getByRole("button", { name: "Acknowledge consent education" }).click();
    await expect(page.getByTestId("verification-consent-status")).toHaveText("Acknowledged");

    await adminPage.goto("/workspace/staff/verification");
    await verificationRow(adminPage, handle, "V2")
      .getByRole("button", { name: "Complete performer prerequisites" })
      .click();
    await expectReviewerMutationCompleted(adminPage, "complete_performer");

    await page.goto("/settings/verification");
    await expect(page.getByRole("button", { name: "Start development V3" })).toBeEnabled();
    await page.getByRole("button", { name: "Start development V3" }).click();
    await expect(page.getByTestId("verification-v3-status")).toHaveText("Pending review");

    await adminPage.goto("/workspace/staff/verification");
    await verificationRow(adminPage, handle, "V3").getByRole("button", { name: "Approve V3" }).click();
    await expectReviewerMutationCompleted(adminPage, "approve");

    await page.goto("/settings/verification");
    await expect(page.getByTestId("verification-v3-status")).toHaveText("Verified");

    await publicPage.goto(`/u/${handle}`);
    await expect(publicPage.getByTestId("public-verification-badge")).toHaveText("V3 verified");
    await expect(publicPage.locator("body")).not.toContainText(subject.id);
    await expect(publicPage.locator("body")).not.toContainText(/provider_reference|provider reference|synthetic:/i);

    await adminPage.goto("/workspace/staff/verification");
    await verificationRow(adminPage, handle, "V3").getByRole("button", { name: "Revoke V3" }).click();
    await expectReviewerMutationCompleted(adminPage, "revoke");

    await publicPage.reload();
    await expect(publicPage.getByTestId("public-verification-badge")).toHaveText("V2 verified");

    await adminPage.goto("/workspace/staff/verification");
    await verificationRow(adminPage, handle, "V2").getByRole("button", { name: "Expire V2" }).click();
    await expectReviewerMutationCompleted(adminPage, "expire");

    await publicPage.reload();
    await expect(publicPage.getByTestId("public-verification-badge")).toHaveCount(0);
  } finally {
    await adminContext.close();
    await publicContext.close();
    await removeUser(subject.id);
    await removeUser(superAdmin.id);
  }
});