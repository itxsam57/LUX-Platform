import { spawnSync } from "node:child_process";
import { changedFiles } from "./git-changes.mjs";

const files = changedFiles(process.argv.find((arg) => arg.startsWith("--base="))?.split("=")[1]);
const docsOnly = files.length > 0 && files.every((file) => file.startsWith("docs/") || file.endsWith(".md"));
const visibleAppChange = files.some((file) => file.startsWith("apps/web/src/app/") || file === "apps/web/src/app/globals.css");
const command = docsOnly
  ? "pnpm repo:check && pnpm security:secrets"
  : visibleAppChange
    ? "pnpm verify:quick && pnpm build"
    : "pnpm verify:quick";

console.log(`Affected verification inspected ${files.length} changed file(s).`);
console.log(`Selected: ${command}`);
const result = spawnSync(command, { shell: true, stdio: "inherit" });
process.exit(result.status ?? 1);
