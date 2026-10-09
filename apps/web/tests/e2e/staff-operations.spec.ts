import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { cleanupTestUser } from "./test-user-cleanup";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Staff operations E2E requires isolated Supabase service configuration");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const PASSWORD = "LuxSecureTest123";

type StaffRole = "reviewer" | "moderator" | "finance" | "copyright" | "support" | "super_admin";

const EXPECTED: Record<StaffRole, string[]> = {
  reviewer: ["Verification", "Review"],
  moderator: ["Moderation"],
  finance: ["Finance", "Payouts", "Disputes"],
  copyright: ["Copyright"],
  support: ["Users", "Support", "Disputes", "Appeals"],
  super_admin: [
    "Users", "Roles", "Verification", "Projects", "Campaigns", "Moderation", "Review",
    "Copyright", "Finance", "Payouts", "Support", "Disputes", "Appeals", "Configuration",
    "Audit", "Incidents",
  ],
};

function email(role: StaffRole, testInfo: TestInfo) {
  return "staff-matrix-" + role + "-" + testInfo.project.name + "-" + Date.now() + "-" + Math.random().toString(16).slice(2) + "@lux.test";
}

async function createUser(address: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Staff matrix user unavailable");
  return data.user;
}

async function seedStaffRole(userId: string, role: StaffRole, address: string) {
  let membershipId: string | null = null;
  if (role === "super_admin") {
    const { error } = await admin.rpc("bootstrap_super_admin", { target_user_id: userId });
    if (error) throw error;
  } else {
    const { data, error } = await admin.rpc("provision_staff_role", {
      target_user_id: userId,
      requested_role: role,
    });
    if (error || typeof data !== "string") throw error ?? new Error("Staff provisioning unavailable");
    membershipId = data;
  }

  const client = createClient(supabaseUrl!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email: address, password: PASSWORD });
  if (signInError) throw signInError;
  const { error: ageError } = await client.rpc("confirm_adult_attestation", {
    jurisdiction_code: "PK",
    policy_version: "staff-operations-e2e",
  });
  if (ageError) throw ageError;

  if (membershipId) {
    const { error: activateError } = await client.rpc("activate_workspace", {
      target_membership_id: membershipId,
    });
    if (activateError) throw activateError;
  }
}

async function login(page: Page, address: string, target: string) {
  await page.goto("/auth/login?next=" + encodeURIComponent(target));
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

test("staff operations expose only the active role capability matrix and deny direct queue bypass", async ({ browser }, testInfo) => {
  const createdIds: string[] = [];
  try {
    for (const role of Object.keys(EXPECTED) as StaffRole[]) {
      const address = email(role, testInfo);
      const user = await createUser(address);
      createdIds.push(user.id);
      await seedStaffRole(user.id, role, address);

      const context = await browser.newContext(testInfo.project.use);
      const page = await context.newPage();
      try {
        await login(page, address, "/workspace/staff/operations");
        await expect(page.getByRole("heading", { name: "Administration and launch operations" })).toBeVisible();

        const queueLinks = page.locator(".funding-tabs a");
        await expect(queueLinks).toHaveCount(EXPECTED[role].length);
        for (const label of EXPECTED[role]) {
          await expect(queueLinks.filter({ hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
        }

        const visibleLabels = await queueLinks.allTextContents();
        expect(visibleLabels.map((value) => value.trim())).toEqual(EXPECTED[role]);

        if (role === "super_admin") {
          await page.goto("/workspace/staff/operations?queue=audit");
          await expect(page.getByRole("heading", { name: "Audit" })).toBeVisible();
          await page.goto("/workspace/staff/operations?queue=not-a-real-queue");
        } else {
          await page.goto("/workspace/staff/operations?queue=audit");
        }
        await expect(page).toHaveURL(/\/access-denied\?route=workspace-staff-admin$/);
      } finally {
        await context.close();
      }
    }
  } finally {
    for (const userId of createdIds) {
      await cleanupTestUser(admin, userId);
    }
  }
});
