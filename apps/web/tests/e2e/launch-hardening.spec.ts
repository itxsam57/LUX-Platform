import { expect, test } from "@playwright/test";

for (const route of [
  { path: "/privacy", heading: "Privacy" },
  { path: "/terms", heading: "Platform terms" },
  { path: "/help", heading: "Help and support" },
]) {
  test(`${route.path} is public, refresh-safe, and responsive`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  });
}

test("home exposes public legal and help navigation with browser history recovery", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/privacy$/);
});
