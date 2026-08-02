import { expect, test } from "@playwright/test";

test("home presents the active engineering slice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LUX Platform" })).toBeVisible();
  await expect(page.getByText("Build Slice 0: repository and quality foundation")).toBeVisible();
  await page.getByRole("link", { name: "Open design-system preview" }).click();
  await expect(page).toHaveURL(/\/design-system$/);
});

test("health endpoint returns a successful contract", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: "ok" });
});

test("unknown routes render the controlled not-found state", async ({ page }) => {
  const response = await page.goto("/route-that-must-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/not found/i)).toBeVisible();
});
