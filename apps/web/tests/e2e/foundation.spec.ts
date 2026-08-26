import { expect, test, type Page } from "@playwright/test";

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("home, auth, and design-system navigation remain synchronized without refresh", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LUX Platform" })).toBeVisible();
  await expect(page.getByText("Build Slice 6: Crowd Demand Board")).toBeVisible();
  await expect(page.getByText("Crowd demand without implied creator commitment")).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Design system" }).click();
  await expect(page).toHaveURL(/\/design-system$/);
  await expect(page.getByRole("heading", { name: "Design system", exact: true })).toBeVisible();

  await page.goBack();
  await page.goForward();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Design system", exact: true })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("primary account navigation is keyboard accessible", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const createAccount = page.getByRole("link", { name: "Create account" });
  await expect(createAccount).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/auth\/sign-up$/);
});

test("health endpoint returns the Slice 6 contract", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({
    service: "lux-web",
    status: "ok",
    buildSlice: 6,
  });
});

test("unknown routes render a controlled 404 and recover home", async ({ page }) => {
  const response = await page.goto("/route-that-must-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await page.getByRole("link", { name: "Return home" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("public foundation pages do not overflow the configured viewport", async ({ page }) => {
  for (const route of ["/", "/auth/login", "/auth/sign-up", "/design-system", "/route-that-must-not-exist"]) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  }
});
