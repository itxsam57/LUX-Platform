import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { changedFiles, currentBranch, currentCommit } from "./git-changes.mjs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "true"];
}));

const gateStatus = args.get("status") || process.env.GATE_STATUS || "fail";
const output = args.get("output") || ".engineering/reports/manual-test-handoff.md";
const files = changedFiles(args.get("base"));
const localUrl = "http://127.0.0.1:30002";

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

function ownerTestingPolicy() {
  const path = ".engineering/CONTINUATION.json";
  if (!existsSync(path)) return "PER_SLICE";
  try {
    const state = JSON.parse(readFileSync(path, "utf8"));
    return state?.governor?.owner_testing_policy === "BATCH_AFTER_SLICE_10"
      ? "BATCH_AFTER_SLICE_10"
      : "PER_SLICE";
  } catch {
    return "PER_SLICE";
  }
}

const slice = activeSlice();
const testingPolicy = ownerTestingPolicy();
const ownerTestingDeferred = testingPolicy === "BATCH_AFTER_SLICE_10" && slice.number >= 4 && slice.number < 10;

const featureRules = [
  [/^apps\/web\/src\/app\/page\.tsx$/, "Foundation home page"],
  [/^apps\/web\/src\/app\/design-system\//, "Design-system catalogue"],
  [/^apps\/web\/src\/components\/(app-shell|design-system-catalogue|ui\/)/, "Design system and application shell"],
  [/^apps\/web\/src\/app\/(loading|error)\.tsx$/, "Route loading and error states"],
  [/^apps\/web\/src\/app\/health\/route\.ts$/, "Health endpoint"],
  [/^apps\/web\/src\/app\/not-found\.tsx$/, "Controlled 404 recovery"],
  [/^apps\/web\/src\/app\/(layout\.tsx|globals\.css|auth-workspace\.css|profile-privacy\.css|discovery\.css|verification\.css|demand\.css|studio\.css|contracts\.css|campaigns\.css|funding\.css)$/, "Global responsive presentation"],
  [/^apps\/web\/src\/(app\/auth\/|components\/auth\/|lib\/supabase\/|middleware\.ts)/, "Authentication and account recovery"],
  [/^apps\/web\/src\/app\/age-assurance\//, "Adult access assurance"],
  [/^apps\/web\/src\/(app\/workspace\/|components\/workspace\/|lib\/auth\/context\.ts)/, "Workspace selection and isolation"],
  [/^apps\/web\/src\/app\/settings\/security\//, "Session security and account audit"],
  [/^apps\/web\/src\/app\/access-denied\//, "Controlled authorization denial"],
  [/^apps\/web\/src\/(app\/settings\/profile\/|components\/profile\/profile-editor|lib\/profile\/)/, "Owner profile editing and media"],
  [/^apps\/web\/src\/(app\/u\/|app\/profile-media\/|components\/profile\/(public-profile|profile-social-actions))/, "Public profile visibility and social controls"],
  [/^apps\/web\/src\/(app\/settings\/privacy\/|components\/profile\/privacy-settings)/, "Privacy preferences, export, and deletion requests"],
  [/^apps\/web\/src\/app\/notifications\//, "Profile notifications"],
  [/^apps\/web\/src\/(app\/app\/(feed|explore|search)\/|components\/discovery\/|lib\/discovery\/)/, "Feed, explore, and public discovery"],
  [/^apps\/web\/src\/(app\/settings\/verification\/|components\/verification\/|lib\/verification\/)/, "Creator and depicted-person verification"],
  [/^apps\/web\/src\/(app\/app\/demand\/|app\/demand\/|components\/demand\/|lib\/demand\/)/, "Crowd Demand Board"],
  [/^apps\/web\/src\/(app\/studio\/projects\/|app\/studio\/invitations\/|components\/(projects|invitations)\/|lib\/(projects|invitations)\/)/, "Project drafts and collaboration invitations"],
  [/^apps\/web\/src\/(components\/contracts\/|lib\/contracts\/|app\/studio\/projects\/[^/]+\/terms\/)/, "Contracts, consent, and boundaries"],
  [/^apps\/web\/src\/(components\/campaigns\/|lib\/campaigns\/|app\/p\/|app\/studio\/projects\/[^/]+\/campaign\/)/, "Campaign publishing and public pre-booking"],
  [/^apps\/web\/src\/(components\/funding\/|lib\/(funding|payments)\/|app\/app\/funding\/)/, "Fan funding dashboard, badges, and payment state"],
  [/^supabase\/(config\.toml|migrations\/|tests\/)/, "Database/RLS marketplace boundary"],
];
const visibleFeatures = [...new Set(files.flatMap((file) =>
  featureRules.filter(([pattern]) => pattern.test(file)).map(([, name]) => name),
))];
const automationOnly = visibleFeatures.length === 0;
const status = gateStatus !== "pass"
  ? "NOT READY — AUTOMATED ENGINEERING GATE FAILED"
  : ownerTestingDeferred
    ? `AUTOMATED SLICE ${slice.number} CHECKPOINT PASS — OWNER TESTING DEFERRED TO SLICE 10`
    : automationOnly
      ? "NO MANUAL FEATURE TEST REQUIRED"
      : "READY FOR MANUAL BROWSER TESTING";

const steps = [];
if (visibleFeatures.includes("Foundation home page") || visibleFeatures.includes("Global responsive presentation")) {
  steps.push(`Open \`${localUrl}/\` in desktop Brave and at a narrow mobile width. Confirm the Slice ${slice.number} account entry card is readable, balanced, and free of horizontal scrolling.`);
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
if (visibleFeatures.includes("Owner profile editing and media")) {
  steps.push("Open `/settings/profile`, save a valid handle/display name/bio/language/visibility and up to five HTTPS links, then refresh and confirm the saved values persist. Upload an avatar and banner and confirm both render through the guarded handle-based media route without exposing an account UUID.");
}
if (visibleFeatures.includes("Public profile visibility and social controls")) {
  steps.push("With two adult-assured test accounts, verify a public profile is readable, an unlisted profile remains direct-link visible but undiscoverable, and a private profile is owner-only. Follow/unfollow, mute/unmute, block, then confirm blocking removes follow edges and hides the profile in both directions.");
}
if (visibleFeatures.includes("Privacy preferences, export, and deletion requests")) {
  steps.push("Open `/settings/privacy` with a verified session. Change supporter anonymity, download the JSON export and confirm it contains no tokens/auth metadata/age evidence/internal UUIDs, submit the deletion phrase twice and confirm only one active request exists, then cancel it. Repeat privacy removal after age assurance is absent and confirm unblock/unmute remain available.");
}
if (visibleFeatures.includes("Profile notifications")) {
  steps.push("Create a follower notification, open `/notifications`, confirm only the recipient can read it, mark it read, follow its profile deep link, then block the actor and confirm that actor’s notification is suppressed.");
}
if (visibleFeatures.includes("Feed, explore, and public discovery")) {
  steps.push("With two adult-assured accounts, open `/app/feed`, `/app/explore`, and `/app/search`. Confirm public profiles appear, Following only includes followed eligible profiles, private/unlisted profiles are not publicly discoverable, and blocking either direction removes the profile from feed/explore/search after refresh.");
}
if (visibleFeatures.includes("Creator and depicted-person verification")) {
  steps.push("Complete the configured development V2 identity workflow and, on the depicted-performer test account, the V3 performer requirements. Confirm public surfaces show only safe verification state, while expired/revoked or incomplete verification blocks the protected creator/performer action without exposing evidence.");
}
if (visibleFeatures.includes("Crowd Demand Board")) {
  steps.push("Create a demand, support it from a second account, repeat the support action and confirm it remains one support. Reference a creator and confirm public wording says suggested/requested, then decline privately from the creator account and verify no public decline is exposed; finally mark creator interest and confirm only that eligible creator can begin conversion.");
}
if (visibleFeatures.includes("Project drafts and collaboration invitations")) {
  steps.push("Convert an interested demand into a creator-owned project draft, edit and refresh it, then use two tabs to confirm a stale revision cannot overwrite a newer revision. Send a collaboration invitation, exercise interested/considering/negotiating/accepted/declined states, and confirm invitation acceptance does not create legal consent or contract lock.");
}
if (visibleFeatures.includes("Contracts, consent, and boundaries")) {
  steps.push("Publish exact project terms, accept them with the required verified participant, and complete depicted-person consent personally from the performer account. Change a material term and confirm affected acceptance reopens. Confirm an agency cannot execute performer consent and contract lock is unavailable until every required acceptance/consent is current.");
}
if (visibleFeatures.includes("Campaign publishing and public pre-booking")) {
  steps.push("Attempt campaign publication before its verification/contract gates and confirm denial. Complete the gates, publish, and confirm `/p/[publicId]` shows only truthful target/current amount/supporter/deadline/refund/terms data. Pre-book twice with the same action/idempotency path and confirm one durable commitment is created.");
}
if (visibleFeatures.includes("Fan funding dashboard, badges, and payment state")) {
  steps.push("Open `/app/funding` and verify only the signed-in fan’s commitments appear across Active/Successful/Refunded/All. Confirm processor/internal IDs are absent, supporter visibility/badge choices persist, a material campaign change presents the exact comparison, refund is idempotent, and sandbox payment state is clearly labeled as non-production.");
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

const profileOrPrivacyChanged = visibleFeatures.some((item) => [
  "Owner profile editing and media",
  "Public profile visibility and social controls",
  "Privacy preferences, export, and deletion requests",
  "Profile notifications",
].includes(item));
const marketplaceBoundaryChanged = visibleFeatures.some((item) => [
  "Feed, explore, and public discovery",
  "Creator and depicted-person verification",
  "Crowd Demand Board",
  "Project drafts and collaboration invitations",
  "Contracts, consent, and boundaries",
  "Campaign publishing and public pre-booking",
  "Fan funding dashboard, badges, and payment state",
].includes(item));
const accountBoundaryChanged = visibleFeatures.some((item) =>
  item.includes("Workspace") || item.includes("Authentication") || item.includes("Adult") || item.includes("Session") || profileOrPrivacyChanged || marketplaceBoundaryChanged,
);

const manualSection = ownerTestingDeferred
  ? `Owner-visible testing is intentionally deferred by the approved continuous Slice 4→10 execution policy. Do **not** perform the steps below yet. They are accumulated for the combined Slice 10 owner handoff.\n\n${steps.length ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n") : "No owner-visible step has accumulated yet."}`
  : steps.length
    ? steps.map((step, index) => `${index + 1}. ${step}\n   - **Expected:** The visible behavior is clear and the trusted state remains synchronized without overlap, stale routes, permission merging, privacy leakage, false financial state, or manual refresh.`).join("\n")
    : "No visible product behavior changed, so no manual browser feature test is required.";

const deferredAreas = [];
if (slice.number < 5) deferredAreas.push("creator/depicted-person verification");
if (slice.number < 6) deferredAreas.push("Crowd Demand Board");
if (slice.number < 7) deferredAreas.push("project drafts and collaboration invitations");
if (slice.number < 8) deferredAreas.push("contracts, consent and boundaries");
if (slice.number < 9) deferredAreas.push("campaign publishing and pre-booking");
if (slice.number < 10) deferredAreas.push("funding dashboard, badges and payment adapter state");
deferredAreas.push("production uploads", "delivery review", "secure releases", "double-entry ledger/revenue splits/payouts", "copyright operations", "full agency operations", "moderation and later administration");

const report = `${status}

# Manual-Test Handoff

## Build information

- **Project:** LUX Platform
- **Branch:** ${currentBranch()}
- **Commit:** ${currentCommit()}
- **Active slice:** ${slice.number} — ${slice.name}
- **Owner testing policy:** ${testingPolicy}
- **Local URL:** \`${localUrl}\`

## Requested change

${requestedChange}

## Visible features changed

${visibleFeatures.length ? visibleFeatures.map((item) => `- ${item}`).join("\n") : "- None. This change is limited to engineering documentation, verification automation, tests, package commands, or CI."}

## Affected roles

${accountBoundaryChanged
  ? "- Anonymous visitor\n- Verified fan\n- Approved creator using the same canonical profile\n- Requested/approved creator or agency account\n- Verified creator/depicted-person roles when introduced\n- Restricted staff and super-admin contexts"
  : "- Anonymous visitor using the current public foundation surfaces"}

## Exact manual tests

${manualSection}

## Regression spot-checks

${visibleFeatures.length ? "- URL and visible route remain synchronized.\n- Refresh, Back, and Forward do not bypass authentication, privacy, verification, state, or active-workspace checks.\n- A requested role grants no permission.\n- Approved roles remain separate until explicitly activated.\n- Private/unlisted/public profile behavior remains distinct.\n- Public projections expose no internal user UUIDs, legal identity evidence, private negotiation data, or payment processor identifiers.\n- Duplicate actions remain idempotent where required.\n- No horizontal overflow, covered controls, uncontrolled error state, fabricated demand/financial state, or manual-refresh dependency.\n- All previously accepted Slice 1–3 behavior remains intact." : "- None required from the product owner; applicable automated regressions still run in CI."}

## Unaffected / deferred areas

${deferredAreas.map((item) => `- ${item}`).join("\n")}
${slice.number < 5 ? "- Creator/depicted-person identity verification is still Slice 5 and is not implied by the viewer adult-access gate or an approved Creator workspace." : "- Adult viewer assurance remains distinct from stricter V2/V3 identity/performer verification."}

## Setup requirements

${ownerTestingDeferred
  ? "None for the product owner at this intermediate checkpoint. Hosted-development migrations and the local browser setup will be reconciled once, immediately before the combined Slice 10 owner handoff."
  : steps.length
    ? "1. Pull the approved branch.\n2. Put the hosted development Supabase URL and publishable key in `apps/web/.env.local`; never put a service-role/secret key there.\n3. Set `NEXT_PUBLIC_APP_URL=http://127.0.0.1:30002` and keep development-only provider modes explicit.\n4. Inspect linked migration history, run `supabase db push --linked --dry-run`, and apply only the tracked migrations required through the active slice; never reset the hosted development database.\n5. Run `pnpm install --frozen-lockfile`.\n6. Run `pnpm dev`.\n7. Perform the browser steps above using synthetic test accounts and sandbox provider modes only where explicitly labeled."
    : "None for the product owner."}

## Automated evidence

- ${gateStatus === "pass" ? "Applicable full engineering gate passed, including the isolated Supabase database/RLS suite and required desktop/mobile browser workflows." : "One or more required automated checks failed or were blocked. Owner manual testing must not begin."}
- ${ownerTestingDeferred ? "This is an intermediate automated checkpoint; owner acceptance is neither requested nor claimed." : "Owner acceptance remains separate from automated evidence."}
- Changed files considered by the handoff generator: ${files.length}.

## Known limitations

- No preview deployment is configured.
- The owner’s PC cannot run the Docker-based local Supabase stack; GitHub Actions is the mandatory database/RLS enforcement environment.
- Provider-required age assurance remains blocked until a production provider adapter is selected; self-attestation is restricted to the explicit development mode.
- Synthetic identity/payment adapters, when present, are development/CI workflow tools only and never constitute production provider verification or real financial processing.
`;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, report, "utf8");
console.log(report);
