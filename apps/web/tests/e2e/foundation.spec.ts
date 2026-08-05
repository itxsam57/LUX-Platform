import { expect, test, type Page } from "@playwright/test";

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("home and design-system navigation remain synchronized without refresh", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LUX Platform" })).toBeVisible();
  await expect(page.getByText("Build Slice 1: design system and application shell")).toBeVisible();

  await page.getByRole("link", { name: "Open design-system catalogue" }).click();
  await expect(page).toHaveURL(/\/design-system$/);
  await expect(page.getByRole("heading", { name: "Design system", exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "LUX Platform" })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/design-system$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Design system", exact: true })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test("primary navigation is keyboard accessible", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const link = page.getByRole("link", { name: "Open design-system catalogue" });
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/design-system$/);
});

test("health endpoint returns a successful stable contract", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({
    service: "lux-web",
    status: "ok",
    buildSlice: 1,
  });
});

test("unknown routes render a controlled 404 and recover home", async ({ page }) => {
  const response = await page.goto("/route-that-must-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await page.getByRole("link", { name: "Return home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "LUX Platform" })).toBeVisible();
});

test("foundation pages do not overflow the configured desktop or mobile viewport", async ({ page }) => {
  for (const route of ["/", "/design-system", "/route-that-must-not-exist"]) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  }
});
