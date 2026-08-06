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
const localUrl = "http://localhost:30002";

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
  [/^apps\/web\/src\/app\/(layout\.tsx|globals\.css|auth-workspace\.css)$/, "Global responsive presentation"],
  [/^apps\/web\/src\/(app\/auth\/|components\/auth\/|lib\/supabase\/|middleware\.ts)/, "Authentication and account recovery"],
  [/^apps\/web\/src\/app\/age-assurance\//, "Adult access assurance"],
  [/^apps\/web\/src\/(app\/workspace\/|components\/workspace\/|lib\/auth\/context\.ts)/, "Workspace selection and isolation"],
  [/^apps\/web\/src\/app\/settings\/security\//, "Session security and account audit"],
  [/^apps\/web\/src\/app\/access-denied\//, "Controlled authorization denial"],
  [/^supabase\/(config\.toml|migrations\/|tests\/)/, "Authentication database and RLS boundary"],
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
if (visibleFeatures.includes("Foundation home page") || visibleFeatures.includes("Global responsive presentation")) {
  steps.push(`Open \`${localUrl}/\` in desktop Chrome and at a narrow mobile width. Confirm the Slice ${slice.number} account entry card is readable, balanced, and free of horizontal scrolling.`);
}
if (visibleFeatures.includes("Authentication and account recovery")) {
  steps.push("Create a new test account with an email you can access. Confirm weak passwords show a clear field error and a valid submission gives the generic check-email response without revealing whether an address already exists.");
  steps.push("Verify the email, sign in, sign out, request password recovery, open the newest recovery link, choose a new password, and confirm the old password no longer signs in.");
}
if (visibleFeatures.includes("Adult access assurance")) {
  steps.push("After verified sign-in, confirm the adult gate appears before any workspace. In the configured development mode, enter the two-letter jurisdiction code and confirm adult/lawful access; verify the decision survives refresh.");
}
if (visibleFeatures.includes("Workspace selection and isolation") || visibleFeatures.includes("Controlled authorization denial")) {
  steps.push("Open the fan workspace, then manually change the URL to `/workspace/creator` and `/workspace/staff`. Confirm both are denied while the fan context remains active.");
  steps.push("Request creator access. Confirm the request stays pending, cannot be activated before approval, and does not add creator permission merely by changing the URL.");
  steps.push("After the designated super-admin approves the test creator request, activate Creator from `/workspace`. Confirm the creator route opens while the staff route remains denied; then use Back, Forward, refresh, and direct navigation without stale or merged permissions.");
}
if (visibleFeatures.includes("Session security and account audit")) {
  steps.push("Sign into the same test account in two browser windows. Use **Sign out all devices** in one window, then refresh a protected route in the second. Confirm both sessions require sign-in again and the security history contains sanitized events only.");
}
if (visibleFeatures.includes("Design-system catalogue")) {
  steps.push("Open `/design-system` and confirm the previously accepted Slice 1 catalogue remains visually unchanged and its sidebar navigation stays aligned.");
}
if (visibleFeatures.includes("Health endpoint")) {
  steps.push(`Open \`${localUrl}/health\` and confirm the JSON contains \`service: lux-web\`, \`status: ok\`, and \`buildSlice: ${slice.number}\`.`);
}
if (visibleFeatures.includes("Controlled 404 recovery")) {
  steps.push(`Open \`${localUrl}/route-that-must-not-exist\`, confirm the controlled **Not found** screen appears, then use **Return home**.`);
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
- **Local URL:** \`${localUrl}\`

## Requested change

${requestedChange}

## Visible features changed

${visibleFeatures.length ? visibleFeatures.map((item) => `- ${item}`).join("\n") : "- None. This change is limited to engineering documentation, verification automation, tests, package commands, or CI."}

## Affected roles

${visibleFeatures.some((item) => item.includes("Workspace") || item.includes("Authentication") || item.includes("Adult") || item.includes("Session"))
  ? "- Anonymous visitor\n- Verified fan\n- Requested/approved creator or agency account\n- Restricted staff and super-admin contexts"
  : "- Anonymous visitor using the current public foundation surfaces"}

## Exact manual tests

${steps.length ? steps.map((step, index) => `${index + 1}. ${step}\n   - **Expected:** The visible behavior is clear and the trusted state remains synchronized without overlap, stale routes, permission merging, or manual refresh.`).join("\n") : "No visible product behavior changed, so no manual browser feature test is required."}

## Regression spot-checks

${visibleFeatures.length ? "- URL and visible route remain synchronized.\n- Refresh, Back, and Forward do not bypass authentication or active-workspace checks.\n- A requested role grants no permission.\n- Approved roles remain separate until explicitly activated.\n- No horizontal overflow, covered controls, or uncontrolled error state.\n- Slice 1 design-system presentation remains intact." : "- None required from the product owner; applicable automated regressions still run in CI."}

## Unaffected areas

- Profiles, feeds, campaigns, payments, production uploads, consent, secure releases, payouts, copyright operations, and later marketplace systems remain unimplemented and unchanged.
- Creator/depicted-person identity verification is still Slice 5 and is not implied by the viewer adult-access gate.

## Setup requirements

${steps.length ? "1. Pull the approved branch.\n2. Copy `.env.example` to `.env.local` and add the hosted development Supabase URL and publishable key supplied for testing.\n3. Keep `AGE_ASSURANCE_MODE=self_attestation` only in the approved development environment.\n4. Run `pnpm install --frozen-lockfile`.\n5. Run `pnpm dev`.\n6. Perform only the browser steps above using synthetic test accounts." : "None for the product owner."}

## Automated evidence

- ${gateStatus === "pass" ? "Applicable full engineering gate passed, including the isolated Supabase database/RLS suite when required." : "One or more required automated checks failed or were blocked. Manual testing must not begin."}
- Changed files considered by the handoff generator: ${files.length}.

## Known limitations

- No preview deployment is configured.
- The owner’s PC cannot run the Docker-based local Supabase stack; GitHub Actions is the mandatory database/RLS enforcement environment.
- Provider-required age assurance remains blocked until a production provider adapter is selected; self-attestation is restricted to the explicit development mode.
`;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, report, "utf8");
console.log(report);
