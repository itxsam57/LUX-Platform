import { defineConfig } from "vitest/config";

const unitCoverageScope = [
  "src/lib/foundation.ts",
  "src/lib/auth/policy.ts",
  "src/lib/profile/policy.ts",
];

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: unitCoverageScope,
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
