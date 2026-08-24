import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "apps/web/package.json",
  "docs/engineering/PROJECT-PROFILE.md",
  "docs/engineering/PROJECT-TEST-MATRIX.md",
  "docs/engineering/REGRESSION-REGISTER.md",
  "docs/engineering/02_SLICE_2_AUTH_SECURITY_SPEC.md",
  "supabase/config.toml",
  "supabase/migrations/20260806000100_slice_2_auth_workspace.sql",
  "supabase/tests/0001_auth_workspace_rls.test.sql",
];

const forbiddenTrackedPatterns = [
  { name: "dependency directory", pattern: /(^|\/)node_modules\// },
  { name: "Next.js build output", pattern: /(^|\/)\.next\// },
  { name: "coverage output", pattern: /(^|\/)coverage\// },
  { name: "Playwright report", pattern: /(^|\/)playwright-report\// },
  { name: "Playwright test results", pattern: /(^|\/)test-results\// },
  { name: "engineering generated report", pattern: /(^|\/)\.engineering\/reports\// },
  { name: "private environment file", pattern: /(^|\/)\.env(?:\..+)?$/ },
  { name: "private key", pattern: /\.(?:pem|p12|pfx|key)$/i },
];

function gitTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error("Repository check could not read tracked files.");
    console.error(result.stderr.trim());
    process.exit(1);
  }
  return result.stdout.split("\0").filter(Boolean);
}

const failures = [];
for (const file of requiredFiles) if (!existsSync(file)) failures.push(`Missing required file: ${file}`);

const tracked = gitTrackedFiles();
for (const file of tracked) {
  if (file === ".env.example") continue;
  for (const rule of forbiddenTrackedPatterns) {
    if (rule.pattern.test(file)) failures.push(`Tracked ${rule.name}: ${file}`);
  }
}

if (existsSync("package.json")) {
  const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
  if (rootPackage.packageManager !== "pnpm@10.15.0") failures.push("Root packageManager must remain pinned to pnpm@10.15.0.");
  for (const script of [
    "verify:quick",
    "verify:affected",
    "verify:full",
    "test:unit",
    "test:integration",
    "test:database",
    "test:e2e",
    "report:handoff",
  ]) {
    if (!rootPackage.scripts?.[script]) failures.push(`Missing master command: ${script}`);
  }
}

for (const workflow of tracked.filter((file) => file.startsWith(".github/workflows/"))) {
  const content = readFileSync(workflow, "utf8");
  if (/continue-on-error\s*:\s*true/i.test(content)) failures.push(`Required check suppression found in ${workflow}: continue-on-error: true`);
  if (/\|\|\s*true/.test(content)) failures.push(`Required check suppression found in ${workflow}: || true`);
}

if (failures.length > 0) {
  console.error("Repository integrity check failed:");
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Repository integrity check passed (${tracked.length} tracked files inspected).`);
