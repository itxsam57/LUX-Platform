import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Slice 7 E2E requires isolated Supabase environment variables.");
}
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = "LuxSecureTest123";

function email(prefix: string, testInfo: TestInfo) {
  return `${prefix}-${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}@lux.test`;
}

async function createUser(address: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: address, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("test user unavailable");
  return data.user;
}

async function removeUser(id: string) {
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw error;
}

async function loginAndAssure(page: Page, address: string, target = "/workspace") {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (new URL(page.url()).pathname === "/age-assurance") {
    await page.getByLabel("Country code").fill("PK");
    await page.getByLabel(/I confirm that I am at least 18 years old/).check();
    await page.getByRole("button", { name: "Confirm and continue" }).click();
  }
}

async function activateCreator(page: Page, address: string, userId: string, testInfo: TestInfo) {
  await loginAndAssure(page, address, "/workspace");
  await page.getByRole("button", { name: "Request creator access" }).click();
  const adminEmail = email("s7-admin", testInfo);
  const superAdmin = await createUser(adminEmail);
  try {
    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", { target_user_id: superAdmin.id });
    if (bootstrapError) throw bootstrapError;
    await admin.from("workspace_memberships").update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: superAdmin.id }).eq("user_id", userId).eq("role", "creator");
    await page.goto("/workspace");
    const creator = page.getByRole("region", { name: "Creator workspace" });
    await creator.getByRole("button", { name: "Activate Creator" }).click();
    await expect(page).toHaveURL(/\/workspace\/creator$/);
  } finally {
    await removeUser(superAdmin.id);
  }
}

async function expectFits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("creator can create and revise a durable project without stale overwrite", async ({ page }, testInfo) => {
  const address = email("s7-owner", testInfo);
  const user = await createUser(address);
  try {
    await activateCreator(page, address, user.id, testInfo);
    await page.goto("/studio/projects/new");
    await expect(page.getByRole("heading", { name: "New project draft" })).toBeVisible();
    await page.getByLabel("Project title").fill("Slice 7 browser project");
    await page.getByLabel("Public synopsis").fill("A public-safe voluntary creator-led project synopsis for the browser workflow.");
    await page.getByLabel("Private production brief").fill("A private production brief with exact boundaries, schedule assumptions, and collaborator planning.");
    await page.getByLabel("Category").fill("concept");
    await page.getByLabel("Format").fill("video");
    await page.getByLabel("Boundaries").fill("closed-set, no-surprises");
    await page.getByLabel("Compensation model").selectOption("fixed");
    await page.getByLabel("Distribution scope").fill("Platform release only");
    await page.getByLabel("Rights declarations").fill("original-concept");
    await page.getByRole("button", { name: "Create project draft" }).click();
    await expect(page).toHaveURL(/\/studio\/projects\/prj[0-9a-f]{24}$/);
    await expect(page.getByText("Revision 1")).toBeVisible();
    await page.getByLabel("Project title").fill("Slice 7 browser project revised");
    await page.getByRole("button", { name: "Save revision" }).click();
    await expect(page.getByText("Revision 2")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Project title")).toHaveValue("Slice 7 browser project revised");
    await expectFits(page);
  } finally {
    await removeUser(user.id);
  }
});

test("studio invitation surfaces explain collaboration acceptance is not legal consent", async ({ page }, testInfo) => {
  const address = email("s7-invite-viewer", testInfo);
  const user = await createUser(address);
  try {
    await loginAndAssure(page, address, "/studio/invitations");
    await page.goto("/studio/invitations");
    await expect(page.getByRole("heading", { name: "Collaboration invitations" })).toBeVisible();
    await expect(page.getByText(/accepting an invitation is not a contract or depicted-person consent/i)).toBeVisible();
    await expectFits(page);
  } finally {
    await removeUser(user.id);
  }
});
