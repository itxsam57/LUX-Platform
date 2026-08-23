import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Privacy export E2E requires isolated Supabase credentials.");

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
  if (error || !data.user) throw error ?? new Error("Privacy export test user was not created.");
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
  await expect(page).toHaveURL(new RegExp(target.replaceAll("/", "\\/")));
}

test.describe.configure({ mode: "default" });

test("owner export includes UUID-free social relationships and writes a success receipt", async ({ page }, testInfo) => {
  const ownerEmail = emailFor("export-owner", testInfo);
  const otherEmail = emailFor("export-other", testInfo);
  const owner = await createConfirmedUser(ownerEmail);
  const other = await createConfirmedUser(otherEmail);

  try {
    const { data: otherProfile, error: profileError } = await admin
      .from("profiles")
      .select("handle, display_name")
      .eq("user_id", other.id)
      .single();
    if (profileError || !otherProfile) throw profileError ?? new Error("Other profile fixture was not created.");

    const { error: followError } = await admin.from("profile_follows").insert({
      follower_user_id: owner.id,
      followed_user_id: other.id,
    });
    if (followError) throw followError;

    await login(page, ownerEmail, "/settings/privacy");
    const response = await page.context().request.get("/settings/privacy/export");
    expect(response.status()).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    const relationships = body.profile_relationships as Record<string, Array<Record<string, string>>>;
    expect(relationships.following).toEqual([
      { handle: otherProfile.handle, display_name: otherProfile.display_name },
    ]);

    const exportText = JSON.stringify(body);
    expect(exportText).not.toContain(owner.id);
    expect(exportText).not.toContain(other.id);
    expect(exportText).not.toContain(otherEmail);

    const { data: receipts, error: receiptError } = await admin
      .from("audit_events")
      .select("event_type, outcome, route_key")
      .eq("actor_user_id", owner.id)
      .eq("event_type", "account_export_generated");
    if (receiptError) throw receiptError;
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      event_type: "account_export_generated",
      outcome: "success",
      route_key: "privacy-settings-export",
    });
  } finally {
    await removeUser(owner.id);
    await removeUser(other.id);
  }
});
