import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error(
    "Demand E2E requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const testSupabaseUrl: string = supabaseUrl;
const testPublishableKey: string = publishableKey;
const testServiceRoleKey: string = serviceRoleKey;

const admin = createClient(testSupabaseUrl, testServiceRoleKey, {
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
  if (error || !data.user) throw error ?? new Error("Confirmed demand test user was not created.");
  return data.user;
}

async function removeUser(userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

async function createAuthenticatedUserClient(email: string) {
  const client = createClient(testSupabaseUrl, testPublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function readOwnHandle(email: string, userId: string) {
  const client = await createAuthenticatedUserClient(email);
  const { data, error } = await client
    .from("profiles")
    .select("handle")
    .eq("user_id", userId)
    .single();
  if (error || !data?.handle) throw error ?? new Error("Demand test profile handle was unavailable.");
  return data.handle;
}

async function login(page: Page, email: string, target: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function completeAgeAssurance(page: Page) {
  await page.getByLabel("Country code").fill("PK");
  await page.getByLabel(/I confirm that I am at least 18 years old/).check();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
}

async function loginAndAssureProtected(page: Page, email: string, target: string) {
  await login(page, email, target);
  await expect(page).toHaveURL(/\/age-assurance/);
  await completeAgeAssurance(page);
  await expect.poll(() => new URL(page.url()).pathname).toBe(target);
}

async function loginAssureAndNavigate(page: Page, email: string, target: string) {
  const assuranceTarget = "/app/feed";
  await login(page, email, assuranceTarget);
  await expect(page).toHaveURL(/\/(?:age-assurance|app\/feed)(?:[/?]|$)/);

  if (new URL(page.url()).pathname === "/age-assurance") {
    await completeAgeAssurance(page);
  }

  await expect.poll(() => new URL(page.url()).pathname).toBe(assuranceTarget);
  await page.goto(target);
  await expect.poll(() => new URL(page.url()).pathname).toBe(target);
}

async function openSecondaryContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  return browser.newContext(testInfo.project.use);
}

async function approveCreatorRequest(adminPage: Page, requestedUserId: string) {
  await adminPage.goto("/workspace/staff/role-requests");
  const row = adminPage.getByRole("row").filter({ hasText: requestedUserId.slice(0, 8) });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(adminPage).toHaveURL(/notice=approved/);
}

async function approveAndActivateCreatorFixture(
  creatorPage: Page,
  browser: Browser,
  testInfo: TestInfo,
  creatorEmail: string,
  creatorUserId: string,
) {
  const adminEmail = testEmail("demand-admin", testInfo);
  const superAdmin = await createConfirmedUser(adminEmail);
  const adminContext = await openSecondaryContext(browser, testInfo);
  const adminPage = await adminContext.newPage();

  try {
    await loginAndAssureProtected(creatorPage, creatorEmail, "/workspace");
    await creatorPage.getByRole("button", { name: "Request creator access" }).click();
    await expect(creatorPage).toHaveURL(/notice=creator-requested/);

    const { error: bootstrapError } = await admin.rpc("bootstrap_super_admin", {
      target_user_id: superAdmin.id,
    });
    if (bootstrapError) throw bootstrapError;

    await loginAndAssureProtected(adminPage, adminEmail, "/workspace/staff");
    await approveCreatorRequest(adminPage, creatorUserId);

    await creatorPage.goto("/workspace");
    const creatorCard = creatorPage.getByRole("region", { name: "Creator workspace" });
    await creatorCard.getByRole("button", { name: "Activate Creator" }).click();
    await expect(creatorPage).toHaveURL(/\/workspace\/creator$/);
  } finally {
    await adminContext.close();
    await removeUser(superAdmin.id);
  }
}

async function expectDocumentFitsViewport(page: Page) {
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function createDemandThroughUi(page: Page, suggestedCreatorHandle?: string) {
  await page.goto("/app/demand/new");
  await expect(page.getByRole("heading", { name: "Create a demand" })).toBeVisible();

  await page.getByLabel("Title").fill("A rooftop editorial concept");
  await page
    .getByLabel("Brief")
    .fill("A consensual adult creator concept with a clear short brief, strong boundaries, and no implied creator commitment.");
  await page.getByLabel("Category").fill("creator_idea");
  await page.getByLabel("Format").fill("short_film");

  if (suggestedCreatorHandle) {
    await page.getByLabel("Suggested creator handle").fill(suggestedCreatorHandle);
  }

  await page.getByRole("button", { name: "Publish demand" }).click();
  await expect(page).toHaveURL(/\/demand\/dem[A-Za-z0-9_-]{24}$/);

  const pathname = new URL(page.url()).pathname;
  const publicId = pathname.split("/").at(-1);
  if (!publicId) throw new Error("Created demand public ID was unavailable from the detail URL.");

  return { pathname, publicId };
}

test.describe.configure({ mode: "default" });

test("fan creates a suggested-creator demand and truthful detail survives refresh", async ({ page, browser }, testInfo) => {
  const authorEmail = testEmail("demand-author", testInfo);
  const creatorEmail = testEmail("demand-creator", testInfo);
  const author = await createConfirmedUser(authorEmail);
  const creator = await createConfirmedUser(creatorEmail);
  const creatorContext = await openSecondaryContext(browser, testInfo);
  const creatorPage = await creatorContext.newPage();

  try {
    await approveAndActivateCreatorFixture(creatorPage, browser, testInfo, creatorEmail, creator.id);
    const creatorHandle = await readOwnHandle(creatorEmail, creator.id);

    await loginAssureAndNavigate(page, authorEmail, "/app/demand");
    await expect(page.getByRole("heading", { name: "Crowd Demand Board" })).toBeVisible();
    await expectDocumentFitsViewport(page);

    await page.getByRole("link", { name: "Create demand" }).click();
    await expect(page).toHaveURL(/\/app\/demand\/new$/);
    await expectDocumentFitsViewport(page);

    const { pathname } = await createDemandThroughUi(page, creatorHandle);

    await expect(page.getByRole("heading", { name: "A rooftop editorial concept" })).toBeVisible();
    await expect(page.getByTestId("demand-state")).toHaveText("Open");
    await expect(page.getByTestId("demand-suggested-creator")).toContainText(`@${creatorHandle}`);
    await expect(page.getByTestId("demand-suggested-creator")).toContainText(/suggested|requested/i);
    await expect(page.locator("body")).not.toContainText(author.id);
    await expect(page.locator("body")).not.toContainText(creator.id);
    await expectDocumentFitsViewport(page);

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${pathname.replaceAll("/", "\\/")}$`));
    await expect(page.getByTestId("demand-state")).toHaveText("Open");
    await expect(page.getByTestId("demand-suggested-creator")).toContainText(/suggested|requested/i);
  } finally {
    await creatorContext.close();
    await removeUser(author.id);
    await removeUser(creator.id);
  }
});

test("support remains one edge after an equivalent retry and persists across refresh", async ({ page, browser }, testInfo) => {
  const authorEmail = testEmail("demand-support-author", testInfo);
  const supporterEmail = testEmail("demand-supporter", testInfo);
  const author = await createConfirmedUser(authorEmail);
  const supporter = await createConfirmedUser(supporterEmail);
  const supporterContext = await openSecondaryContext(browser, testInfo);
  const supporterPage = await supporterContext.newPage();

  try {
    const supporterHandle = await readOwnHandle(supporterEmail, supporter.id);

    await loginAssureAndNavigate(page, authorEmail, "/app/demand");
    const { pathname, publicId } = await createDemandThroughUi(page);

    await loginAssureAndNavigate(supporterPage, supporterEmail, pathname);
    await expect(supporterPage.getByTestId("demand-support-count")).toHaveText("0");
    await supporterPage.getByLabel("Show my handle publicly").check();
    await supporterPage.getByRole("button", { name: "Support demand" }).click();
    await expect(supporterPage.getByTestId("demand-support-count")).toHaveText("1");
    await expect(supporterPage.getByTestId("demand-supporters")).toContainText(`@${supporterHandle}`);

    const supporterClient = await createAuthenticatedUserClient(supporterEmail);
    const { error: retryError } = await supporterClient.rpc("set_demand_support", {
      requested_public_id: publicId,
      enabled: true,
      publicly_attributed: true,
    });
    if (retryError) throw retryError;

    await supporterPage.reload();
    await expect(supporterPage.getByTestId("demand-support-count")).toHaveText("1");
    await expect(supporterPage.getByRole("button", { name: "Remove support" })).toBeVisible();
    await expectDocumentFitsViewport(supporterPage);
  } finally {
    await supporterContext.close();
    await removeUser(author.id);
    await removeUser(supporter.id);
  }
});

test("suggested creator can decline privately and only their interest becomes public", async ({ page, browser }, testInfo) => {
  const authorEmail = testEmail("demand-response-author", testInfo);
  const creatorEmail = testEmail("demand-response-creator", testInfo);
  const author = await createConfirmedUser(authorEmail);
  const creator = await createConfirmedUser(creatorEmail);
  const creatorContext = await openSecondaryContext(browser, testInfo);
  const creatorPage = await creatorContext.newPage();

  try {
    await approveAndActivateCreatorFixture(creatorPage, browser, testInfo, creatorEmail, creator.id);
    const creatorHandle = await readOwnHandle(creatorEmail, creator.id);

    await loginAssureAndNavigate(page, authorEmail, "/app/demand");
    const { pathname } = await createDemandThroughUi(page, creatorHandle);

    await creatorPage.goto("/workspace/creator/demand");
    const responseCard = creatorPage.getByTestId("creator-demand-card").filter({ hasText: "A rooftop editorial concept" });
    await expect(responseCard).toHaveCount(1);
    await expect(responseCard).toContainText(/suggested|requested/i);

    await responseCard.getByRole("button", { name: "Decline privately" }).click();
    await expect(responseCard.getByTestId("creator-demand-response")).toHaveText("Declined privately");

    await page.goto(pathname);
    await expect(page.getByTestId("demand-state")).toHaveText("Open");
    await expect(page.locator("body")).not.toContainText(/declined/i);

    await responseCard.getByRole("button", { name: "Mark interested" }).click();
    await expect(responseCard.getByTestId("creator-demand-response")).toHaveText("Interested");

    await page.reload();
    await expect(page.getByTestId("demand-state")).toHaveText("Creator interested");
    await expect(page.locator("body")).not.toContainText(/declined/i);
    await expectDocumentFitsViewport(page);

    await creatorPage.reload();
    const refreshedCard = creatorPage.getByTestId("creator-demand-card").filter({ hasText: "A rooftop editorial concept" });
    await expect(refreshedCard.getByTestId("creator-demand-response")).toHaveText("Interested");
    await expectDocumentFitsViewport(creatorPage);
  } finally {
    await creatorContext.close();
    await removeUser(author.id);
    await removeUser(creator.id);
  }
});
