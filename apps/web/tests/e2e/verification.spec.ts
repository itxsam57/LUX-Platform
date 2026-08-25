import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Verification E2E requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "LuxSecureTest123";

function testEmail(prefix: string, testInfo: TestInfo) {
  const project = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const stamp = `${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${project}-${stamp}@lux.test`;
}

async function createConfirmedUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Confirmed verification test user was not created.");
  return data.user;
}

async function removeUser(userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

async function loginAndAssure(page: Page, email: string, target: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/age-assurance/);
  await page.getByLabel("Country code").fill("PK");
  await page.getByLabel(/I confirm that I am at least 18 years old/).check();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page).toHaveURL(new RegExp(`${target.replaceAll("/", "\\/")}$`));
}

test("adult-assured user can start synthetic V2 without self-promoting", async ({ page }, testInfo) => {
  const email = testEmail("verification-v2", testInfo);
  const user = await createConfirmedUser(email);

  try {
    await loginAndAssure(page, email, "/settings/verification");

    await expect(page.getByRole("heading", { name: "Identity and performer verification" })).toBeVisible();
    await expect(page.getByText("Synthetic development verification")).toBeVisible();
    await expect(page.getByTestId("verification-v2-status")).toHaveText("Not started");

    await page.getByRole("button", { name: "Start development V2" }).click();

    await expect(page.getByTestId("verification-v2-status")).toHaveText("Pending review");
    await expect(page.getByText(/development-only workflow/i)).toBeVisible();

    const { data: subjects, error: subjectError } = await admin
      .from("verification_subjects")
      .select("status, verified_at")
      .eq("user_id", user.id)
      .eq("level", "v2");
    if (subjectError) throw subjectError;
    expect(subjects).toHaveLength(1);
    expect(subjects[0]?.status).toBe("pending");
    expect(subjects[0]?.verified_at).toBeNull();
  } finally {
    await removeUser(user.id);
  }
});
