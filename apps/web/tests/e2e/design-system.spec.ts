import { expect, test, type Page } from "@playwright/test";

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("catalogue exposes every required primitive family without runtime errors", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.goto("/design-system");

  for (const heading of [
    "Tokens and visual language",
    "Buttons and actions",
    "Forms and selection",
    "Data display and status",
    "Navigation and progress",
    "Loading, empty, error, and notifications",
    "Dialog, drawer, tooltip, and menu",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(page.getByLabel("Preferred language")).toBeVisible();
  await expect(page.getByLabel("Support anonymously")).toBeChecked();
  await expect(page.getByLabel("Profile preview")).toBeChecked();
  await expect(page.getByRole("table", { name: "Example review queue" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("tabs and overlays remain keyboard and escape usable", async ({ page }) => {
  await page.goto("/design-system#navigation");

  const overviewTab = page.getByRole("tab", { name: "Overview" });
  await overviewTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Permissions" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Permissions" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Open dialog" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm example action" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Confirm example action" })).toBeHidden();

  await page.getByRole("button", { name: "Open drawer" }).click();
  await expect(page.getByRole("dialog", { name: "Context drawer" })).toBeVisible();
  await page.getByRole("button", { name: "Close drawer" }).click();
  await expect(page.getByRole("dialog", { name: "Context drawer" })).toBeHidden();
});

test("interactive feedback and menu actions expose truthful visible results", async ({ page }) => {
  await page.goto("/design-system#feedback");
  await page.getByRole("button", { name: "Show notification" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved safely" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByText("Saved safely")).toBeHidden();

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Preview action" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved safely" })).toBeVisible();
});

test("shell uses the correct desktop or mobile navigation and touch targets", async ({ page }, testInfo) => {
  await page.goto("/design-system");
  const isMobile = testInfo.project.name.includes("mobile");

  if (isMobile) {
    await expect(page.getByRole("navigation", { name: "Mobile catalogue navigation" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Design system sections" })).toBeHidden();
  } else {
    await expect(page.getByRole("complementary", { name: "Design system sections" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Mobile catalogue navigation" })).toBeHidden();
  }

  const undersizedControls = await page
    .locator("button:visible, a:visible, input:not([type=checkbox]):not([type=radio]):not([type=file]):visible, select:visible, textarea:visible")
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName,
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((item) => item.width < 32 || item.height < 32),
    );
  expect(undersizedControls).toEqual([]);
});
