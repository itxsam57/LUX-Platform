import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Profile E2E requires isolated Supabase credentials.");

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
  if (error || !data.user) throw error ?? new Error("Profile test user was not created.");
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

async function secondaryContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  return browser.newContext(testInfo.project.use);
}

async function configurePublicProfile(page: Page, handle: string, displayName: string) {
  await page.goto("/settings/profile");
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Bio").fill(`Public bio for ${displayName}`);
  await page.getByLabel("Language").fill("en");
  await page.getByLabel("Profile visibility").selectOption("public");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByTestId("profile-action-message")).toContainText("Profile saved");
}

test.describe.configure({ mode: "default" });

test("owner edits a profile and public projection leaks no private account identifiers", async ({ page, browser }, testInfo) => {
  const email = emailFor("profile-owner", testInfo);
  const user = await createConfirmedUser(email);
  const anonymousContext = await secondaryContext(browser, testInfo);
  const anonymousPage = await anonymousContext.newPage();

  try {
    await loginAndAssure(page, email);
    await configurePublicProfile(page, "public_alpha", "Public Alpha");

    await anonymousPage.goto("/u/public_alpha");
    await expect(anonymousPage.getByRole("heading", { name: "Public Alpha" })).toBeVisible();
    await expect(anonymousPage.getByText("Public bio for Public Alpha")).toBeVisible();
    const markup = await anonymousPage.locator("body").innerText();
    expect(markup).not.toContain(email);
    expect(markup).not.toContain(user.id);
    expect(await anonymousPage.content()).not.toContain(user.id);
  } finally {
    await anonymousContext.close();
    await removeUser(user.id);
  }
});

test("unlisted remains direct-link visible while private is owner-only", async ({ page, browser }, testInfo) => {
  const email = emailFor("profile-visibility", testInfo);
  const user = await createConfirmedUser(email);
  const anonymousContext = await secondaryContext(browser, testInfo);
  const anonymousPage = await anonymousContext.newPage();

  try {
    await loginAndAssure(page, email);
    await configurePublicProfile(page, "visibility_alpha", "Visibility Alpha");

    await page.goto("/settings/profile");
    await page.getByLabel("Profile visibility").selectOption("unlisted");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByTestId("profile-action-message")).toContainText("Profile saved");
    await anonymousPage.goto("/u/visibility_alpha");
    await expect(anonymousPage.getByRole("heading", { name: "Visibility Alpha" })).toBeVisible();

    await page.goto("/settings/profile");
    await page.getByLabel("Profile visibility").selectOption("private");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByTestId("profile-action-message")).toContainText("Profile saved");
    await anonymousPage.goto("/u/visibility_alpha");
    await expect(anonymousPage.getByRole("heading", { name: "Profile unavailable" })).toBeVisible();

    await page.goto("/u/visibility_alpha");
    await expect(page.getByRole("heading", { name: "Visibility Alpha" })).toBeVisible();
  } finally {
    await anonymousContext.close();
    await removeUser(user.id);
  }
});

test("follow, block, unblock, and mute stay synchronized without permission leakage", async ({ page, browser }, testInfo) => {
  const alphaEmail = emailFor("social-alpha", testInfo);
  const bravoEmail = emailFor("social-bravo", testInfo);
  const alpha = await createConfirmedUser(alphaEmail);
  const bravo = await createConfirmedUser(bravoEmail);
  const bravoContext = await secondaryContext(browser, testInfo);
  const bravoPage = await bravoContext.newPage();

  try {
    await loginAndAssure(page, alphaEmail);
    await configurePublicProfile(page, "social_alpha", "Social Alpha");
    await loginAndAssure(bravoPage, bravoEmail);
    await configurePublicProfile(bravoPage, "social_bravo", "Social Bravo");

    await page.goto("/u/social_bravo");
    await page.getByRole("button", { name: "Follow" }).click();
    await expect(page.getByRole("button", { name: "Unfollow" })).toBeVisible();

    await bravoPage.goto("/u/social_alpha");
    await bravoPage.getByRole("button", { name: "Block" }).click();
    await expect(bravoPage.getByText("Block complete.")).toBeVisible();

    await page.goto("/u/social_bravo");
    await expect(page.getByRole("heading", { name: "Profile unavailable" })).toBeVisible();
    await bravoPage.goto("/u/social_alpha");
    await expect(bravoPage.getByRole("heading", { name: "Profile unavailable" })).toBeVisible();

    await bravoPage.goto("/settings/privacy");
    const blockedRow = bravoPage.locator(".privacy-relationship-row").filter({ hasText: "@social_alpha" });
    await expect(blockedRow).toHaveCount(1);
    await blockedRow.getByRole("button", { name: "Unblock" }).click();
    await expect(blockedRow).toContainText("@social_alpha unblocked");

    await bravoPage.goto("/u/social_alpha");
    await expect(bravoPage.getByRole("heading", { name: "Social Alpha" })).toBeVisible();
    await bravoPage.getByRole("button", { name: "Mute" }).click();
    await expect(bravoPage.getByRole("button", { name: "Unmute" })).toBeVisible();

    await bravoPage.goto("/settings/privacy");
    const mutedRow = bravoPage.locator(".privacy-relationship-row").filter({ hasText: "@social_alpha" });
    await expect(mutedRow).toHaveCount(1);
    await mutedRow.getByRole("button", { name: "Unmute" }).click();
    await expect(mutedRow).toContainText("@social_alpha unmuted");
  } finally {
    await bravoContext.close();
    await removeUser(alpha.id);
    await removeUser(bravo.id);
  }
});