import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { changedFiles, currentBranch, currentCommit } from "./git-changes.mjs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "true"];
}));

const gateStatus = args.get("status") || process.env.GATE_STATUS || "fail";
const output = args.get("output") || ".engineering/reports/manual-test-handoff.md";
const files = changedFiles(args.get("base"));

function activeSlice() {
  try {
    const source = readFileSync("apps/web/src/lib/foundation.ts", "utf8");
    const number = Number(source.match(/number:\s*(\d+)/)?.[1] ?? 0);
    const name = source.match(/name:\s*"([^"]+)"/)?.[1] ?? "Repository foundation";
    return { number, name };
  } catch {
    return { number: 0, name: "Repository foundation" };
  }
}

const slice = activeSlice();
const featureRules = [
  [/^apps\/web\/src\/app\/page\.tsx$/, "Foundation home page"],
  [/^apps\/web\/src\/app\/design-system\//, "Design-system catalogue"],
  [/^apps\/web\/src\/components\/(app-shell|design-system-catalogue|ui\/)/, "Design system and application shell"],
  [/^apps\/web\/src\/app\/(loading|error)\.tsx$/, "Route loading and error states"],
  [/^apps\/web\/src\/app\/health\/route\.ts$/, "Health endpoint"],
  [/^apps\/web\/src\/app\/not-found\.tsx$/, "Controlled 404 recovery"],
  [/^apps\/web\/src\/app\/(layout\.tsx|globals\.css)$/, "Global layout and responsive presentation"],
];
const visibleFeatures = [...new Set(files.flatMap((file) =>
  featureRules.filter(([pattern]) => pattern.test(file)).map(([, name]) => name),
))];
const automationOnly = visibleFeatures.length === 0;
const status = gateStatus !== "pass"
  ? "NOT READY — AUTOMATED ENGINEERING GATE FAILED"
  : automationOnly
    ? "NO MANUAL FEATURE TEST REQUIRED"
    : "READY FOR MANUAL BROWSER TESTING";

const steps = [];
if (visibleFeatures.some((item) => ["Foundation home page", "Global layout and responsive presentation"].includes(item))) {
  steps.push("Open `http://localhost:3000/` in desktop Chrome and at a narrow mobile width. Confirm the LUX foundation card is readable, balanced, and free of horizontal scrolling.");
}
if (visibleFeatures.some((item) => ["Design-system catalogue", "Design system and application shell"].includes(item))) {
  steps.push("Use the primary link on `/` to open `/design-system`. On desktop, confirm the sidebar and top bar are clear; at a narrow mobile width, confirm the bottom navigation replaces the sidebar without covering controls.");
  steps.push("Review the catalogue sections for tokens, actions, forms, data, navigation, feedback, and overlays. Confirm the visual hierarchy, spacing, contrast, and control states feel consistent and easy to read.");
}
if (visibleFeatures.includes("Route loading and error states")) {
  steps.push("While moving between `/` and `/design-system`, confirm any brief loading state is controlled and no blank or white screen appears.");
}
if (visibleFeatures.includes("Health endpoint")) {
  steps.push(`Open \`http://localhost:3000/health\` and confirm the JSON contains \`service: lux-web\`, \`status: ok\`, and \`buildSlice: ${slice.number}\`.`);
}
if (visibleFeatures.includes("Controlled 404 recovery")) {
  steps.push("Open `http://localhost:3000/route-that-must-not-exist`, confirm the controlled **Not found** screen appears, then use **Return home**.");
}

const requestedChange = process.env.HANDOFF_REQUEST
  || `Complete Build Slice ${slice.number}: ${slice.name}.`;

const report = `${status}

# Manual-Test Handoff

## Build information

- **Project:** LUX Platform
- **Branch:** ${currentBranch()}
- **Commit:** ${currentCommit()}
- **Active slice:** ${slice.number} — ${slice.name}
- **Preview URL:** Not configured; local application uses \`http://localhost:3000\` when manual testing is required.

## Requested change

${requestedChange}

## Visible features changed

${visibleFeatures.length ? visibleFeatures.map((item) => `- ${item}`).join("\n") : "- None. This change is limited to engineering documentation, verification automation, tests, package commands, or CI."}

## Affected roles

- ${visibleFeatures.length ? "Anonymous visitor using the current public foundation surfaces" : "Engineering/CI only"}

## Exact manual tests

${steps.length ? steps.map((step, index) => `${index + 1}. ${step}\n   - **Expected:** The visible behavior is clear and comfortable, with no error, overlap, stale route, or required manual refresh.`).join("\n") : "No visible product behavior changed, so no manual browser feature test is required."}

## Regression spot-checks

${visibleFeatures.length ? "- URL and visible route remain synchronized.\n- Refresh, Back, and Forward do not produce stale or blank pages.\n- No horizontal overflow, covered controls, or uncontrolled error state.\n- Desktop and mobile navigation remain appropriate for their viewport." : "- None required from the product owner; applicable automated regressions still run in CI."}

## Unaffected areas

- Authentication, roles, database, payments, uploads, consent, creator workflows, and other future marketplace systems remain unimplemented and unchanged.
- No future product system is implied to be complete by this handoff.

## Setup requirements

${steps.length ? "1. Pull the approved branch.\n2. Run `pnpm install --frozen-lockfile`.\n3. Run `pnpm dev`.\n4. Perform only the browser steps above." : "None for the product owner."}

## Automated evidence

- ${gateStatus === "pass" ? "Applicable full engineering gate passed." : "One or more required automated checks failed or were blocked. Manual testing must not begin."}
- Changed files considered by the handoff generator: ${files.length}.

## Known limitations

- No preview deployment is configured.
- Future provider, database, role-isolation, payment, upload, consent, and private-content checks remain blocked until those systems are implemented.
`;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, report, "utf8");
console.log(report);
