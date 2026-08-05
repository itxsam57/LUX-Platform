import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(name, command) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(command, { shell: true, stdio: "inherit" });
  return { name, command, status: result.status === 0 ? "PASS" : "FAIL" };
}

const prerequisiteSteps = [
  ["Repository integrity", "pnpm repo:check"],
  ["Tracked-file secret scan", "pnpm security:secrets"],
  ["Lint", "pnpm lint"],
  ["Type check", "pnpm typecheck"],
  ["Unit tests and coverage", "pnpm test:unit"],
  ["Integration/API tests", "pnpm test:integration"],
  ["Production dependency audit", "pnpm security:dependencies"],
];

const results = prerequisiteSteps.map(([name, command]) => run(name, command));
const prerequisitesPassed = results.every((item) => item.status === "PASS");

if (prerequisitesPassed) {
  results.push(run("Production build", "pnpm build"));
} else {
  results.push({ name: "Production build", command: "pnpm build", status: "BLOCKED BY PREREQUISITE" });
}

const buildPassed = results.find((item) => item.name === "Production build")?.status === "PASS";
const skipBrowser = process.env.SKIP_BROWSER === "1";
if (skipBrowser) {
  results.push({ name: "Desktop/mobile browser workflows", command: "pnpm test:e2e", status: "NOT APPLICABLE" });
} else if (!buildPassed) {
  results.push({ name: "Desktop/mobile browser workflows", command: "pnpm test:e2e", status: "BLOCKED BY BUILD" });
} else {
  if (process.env.CI) {
    results.push(run("Install Chromium test runtime", "pnpm --filter @lux/web exec playwright install --with-deps chromium"));
  }
  const browserRuntimeReady = !process.env.CI || results.at(-1)?.status === "PASS";
  results.push(browserRuntimeReady
    ? run("Desktop/mobile browser workflows", "pnpm test:e2e")
    : { name: "Desktop/mobile browser workflows", command: "pnpm test:e2e", status: "BLOCKED BY BROWSER INSTALL" });
}

const acceptedStatuses = new Set(["PASS", "NOT APPLICABLE"]);
const passed = results.every((item) => acceptedStatuses.has(item.status));
mkdirSync(".engineering/reports", { recursive: true });
writeFileSync(".engineering/reports/full-gate.json", JSON.stringify({ passed, generatedAt: new Date().toISOString(), results }, null, 2), "utf8");

console.log("\n=== Full gate summary ===");
for (const item of results) console.log(`${item.status.padEnd(30)} ${item.name}`);

const handoff = spawnSync(`node scripts/engineering/handoff.mjs --status=${passed ? "pass" : "fail"}`, { shell: true, stdio: "inherit" });
if (handoff.status !== 0) process.exit(handoff.status ?? 1);
process.exit(passed ? 0 : 1);
