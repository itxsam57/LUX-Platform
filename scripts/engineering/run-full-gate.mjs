import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const steps = [
  ["Repository integrity", "pnpm repo:check"],
  ["Tracked-file secret scan", "pnpm security:secrets"],
  ["Lint", "pnpm lint"],
  ["Type check", "pnpm typecheck"],
  ["Unit tests and coverage", "pnpm test:unit"],
  ["Integration/API tests", "pnpm test:integration"],
  ["Production dependency audit", "pnpm security:dependencies"],
  ["Production build", "pnpm build"],
];

const results = [];
for (const [name, command] of steps) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(command, { shell: true, stdio: "inherit" });
  results.push({ name, command, status: result.status === 0 ? "PASS" : "FAIL" });
}

const buildPassed = results.find((item) => item.name === "Production build")?.status === "PASS";
if (buildPassed) {
  console.log("\n=== Desktop/mobile browser workflows ===");
  const result = spawnSync("pnpm test:e2e", { shell: true, stdio: "inherit" });
  results.push({ name: "Desktop/mobile browser workflows", command: "pnpm test:e2e", status: result.status === 0 ? "PASS" : "FAIL" });
} else {
  results.push({ name: "Desktop/mobile browser workflows", command: "pnpm test:e2e", status: "BLOCKED BY BUILD" });
}

const passed = results.every((item) => item.status === "PASS");
mkdirSync(".engineering/reports", { recursive: true });
writeFileSync(".engineering/reports/full-gate.json", JSON.stringify({ passed, generatedAt: new Date().toISOString(), results }, null, 2), "utf8");

console.log("\n=== Full gate summary ===");
for (const item of results) console.log(`${item.status.padEnd(16)} ${item.name}`);

const handoff = spawnSync(`node scripts/engineering/handoff.mjs --status=${passed ? "pass" : "fail"}`, { shell: true, stdio: "inherit" });
if (handoff.status !== 0) process.exit(handoff.status ?? 1);
process.exit(passed ? 0 : 1);
