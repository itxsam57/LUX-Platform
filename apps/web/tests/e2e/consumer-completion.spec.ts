import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { cleanupTestUser } from "./test-user-cleanup";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Consumer completion E2E requires isolated Supabase service configuration");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const PASSWORD = "LuxSecureTest123";

function email(prefix: string, testInfo: TestInfo) {
  return `${prefix}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}@lux.test`;
}

async function createUser(address: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Consumer completion user unavailable");
  return data.user;
}

async function client(address: string): Promise<SupabaseClient> {
  const value = createClient(supabaseUrl!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await value.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (error) throw error;
  return value;
}

async function assureAdult(value: SupabaseClient) {
  const { error } = await value.rpc("confirm_adult_attestation", {
    jurisdiction_code: "PK",
    policy_version: "consumer-completion-e2e",
  });
  if (error) throw error;
}

async function handleFor(address: string, userId: string) {
  const value = await client(address);
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

async function noOverflow(page: Page) {
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe.configure({ mode: "default" });

test("private messaging and saved items survive refresh, deduplicate, and close after block", async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const aliceEmail = email("consumer-alice", testInfo);
  const bobEmail = email("consumer-bob", testInfo);
  const alice = await createUser(aliceEmail);
  const bob = await createUser(bobEmail);
  const bobContext = await secondary(browser, testInfo);
  const bobPage = await bobContext.newPage();

  try {
    const aliceClient = await client(aliceEmail);
    const bobClient = await client(bobEmail);
    await assureAdult(aliceClient);
    await assureAdult(bobClient);
    const bobHandle = await handleFor(bobEmail, bob.id);

    await login(page, aliceEmail, `/u/${bobHandle}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => {
      const { data, error } = await aliceClient.rpc("list_my_saved_items");
      if (error || !Array.isArray(data)) return false;
      return data.some((item) => item && typeof item === "object" && !Array.isArray(item)
        && (item as Record<string, unknown>).type === "profile"
        && (item as Record<string, unknown>).publicId === bobHandle);
    }).toBe(true);
    await page.goto("/app/saved");
    const savedProfileLink = page.locator(`a[href="/u/${bobHandle}"]`).filter({ hasText: "Open" });
    await expect(savedProfileLink).toHaveCount(1);
    await page.reload();
    await expect(page.locator(`a[href="/u/${bobHandle}"]`).filter({ hasText: "Open" })).toHaveCount(1);

    await page.goto("/messages");
    await page.getByLabel("Member handle").fill(bobHandle);
    await page.getByRole("button", { name: "Open conversation" }).click();
    await expect(page).toHaveURL(/\/messages\/mth[0-9a-f]{24}$/);
    const threadPath = new URL(page.url()).pathname;

    await page.locator("textarea#message-body").fill("A private message that must survive refresh and remain visible only to this thread.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("status")).toContainText("Message sent");
    await page.reload();
    await expect(page.getByText("A private message that must survive refresh and remain visible only to this thread.")).toBeVisible();

    await page.goto("/messages");
    await page.getByLabel("Member handle").fill(bobHandle);
    await page.getByRole("button", { name: "Open conversation" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(threadPath);

    await login(bobPage, bobEmail, "/messages");
    const threadRow = bobPage.getByRole("row").filter({ hasText: "A private message that must survive refresh" });
    await expect(threadRow).toHaveCount(1);
    await threadRow.getByRole("link", { name: "Open" }).click();
    await expect(bobPage.getByText("A private message that must survive refresh and remain visible only to this thread.")).toBeVisible();
    await bobPage.locator("textarea#message-body").fill("Reply from the other participant.");
    await bobPage.getByRole("button", { name: "Send" }).click();

    await page.reload();
    await expect(page.getByText("Reply from the other participant.")).toBeVisible();

    const { error: blockError } = await aliceClient.rpc("set_profile_relationship", {
      target_handle: bobHandle,
      relationship_action: "block",
    });
    if (blockError) throw blockError;

    await page.goto(threadPath);
    await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
    await page.goto("/app/saved");
    await expect(page.getByRole("row").filter({ hasText: `@${bobHandle}` })).toHaveCount(0);
    await noOverflow(page);
  } finally {
    await bobContext.close();
    await cleanupTestUser(admin, alice.id);
    await cleanupTestUser(admin, bob.id);
  }
});

test("performer role activation keeps consent separate while availability and offers persist", async ({ page, browser }, testInfo) => {
  const performerEmail = email("performer-workflow", testInfo);
  const adminEmail = email("performer-admin", testInfo);
  const performer = await createUser(performerEmail);
  const superAdmin = await createUser(adminEmail);
  const adminContext = await secondary(browser, testInfo);
  const adminPage = await adminContext.newPage();

  try {
    const performerClient = await client(performerEmail);
    await assureAdult(performerClient);
    const adminClient = await client(adminEmail);
    await assureAdult(adminClient);
    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", { target_user_id: superAdmin.id });
    if (bootstrapError) throw bootstrapError;

    await login(page, performerEmail, "/workspace");
    await page.getByRole("button", { name: "Request performer access" }).click();
    await expect(page).toHaveURL(/notice=performer-requested/);

    await login(adminPage, adminEmail, "/workspace/staff/role-requests");
    const requestRow = adminPage.getByRole("row").filter({ hasText: performer.id.slice(0, 8) });
    await expect(requestRow).toHaveCount(1);
    await requestRow.getByRole("button", { name: "Approve" }).click();
    await expect(adminPage).toHaveURL(/notice=approved/);

    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data: v2Session, error: v2StartError } = await performerClient.rpc("start_verification", {
      requested_level: "v2",
      requested_provider_key: "synthetic",
      requested_provider_reference: `consumer-performer-v2:${performer.id}`,
      requested_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      requested_synthetic: true,
    });
    if (v2StartError || typeof v2Session !== "string") throw v2StartError ?? new Error("Performer V2 session unavailable");
    const { error: v2ReviewError } = await adminClient.rpc("apply_verification_result", {
      target_session_id: v2Session,
      decision: "verified",
      requested_result_expires_at: expiresAt,
      requested_liveness_passed: true,
      requested_risk_screen_passed: true,
      requested_recheck_reason: null,
    });
    if (v2ReviewError) throw v2ReviewError;

    const { error: educationError } = await performerClient.rpc("acknowledge_consent_education", {
      requested_policy_version: "slice-5-consent-v1",
    });
    if (educationError) throw educationError;
    const { error: prerequisiteError } = await adminClient.rpc("set_performer_verification_prerequisites", {
      target_user_id: performer.id,
      record_active: true,
      liveness_expires_at: expiresAt,
      payout_ownership_verified: true,
    });
    if (prerequisiteError) throw prerequisiteError;

    const { data: v3Session, error: v3StartError } = await performerClient.rpc("start_verification", {
      requested_level: "v3",
      requested_provider_key: "synthetic",
      requested_provider_reference: `consumer-performer-v3:${performer.id}`,
      requested_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      requested_synthetic: true,
    });
    if (v3StartError || typeof v3Session !== "string") throw v3StartError ?? new Error("Performer V3 session unavailable");
    const { error: v3ReviewError } = await adminClient.rpc("apply_verification_result", {
      target_session_id: v3Session,
      decision: "verified",
      requested_result_expires_at: expiresAt,
      requested_liveness_passed: true,
      requested_risk_screen_passed: true,
      requested_recheck_reason: null,
    });
    if (v3ReviewError) throw v3ReviewError;

    await page.goto("/workspace");
    const performerCard = page.getByRole("region", { name: "Performer workspace" });
    await performerCard.getByRole("button", { name: "Activate Performer" }).click();
    await expect(page).toHaveURL(/\/workspace\/performer$/);
    await expect(page.getByRole("heading", { name: "Performer workspace" })).toBeVisible();
    await expect(page.getByText(/Agencies may communicate.*cannot provide your personal consent/i)).toBeVisible();

    await page.getByRole("link", { name: "Manage availability" }).click();
    await expect(page.getByRole("heading", { name: "Availability and offers" })).toBeVisible();
    await page.getByLabel("Status").selectOption("available");
    await page.getByLabel("Public note").fill("Available for creator-controlled projects with explicit boundaries.");
    await Promise.all([
      page.waitForURL(/\/app\/offers\?notice=availability$/, { timeout: 15_000 }),
      page.getByRole("button", { name: "Save availability" }).click(),
    ]);
    await page.reload();
    await expect(page.getByText(/Current: available\./)).toBeVisible();
    await expect(page.getByText("Available for creator-controlled projects with explicit boundaries.")).toBeVisible();

    await page.getByLabel("Title").fill("Verified performer collaboration");
    await page.getByLabel("Description").fill("A voluntary performer collaboration offer that still requires exact project terms and personal consent.");
    await page.getByLabel("Category").fill("performance");
    await page.getByLabel("Role").fill("performer");
    await page.getByLabel("Starting price (minor units)").fill("15000");
    await page.getByLabel("Currency").fill("USD");
    await page.getByRole("button", { name: "Publish offer" }).click();
    await expect(page.getByText("Verified performer collaboration")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Available for creator-controlled projects with explicit boundaries.")).toBeVisible();
    await expect(page.getByText("Verified performer collaboration")).toBeVisible();
    await noOverflow(page);

    await page.goto("/workspace/agency");
    await expect(page).toHaveURL(/\/access-denied/);
  } finally {
    await adminContext.close();
    await cleanupTestUser(admin, performer.id);
    await cleanupTestUser(admin, superAdmin.id);
  }
});
