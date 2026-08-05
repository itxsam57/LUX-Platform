import { defineConfig, devices } from "@playwright/test";

// LUX uses a dedicated local port so it can run alongside the user's other project on 3000.
const localBaseUrl = "http://127.0.0.1:30002";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["line"]] : "list",
  use: {
    baseURL: localBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: `${localBaseUrl}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
