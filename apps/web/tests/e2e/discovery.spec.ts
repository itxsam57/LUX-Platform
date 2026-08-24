import { expect, test } from "@playwright/test";

const protectedDiscoveryRoutes = ["/app/feed", "/app/explore", "/app/search"] as const;

for (const route of protectedDiscoveryRoutes) {
  test(`${route} is a real protected route rather than a 404`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/auth\/login\?next=/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });
}

test("discovery routes do not introduce horizontal document overflow on mobile", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile-only viewport safety assertion");
  await page.goto("/app/feed");
  await expect(page).toHaveURL(/\/auth\/login\?next=/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
