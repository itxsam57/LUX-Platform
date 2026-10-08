import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { cleanupTestUser } from "./test-user-cleanup";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Trust operations E2E requires isolated Supabase service configuration");
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
  if (error || !data.user) throw error ?? new Error("Trust test user unavailable");
  return data.user;
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

test.describe.configure({ mode: "default" });

test("support resolution and appeal overturn stay synchronized between consumer and staff workspaces", async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const consumerEmail = email("trust-consumer", testInfo);
  const staffEmail = email("trust-staff", testInfo);
  const consumer = await createUser(consumerEmail);
  const staff = await createUser(staffEmail);
  const staffContext = await secondary(browser, testInfo);
  const staffPage = await staffContext.newPage();

  try {
    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", { target_user_id: staff.id });
    if (bootstrapError) throw bootstrapError;

    await login(page, consumerEmail, "/app/support");
    await page.goto("/app/support");
    await expect(page.getByRole("heading", { name: "Support and case center" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Subject").fill("Account navigation support");
    await page.getByLabel("What happened?").fill("The account owner needs a staff-reviewed support case to verify the full appeal workflow.");
    await page.getByRole("button", { name: "Create support request" }).click();
    await expect(page).toHaveURL(/\/app\/support\?notice=support$/);

    const consumerSupportRow = page.getByRole("row").filter({ hasText: "Account navigation support" });
    await expect(consumerSupportRow).toHaveCount(1);
    const supportText = await consumerSupportRow.innerText();
    const supportId = supportText.match(/sup[0-9a-f]{24}/)?.[0];
    if (!supportId) throw new Error("Support case public ID unavailable");
    await expect(consumerSupportRow).toContainText("open");

    await login(staffPage, staffEmail, "/workspace/staff/operations");
    await staffPage.goto("/workspace/staff/operations?queue=support");
    const staffSupportRow = staffPage.getByRole("row").filter({ hasText: supportId });
    await expect(staffSupportRow).toHaveCount(1);
    await staffSupportRow.getByLabel("Resolution reason").fill("Resolved after reviewing the consumer account support request.");
    await staffSupportRow.getByLabel("Type CONFIRM").fill("CONFIRM");
    await staffSupportRow.getByRole("button", { name: "Resolve" }).click();
    await expect(staffPage).toHaveURL(/queue=support&notice=resolved/);

    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: supportId })).toContainText("resolved");

    await page.getByLabel("Case type").selectOption("support_case");
    await page.getByLabel("Case public ID").fill(supportId);
    await page.getByLabel("Why should this decision be reviewed?").fill("The support resolution needs another review because the requested navigation problem remains reproducible.");
    await page.getByRole("button", { name: "Open appeal" }).click();
    await expect(page).toHaveURL(/\/app\/support\?notice=appeal$/);

    const appealRow = page.getByRole("row").filter({ hasText: `support_case: ${supportId}` });
    await expect(appealRow).toHaveCount(1);
    const appealText = await appealRow.innerText();
    const appealId = appealText.match(/apl[0-9a-f]{24}/)?.[0];
    if (!appealId) throw new Error("Appeal public ID unavailable");

    await staffPage.goto("/workspace/staff/operations?queue=appeals");
    const staffAppealRow = staffPage.getByRole("row").filter({ hasText: appealId });
    await expect(staffAppealRow).toHaveCount(1);
    await staffAppealRow.getByLabel("Decision").selectOption("overturn");
    await staffAppealRow.getByLabel("Consumer-visible appeal note").fill("Appeal accepted; reopen the original support case for continued investigation.");
    await staffAppealRow.getByRole("button", { name: "Record appeal review" }).click();
    await expect(staffPage).toHaveURL(/queue=appeals&notice=reviewed/);

    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: supportId })).toContainText("in progress");
    await expect(page.getByRole("row").filter({ hasText: appealId })).toContainText("overturned");

    await staffPage.goto("/workspace/staff/operations?queue=audit");
    await expect(staffPage.getByRole("heading", { name: "Audit" })).toBeVisible();
    await expect(staffPage.getByText(/support_case_created|support_case_resolved|appeal/i)).toBeVisible();
  } finally {
    await staffContext.close();
    await cleanupTestUser(admin, consumer.id);
    await cleanupTestUser(admin, staff.id);
  }
});
