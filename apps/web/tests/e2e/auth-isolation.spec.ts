import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Auth E2E requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "LuxSecureTest123";
const NEW_PASSWORD = "LuxSecureChanged456";

function testEmail(prefix: string, testInfo: TestInfo) {
  const project = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const stamp = `${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${project}-${stamp}@lux.test`;
}

async function createConfirmedUser(email: string, password = PASSWORD) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Confirmed test user was not created.");
  return data.user;
}

async function removeUser(userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

async function login(page: Page, email: string, password = PASSWORD, next?: string) {
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";
  await page.goto(`/auth/login${suffix}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function confirmAdultAccess(page: Page, expectedPath: RegExp) {
  await expect(page).toHaveURL(/\/age-assurance/);
  await page.getByLabel("Country code").fill("PK");
  await page.getByLabel(/I confirm that I am at least 18 years old/).check();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function loginAndAssure(page: Page, email: string, target = "/workspace/fan") {
  await login(page, email, PASSWORD, target);
  await confirmAdultAccess(page, new RegExp(target.replaceAll("/", "\\/")));
}

async function openSecondaryContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  return browser.newContext(testInfo.project.use);
}

async function approveCreatorRequest(adminPage: Page, requestedUserId: string) {
  await adminPage.goto("/workspace/staff/role-requests");
  const row = adminPage.getByRole("row").filter({ hasText: requestedUserId.slice(0, 8) });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(adminPage).toHaveURL(/notice=approved/);
}

test.describe.configure({ mode: "default" });

test("sign-up uses safe validation and a generic verification response", async ({ page }, testInfo) => {
  const email = testEmail("signup", testInfo);
  let createdUserId: string | null = null;

  try {
    await page.goto("/auth/sign-up");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("weak");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("auth-form-message")).toContainText("Check the highlighted fields");

    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("auth-form-message")).toContainText("Check your email for the verification link");

    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    createdUserId = data.users.find((user) => user.email === email)?.id ?? null;
    expect(createdUserId).not.toBeNull();
  } finally {
    if (createdUserId) await removeUser(createdUserId);
  }
});

test("fan, pending creator, approved creator, and staff routes remain isolated", async ({ page, browser }, testInfo) => {
  const fanEmail = testEmail("fan", testInfo);
  const adminEmail = testEmail("admin", testInfo);
  const fan = await createConfirmedUser(fanEmail);
  const superAdmin = await createConfirmedUser(adminEmail);
  const adminContext = await openSecondaryContext(browser, testInfo);
  const adminPage = await adminContext.newPage();

  try {
    await page.goto("/workspace/fan");
    await expect(page).toHaveURL(/\/auth\/login\?next=/);

    await login(page, fanEmail, PASSWORD, "/workspace/fan");
    await confirmAdultAccess(page, /\/workspace\/fan$/);
    await expect(page.getByRole("heading", { name: "Fan workspace" })).toBeVisible();

    await page.goto("/workspace/creator");
    await expect(page).toHaveURL(/\/access-denied\?route=workspace-creator/);

    await page.goto("/workspace");
    await page.getByRole("button", { name: "Request creator access" }).click();
    await expect(page).toHaveURL(/notice=creator-requested/);
    await expect(page.getByRole("button", { name: "Awaiting approval" })).toBeDisabled();

    await page.goto("/workspace/creator");
    await expect(page).toHaveURL(/\/access-denied\?route=workspace-creator/);

    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", {
      target_user_id: superAdmin.id,
    });
    if (bootstrapError) throw bootstrapError;

    await login(adminPage, adminEmail, PASSWORD, "/workspace/staff");
    await confirmAdultAccess(adminPage, /\/workspace\/staff$/);
    await approveCreatorRequest(adminPage, fan.id);

    await page.goto("/workspace");
    const creatorCard = page.getByRole("region", { name: "Creator workspace" });
    await creatorCard.getByRole("button", { name: "Activate Creator" }).click();
    await expect(page).toHaveURL(/\/workspace\/creator$/);
    await expect(page.getByRole("heading", { name: "Creator workspace" })).toBeVisible();

    await page.goto("/workspace/staff");
    await expect(page).toHaveURL(/\/access-denied\?route=workspace-staff/);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Creator workspace" })).toBeVisible();
  } finally {
    await adminContext.close();
    await removeUser(fan.id);
    await removeUser(superAdmin.id);
  }
});

test("logout all devices invalidates old sessions and accepts an immediate new login", async ({ page, browser }, testInfo) => {
  const email = testEmail("sessions", testInfo);
  const user = await createConfirmedUser(email);
  const secondContext = await openSecondaryContext(browser, testInfo);
  const secondPage = await secondContext.newPage();

  try {
    await loginAndAssure(page, email);
    await login(secondPage, email, PASSWORD, "/workspace/fan");
    await expect(secondPage).toHaveURL(/\/workspace\/fan$/);

    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Sign out all devices" }).click();
    await expect(page).toHaveURL(/all-devices-signed-out/);

    await secondPage.goto("/workspace/fan");
    await expect(secondPage).toHaveURL(/\/auth\/login\?next=%2Fworkspace%2Ffan/);

    await login(secondPage, email, PASSWORD, "/workspace/fan");
    await expect(secondPage).toHaveURL(/\/workspace\/fan$/);
    await expect(secondPage.getByRole("heading", { name: "Fan workspace" })).toBeVisible();
  } finally {
    await secondContext.close();
    await removeUser(user.id);
  }
});

test("password recovery changes the password and rejects the old password", async ({ page, browser }, testInfo) => {
  const email = testEmail("recovery", testInfo);
  const user = await createConfirmedUser(email);
  const loginContext = await openSecondaryContext(browser, testInfo);
  const loginPage = await loginContext.newPage();

  try {
    await page.goto("/auth/forgot-password");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send recovery link" }).click();
    await expect(page.getByTestId("auth-form-message")).toContainText(
      "If the account exists, a password-recovery link has been sent",
    );

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: "http://127.0.0.1:30002/auth/callback?next=/auth/update-password",
      },
    });
    const tokenHash = data.properties?.hashed_token;
    if (error || !tokenHash) throw error ?? new Error("Recovery token hash was not generated.");

    await page.goto(
      `/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=${encodeURIComponent("/auth/update-password")}`,
    );
    await expect(page).toHaveURL("http://127.0.0.1:30002/auth/update-password");
    const recoveryCookies = await page.context().cookies("http://127.0.0.1:30002");
    expect(recoveryCookies.some((cookie) => cookie.name.endsWith("-auth-token"))).toBe(true);

    await page.locator("#update-password-password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(/\/age-assurance/);

    await login(loginPage, email, PASSWORD);
    await expect(loginPage.getByTestId("auth-form-message")).toContainText("incorrect");
    await loginPage.getByLabel("Password").fill(NEW_PASSWORD);
    await loginPage.getByRole("button", { name: "Sign in" }).click();
    await expect(loginPage).toHaveURL(/\/age-assurance/);
  } finally {
    await loginContext.close();
    await removeUser(user.id);
  }
});
