import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import sharp from "sharp";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Profile hardening E2E requires isolated Supabase credentials.");

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
  if (error || !data.user) throw error ?? new Error("Profile hardening test user was not created.");
  return data.user;
}

async function removeUser(userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

async function loginAndAssure(page: Page, email: string, target = "/workspace") {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
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

test("duplicate handles and unsafe links fail safely while valid profile edits persist after refresh", async ({ page, browser }, testInfo) => {
  const ownerEmail = emailFor("validation-owner", testInfo);
  const contenderEmail = emailFor("validation-contender", testInfo);
  const owner = await createConfirmedUser(ownerEmail);
  const contender = await createConfirmedUser(contenderEmail);
  const contenderContext = await secondaryContext(browser, testInfo);
  const contenderPage = await contenderContext.newPage();

  try {
    await loginAndAssure(page, ownerEmail);
    await configurePublicProfile(page, "taken_handle", "Handle Owner");

    await loginAndAssure(contenderPage, contenderEmail);
    await contenderPage.goto("/settings/profile");
    await contenderPage.getByLabel("Handle").fill("taken_handle");
    await contenderPage.getByLabel("Display name").fill("Contender");
    await contenderPage.getByRole("button", { name: "Save profile" }).click();
    await expect(contenderPage.getByTestId("profile-action-message")).toContainText("That handle is already in use");

    await contenderPage.getByLabel("Handle").fill("validation_bravo");
    await contenderPage.getByLabel("Link 1 label").fill("Unsafe");
    await contenderPage.getByLabel("Link 1 URL").fill("javascript:alert(1)");
    await contenderPage.getByRole("button", { name: "Save profile" }).click();
    await expect(contenderPage.getByTestId("profile-action-message")).toContainText("Check the highlighted profile fields");
    await expect(contenderPage.getByText(/Profile links must use HTTPS/)).toBeVisible();

    await contenderPage.getByLabel("Link 1 URL").fill("https://example.com/profile");
    await contenderPage.getByLabel("Bio").fill("Persistent profile bio");
    await contenderPage.getByLabel("Language").fill("ur-PK");
    await contenderPage.getByRole("button", { name: "Save profile" }).click();
    await expect(contenderPage.getByTestId("profile-action-message")).toContainText("Profile saved");

    await contenderPage.reload();
    await expect(contenderPage.getByLabel("Handle")).toHaveValue("validation_bravo");
    await expect(contenderPage.getByLabel("Display name")).toHaveValue("Contender");
    await expect(contenderPage.getByLabel("Bio")).toHaveValue("Persistent profile bio");
    await expect(contenderPage.getByLabel("Language")).toHaveValue("ur-PK");
    await expect(contenderPage.getByLabel("Link 1 URL")).toHaveValue("https://example.com/profile");
  } finally {
    await contenderContext.close();
    await removeUser(owner.id);
    await removeUser(contender.id);
  }
});

test("avatar replacement overwrites the guarded object without changing the public media URL", async ({ page, browser }, testInfo) => {
  const email = emailFor("media-replace", testInfo);
  const user = await createConfirmedUser(email);
  const anonymousContext = await secondaryContext(browser, testInfo);

  try {
    await loginAndAssure(page, email);
    await configurePublicProfile(page, "replace_media_alpha", "Replace Media Alpha");

    const firstImage = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 210, g: 20, b: 20 } },
    }).png().toBuffer();
    const secondImage = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 20, g: 40, b: 210 } },
    }).png().toBuffer();

    await page.locator("#avatar-file").setInputFiles({ name: "first.png", mimeType: "image/png", buffer: firstImage });
    await page.getByRole("button", { name: "Process and upload avatar" }).click();
    await expect(page.getByText("Avatar updated as metadata-stripped WebP.")).toBeVisible();
    const firstResponse = await anonymousContext.request.get("/profile-media/replace_media_alpha/avatar");
    expect(firstResponse.status()).toBe(200);
    const firstBytes = await firstResponse.body();

    await page.locator("#avatar-file").setInputFiles({ name: "second.png", mimeType: "image/png", buffer: secondImage });
    await page.getByRole("button", { name: "Process and upload avatar" }).click();
    await expect(page.getByText("Avatar updated as metadata-stripped WebP.")).toBeVisible();
    const secondResponse = await anonymousContext.request.get("/profile-media/replace_media_alpha/avatar");
    expect(secondResponse.status()).toBe(200);
    const secondBytes = await secondResponse.body();

    expect(Buffer.compare(firstBytes, secondBytes)).not.toBe(0);
    await page.goto("/u/replace_media_alpha");
    const markup = await page.content();
    expect(markup).toContain("/profile-media/replace_media_alpha/avatar");
    expect(markup).not.toContain(user.id);
  } finally {
    await anonymousContext.close();
    await removeUser(user.id);
  }
});

test("follow counts change without refresh and unblock permits a fresh follow", async ({ page, browser }, testInfo) => {
  const alphaEmail = emailFor("count-alpha", testInfo);
  const bravoEmail = emailFor("count-bravo", testInfo);
  const alpha = await createConfirmedUser(alphaEmail);
  const bravo = await createConfirmedUser(bravoEmail);
  const bravoContext = await secondaryContext(browser, testInfo);
  const bravoPage = await bravoContext.newPage();

  try {
    await loginAndAssure(page, alphaEmail);
    await configurePublicProfile(page, "count_alpha", "Count Alpha");
    await loginAndAssure(bravoPage, bravoEmail);
    await configurePublicProfile(bravoPage, "count_bravo", "Count Bravo");

    await page.goto("/u/count_bravo");
    const counts = page.locator(".profile-social-counts");
    await expect(counts).toContainText("0 followers");
    await page.getByRole("button", { name: "Follow" }).click();
    await expect(page.getByRole("button", { name: "Unfollow" })).toBeVisible();
    await expect(counts).toContainText("1 followers");
    await page.getByRole("button", { name: "Unfollow" }).click();
    await expect(page.getByRole("button", { name: "Follow" })).toBeVisible();
    await expect(counts).toContainText("0 followers");
    await page.getByRole("button", { name: "Follow" }).click();
    await expect(counts).toContainText("1 followers");

    await bravoPage.goto("/u/count_alpha");
    await bravoPage.getByRole("button", { name: "Block" }).click();
    await expect(bravoPage.getByText("Block complete.")).toBeVisible();
    await bravoPage.goto("/settings/privacy");
    const blockedRow = bravoPage.locator(".privacy-relationship-row").filter({ hasText: "@count_alpha" });
    await blockedRow.getByRole("button", { name: "Unblock" }).click();
    await expect(blockedRow).toContainText("@count_alpha unblocked");

    await bravoPage.goto("/u/count_alpha");
    await bravoPage.getByRole("button", { name: "Follow" }).click();
    await expect(bravoPage.getByRole("button", { name: "Unfollow" })).toBeVisible();
  } finally {
    await bravoContext.close();
    await removeUser(alpha.id);
    await removeUser(bravo.id);
  }
});
