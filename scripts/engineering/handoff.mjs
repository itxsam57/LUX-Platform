import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { changedFiles, currentBranch, currentCommit } from "./git-changes.mjs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "true"];
}));

const gateStatus = args.get("status") || process.env.GATE_STATUS || "fail";
const output = args.get("output") || ".engineering/reports/manual-test-handoff.md";
const files = changedFiles(args.get("base"));
const featureRules = [
  [/^apps\/web\/src\/app\/page\.tsx$/, "Foundation home page"],
  [/^apps\/web\/src\/app\/design-system\//, "Design-system preview"],
  [/^apps\/web\/src\/app\/health\/route\.ts$/, "Health endpoint"],
  [/^apps\/web\/src\/app\/not-found\.tsx$/, "Controlled 404 recovery"],
  [/^apps\/web\/src\/app\/(layout\.tsx|globals\.css)$/, "Global layout and responsive presentation"],
];
const visibleFeatures = [...new Set(files.flatMap((file) => featureRules.filter(([pattern]) => pattern.test(file)).map(([, name]) => name)))];
const automationOnly = visibleFeatures.length === 0;
const status = gateStatus !== "pass"
  ? "NOT READY — AUTOMATED ENGINEERING GATE FAILED"
  : automationOnly
    ? "NO MANUAL FEATURE TEST REQUIRED"
    : "READY FOR MANUAL BROWSER TESTING";

const steps = [];
if (visibleFeatures.includes("Foundation home page") || visibleFeatures.includes("Global layout and responsive presentation")) {
  steps.push("Open `http://localhost:3000/` and confirm the LUX foundation card is readable, balanced, and has no horizontal scrolling at desktop and narrow mobile widths.");
}
if (visibleFeatures.includes("Design-system preview")) {
  steps.push("From `/`, click **Open design-system preview**. Confirm `/design-system` appears without manual refresh, then use browser Back and Forward and confirm the visible page matches the URL.");
}
if (visibleFeatures.includes("Health endpoint")) {
  steps.push("Open `http://localhost:3000/health` and confirm JSON visibly contains `service: lux-web`, `status: ok`, and `buildSlice: 0`.");
}
if (visibleFeatures.includes("Controlled 404 recovery")) {
  steps.push("Open `http://localhost:3000/route-that-must-not-exist`, confirm the controlled **Not found** screen appears, then use **Return home**.");
}

const report = `${status}

# Manual-Test Handoff

## Build information

- **Project:** LUX Platform
- **Branch:** ${currentBranch()}
- **Commit:** ${currentCommit()}
- **Preview URL:** Not configured; local application uses \`http://localhost:3000\` when manual testing is required.

## Requested change

${process.env.HANDOFF_REQUEST || "Install and validate the repository-specific AI Engineering Automation Kit without redesigning product code."}

## Visible features changed

${visibleFeatures.length ? visibleFeatures.map((item) => `- ${item}`).join("\n") : "- None. This change is limited to engineering documentation, verification automation, tests, package commands, and CI."}

## Affected roles

- ${visibleFeatures.length ? "Anonymous visitor (foundation surfaces)" : "Engineering/CI only"}

## Exact manual tests

${steps.length ? steps.map((step, index) => `${index + 1}. ${step}\n   - **Expected:** The described visible behavior works without errors or a required manual refresh.`).join("\n") : "No visible product behavior changed, so no manual browser feature test is required for this installation."}

## Regression spot-checks

${visibleFeatures.length ? "- URL and visible route remain synchronized.\n- Refresh, Back, and Forward do not produce stale or blank pages.\n- No horizontal overflow or visible error state." : "- None required from the product owner; automated foundation regressions still run in CI."}

## Unaffected areas

- Authentication, roles, database, payments, uploads, creator workflows, and all future marketplace features remain unimplemented and unchanged.
- Existing visible foundation copy and styling were not redesigned by the automation installation.

## Setup requirements

${steps.length ? "1. Pull the approved branch.\n2. Run `pnpm install --frozen-lockfile`.\n3. Run `pnpm dev`.\n4. Perform only the browser steps above." : "None for the product owner."}

## Automated evidence

- ${gateStatus === "pass" ? "Applicable full engineering gate passed." : "One or more required automated checks failed or were blocked. Manual testing must not begin."}
- Changed files considered by the handoff generator: ${files.length}.

## Known limitations

- No preview deployment is configured.
- Future provider, database, role-isolation, payment, upload, and private-content checks remain blocked until those systems are implemented.
`;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, report, "utf8");
console.log(report);
