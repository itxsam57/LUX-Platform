import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const protectedDiscoveryRoutes = ["/app/feed", "/app/explore", "/app/search"] as const;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "LuxSecureTest123";

if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Discovery privacy E2E requires isolated Supabase credentials");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function email(prefix: string, testInfo: TestInfo) {
  return `${prefix}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}@lux.test`;
}

async function createUser(address: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Discovery test user unavailable");
  return data.user;
}

async function removeUser(id: string) {
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw error;
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
    policy_version: "discovery-browser-privacy-v1",
  });
  if (error) throw error;
}

async function configureProfile(
  client: SupabaseClient,
  handle: string,
  displayName: string,
  visibility: "public" | "unlisted" | "private",
) {
  const { error } = await client.rpc("update_profile", {
    requested_handle: handle,
    requested_display_name: displayName,
    requested_bio: `${displayName} discovery privacy fixture`,
    requested_links: [],
    requested_language_code: "en",
    requested_visibility: visibility,
  });
  if (error) throw error;
}

async function relationship(client: SupabaseClient, targetHandle: string, action: "follow" | "block") {
  const { error } = await client.rpc("set_profile_relationship", {
    target_handle: targetHandle,
    relationship_action: action,
  });
  if (error) throw error;
}

async function login(page: Page, address: string, target: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page).toHaveURL(new RegExp(`${escaped}$`), { timeout: 15_000 });
}

function profileCard(page: Page, handle: string) {
  return page.getByRole("article").filter({ hasText: `@${handle}` });
}

for (const route of protectedDiscoveryRoutes) {
  test(`${route} is a real protected route rather than a 404`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/auth\/login\?next=/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });
}

test("discovery routes do not introduce horizontal document overflow on mobile", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile-only viewport safety assertion");
  await page.goto("/app/feed");
  await expect(page).toHaveURL(/\/auth\/login\?next=/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Explore, Feed, and Search enforce visibility and reciprocal block boundaries", async ({ page }, testInfo) => {
  test.setTimeout(90_000);

  const viewerEmail = email("discovery-viewer", testInfo);
  const publicEmail = email("discovery-public", testInfo);
  const unlistedEmail = email("discovery-unlisted", testInfo);
  const privateEmail = email("discovery-private", testInfo);
  const blockedEmail = email("discovery-blocked", testInfo);

  const viewer = await createUser(viewerEmail);
  const publicUser = await createUser(publicEmail);
  const unlistedUser = await createUser(unlistedEmail);
  const privateUser = await createUser(privateEmail);
  const blockedUser = await createUser(blockedEmail);

  try {
    const viewerClient = await authenticatedClient(viewerEmail);
    const publicClient = await authenticatedClient(publicEmail);
    const unlistedClient = await authenticatedClient(unlistedEmail);
    const privateClient = await authenticatedClient(privateEmail);
    const blockedClient = await authenticatedClient(blockedEmail);

    await Promise.all([
      assureAdult(viewerClient),
      assureAdult(publicClient),
      assureAdult(unlistedClient),
      assureAdult(privateClient),
      assureAdult(blockedClient),
    ]);

    await configureProfile(viewerClient, "discover_viewer", "Discovery Viewer", "public");
    await configureProfile(publicClient, "discover_public", "Discovery Public", "public");
    await configureProfile(unlistedClient, "discover_unlisted", "Discovery Unlisted", "unlisted");
    await configureProfile(privateClient, "discover_private", "Discovery Private", "private");
    await configureProfile(blockedClient, "discover_blocked", "Discovery Blocked", "public");

    await relationship(viewerClient, "discover_unlisted", "follow");
    await relationship(blockedClient, "discover_viewer", "block");

    await login(page, viewerEmail, "/app/explore");
    await expect(profileCard(page, "discover_public")).toHaveCount(1);
    await expect(profileCard(page, "discover_unlisted")).toHaveCount(0);
    await expect(profileCard(page, "discover_private")).toHaveCount(0);
    await expect(profileCard(page, "discover_blocked")).toHaveCount(0);

    await page.goto("/app/feed?mode=for_you");
    await expect(page.getByRole("heading", { name: "Your feed" })).toBeVisible();
    await expect(profileCard(page, "discover_public")).toHaveCount(1);
    await expect(profileCard(page, "discover_unlisted")).toHaveCount(0);
    await expect(profileCard(page, "discover_private")).toHaveCount(0);
    await expect(profileCard(page, "discover_blocked")).toHaveCount(0);

    await page.goto("/app/feed?mode=following");
    await expect(profileCard(page, "discover_unlisted")).toHaveCount(1);
    await expect(profileCard(page, "discover_public")).toHaveCount(0);
    await expect(profileCard(page, "discover_private")).toHaveCount(0);
    await expect(profileCard(page, "discover_blocked")).toHaveCount(0);

    await page.goto("/app/search?q=discover");
    await expect(page.getByRole("heading", { name: "Search public profiles" })).toBeVisible();
    await expect(profileCard(page, "discover_public")).toHaveCount(1);
    await expect(profileCard(page, "discover_unlisted")).toHaveCount(0);
    await expect(profileCard(page, "discover_private")).toHaveCount(0);
    await expect(profileCard(page, "discover_blocked")).toHaveCount(0);

    const body = await page.locator("body").innerText();
    expect(body).not.toContain(viewer.id);
    expect(body).not.toContain(publicUser.id);
    expect(body).not.toContain(unlistedUser.id);
    expect(body).not.toContain(privateUser.id);
    expect(body).not.toContain(blockedUser.id);
  } finally {
    await Promise.all([
      removeUser(viewer.id),
      removeUser(publicUser.id),
      removeUser(unlistedUser.id),
      removeUser(privateUser.id),
      removeUser(blockedUser.id),
    ]);
  }
});
