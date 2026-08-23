import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Privacy E2E requires isolated Supabase credentials.");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const PASSWORD = "LuxSecureTest123";

function emailFor(prefix: string, testInfo: TestInfo) {
  const project = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${prefix}-${project}-${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(16).slice(2)}@lux.test`;
}

async function createConfirmedUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Privacy test user was not created.");
  return data.user;
}

async function removeUser(userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

async function login(page: Page, email: string, target: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function loginAndAssure(page: Page, email: string, target = "/workspace") {
  await login(page, email, target);
  await expect(page).toHaveURL(/\/age-assurance/);
  await page.getByLabel("Country code").fill("PK");
  await page.getByLabel(/I confirm that I am at least 18 years old/).check();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page).toHaveURL(new RegExp(target.replaceAll("/", "\\/")));
}

async function configurePublicProfile(page: Page, handle: string, displayName: string) {
  await page.goto("/settings/profile");
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Bio").fill(`Bio for ${displayName}`);
  await page.getByLabel("Language").fill("en");
  await page.getByLabel("Profile visibility").selectOption("public");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByTestId("profile-action-message")).toContainText("Profile saved");
}

async function secondaryContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  return browser.newContext(testInfo.project.use);
}

test.describe.configure({ mode: "default" });

test("privacy rights remain available without current adult assurance and export stays allowlisted", async ({ page }, testInfo) => {
  const email = emailFor("privacy-no-age", testInfo);
  const user = await createConfirmedUser(email);

  try {
    await login(page, email, "/settings/privacy");
    await expect(page).toHaveURL(/\/settings\/privacy$/);
    await expect(page.getByRole("heading", { name: "Your account, your boundaries" })).toBeVisible();

    const supporterSwitch = page.getByRole("switch", { name: /Keep future support anonymous by default/ });
    await expect(supporterSwitch).toBeChecked();
    await supporterSwitch.uncheck();
    await page.getByRole("button", { name: "Save supporter privacy" }).click();
    await expect(page.getByText("Support may use your public profile by default.")).toBeVisible();

    const response = await page.request.get("/settings/privacy/export");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["cache-control"]).toContain("no-store");
    const exportText = await response.text();
    expect(exportText).toContain(email);
    expect(exportText).not.toContain("access_token");
    expect(exportText).not.toContain("refresh_token");
    expect(exportText).not.toContain("raw_app_meta_data");
    expect(exportText).not.toContain("raw_user_meta_data");
    expect(exportText).not.toContain("age_assurance_records");
    expect(exportText).not.toContain(user.id);

    await page.getByLabel("Confirmation phrase").fill("DELETE MY LUX ACCOUNT");
    await page.getByRole("button", { name: "Submit deletion request" }).click();
    await expect(page.getByText(/Account deletion request submitted/)).toBeVisible();
    await page.getByRole("button", { name: "Submit deletion request" }).click();
    await expect(page.getByText(/Account deletion request submitted/)).toBeVisible();

    const { data: activeRequests, error: requestError } = await admin
      .from("privacy_requests")
      .select("id, status")
      .eq("user_id", user.id)
      .in("status", ["submitted", "processing"]);
    if (requestError) throw requestError;
    expect(activeRequests).toHaveLength(1);

    await page.getByRole("button", { name: "Cancel submitted deletion request" }).click();
    await expect(page.getByText("Deletion request cancelled.")).toBeVisible();
  } finally {
    await removeUser(user.id);
  }
});

test("existing block and mute can be removed after adult assurance expires", async ({ page, browser }, testInfo) => {
  const alphaEmail = emailFor("privacy-remove-alpha", testInfo);
  const bravoEmail = emailFor("privacy-remove-bravo", testInfo);
  const alpha = await createConfirmedUser(alphaEmail);
  const bravo = await createConfirmedUser(bravoEmail);
  const bravoContext = await secondaryContext(browser, testInfo);
  const bravoPage = await bravoContext.newPage();

  try {
    await loginAndAssure(page, alphaEmail);
    await configurePublicProfile(page, "privacy_alpha", "Privacy Alpha");
    await loginAndAssure(bravoPage, bravoEmail);
    await configurePublicProfile(bravoPage, "privacy_bravo", "Privacy Bravo");

    await page.goto("/u/privacy_bravo");
    await page.getByRole("button", { name: "Block" }).click();
    await expect(page.getByText("Block complete.")).toBeVisible();

    const { error: expireError } = await admin
      .from("age_assurance_records")
      .delete()
      .eq("user_id", alpha.id);
    if (expireError) throw expireError;

    await page.goto("/settings/privacy");
    await expect(page).toHaveURL(/\/settings\/privacy$/);
    const blockRow = page.locator(".privacy-relationship-row").filter({ hasText: "@privacy_bravo" });
    await expect(blockRow).toHaveCount(1);
    await blockRow.getByRole("button", { name: "Unblock" }).click();
    await expect(blockRow).toContainText("@privacy_bravo unblocked");

    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/age-assurance/);

    await loginAndAssure(bravoPage, bravoEmail, "/u/privacy_alpha");
    await bravoPage.getByRole("button", { name: "Mute" }).click();
    await expect(bravoPage.getByRole("button", { name: "Unmute" })).toBeVisible();
    const { error: expireBravoError } = await admin
      .from("age_assurance_records")
      .delete()
      .eq("user_id", bravo.id);
    if (expireBravoError) throw expireBravoError;
    await bravoPage.goto("/settings/privacy");
    const muteRow = bravoPage.locator(".privacy-relationship-row").filter({ hasText: "@privacy_alpha" });
    await expect(muteRow).toHaveCount(1);
    await muteRow.getByRole("button", { name: "Unmute" }).click();
    await expect(muteRow).toContainText("@privacy_alpha unmuted");
  } finally {
    await bravoContext.close();
    await removeUser(alpha.id);
    await removeUser(bravo.id);
  }
});

test("notifications are recipient-only, markable, deep-linked, and suppressed after block", async ({ page, browser }, testInfo) => {
  const followerEmail = emailFor("notify-follower", testInfo);
  const recipientEmail = emailFor("notify-recipient", testInfo);
  const follower = await createConfirmedUser(followerEmail);
  const recipient = await createConfirmedUser(recipientEmail);
  const recipientContext = await secondaryContext(browser, testInfo);
  const recipientPage = await recipientContext.newPage();

  try {
    await loginAndAssure(page, followerEmail);
    await configurePublicProfile(page, "notify_follower", "Notify Follower");
    await loginAndAssure(recipientPage, recipientEmail);
    await configurePublicProfile(recipientPage, "notify_recipient", "Notify Recipient");

    await page.goto("/u/notify_recipient");
    await page.getByRole("button", { name: "Follow" }).click();
    await expect(page.getByRole("button", { name: "Unfollow" })).toBeVisible();

    await recipientPage.goto("/notifications");
    await expect(recipientPage.getByRole("heading", { name: "New follower" })).toBeVisible();
    await expect(recipientPage.getByRole("link", { name: "Open profile" })).toHaveAttribute("href", "/u/notify_follower");
    await recipientPage.getByRole("button", { name: "Mark read" }).click();
    await expect(recipientPage.getByText("0 unread")).toBeVisible();

    await recipientPage.goto("/u/notify_follower");
    await recipientPage.getByRole("button", { name: "Block" }).click();
    await expect(recipientPage.getByText("Block complete.")).toBeVisible();
    await recipientPage.goto("/notifications");
    await expect(recipientPage.getByRole("heading", { name: "New follower" })).toHaveCount(0);
  } finally {
    await recipientContext.close();
    await removeUser(follower.id);
    await removeUser(recipient.id);
  }
});