import { createHash } from "node:crypto";
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

function defaultHandle(userId: string) {
  return `lux_${createHash("sha256").update(userId).digest("hex").slice(0, 10)}`;
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

async function loginAndAssure(page: Page, email: string) {
  await page.goto("/auth/login?next=%2Fworkspace");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/age-assurance/);
  await page.getByLabel("Country code").fill("PK");
  await page.getByLabel(/I confirm that I am at least 18 years old/).check();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
}

test.describe.configure({ mode: "default" });

test("owner export includes UUID-free social relationships and writes a success receipt", async ({ page }, testInfo) => {
  const ownerEmail = emailFor("export-owner", testInfo);
  const otherEmail = emailFor("export-other", testInfo);
  const owner = await createConfirmedUser(ownerEmail);
  const other = await createConfirmedUser(otherEmail);
  const otherHandle = defaultHandle(other.id);

  try {
    await loginAndAssure(page, ownerEmail);
    await page.goto(`/u/${otherHandle}`);
    await expect(page.getByRole("heading", { name: "LUX member" })).toBeVisible();
    await page.getByRole("button", { name: "Follow" }).click();
    await expect(page.getByRole("button", { name: "Unfollow" })).toBeVisible();

    const response = await page.context().request.get("/settings/privacy/export");
    expect(response.status()).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    const relationships = body.profile_relationships as Record<string, Array<Record<string, string>>>;
    expect(relationships.following).toEqual([
      { handle: otherHandle, display_name: "LUX member" },
    ]);

    const exportText = JSON.stringify(body);
    expect(exportText).not.toContain(owner.id);
    expect(exportText).not.toContain(other.id);
    expect(exportText).not.toContain(otherEmail);
    expect(exportText).not.toContain("access_token");
    expect(exportText).not.toContain("refresh_token");
    expect(exportText).not.toContain("age_assurance_records");

    const secondResponse = await page.context().request.get("/settings/privacy/export");
    expect(secondResponse.status()).toBe(200);
    const secondBody = await secondResponse.json() as Record<string, unknown>;
    const auditEvents = secondBody.audit_events as Array<Record<string, unknown>>;
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_type: "account_export_generated",
        outcome: "success",
        route_key: "privacy-settings-export",
      }),
    ]));
  } finally {
    await removeUser(owner.id);
    await removeUser(other.id);
  }
});
