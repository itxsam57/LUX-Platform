import { appendFileSync } from "node:fs";
import { changedFiles } from "./git-changes.mjs";

const files = changedFiles(process.env.HANDOFF_BASE_SHA);
const browserRelevant = [
  /^apps\/web\/src\//,
  /^apps\/web\/tests\/e2e\//,
  /^apps\/web\/playwright\.config\.ts$/,
  /^apps\/web\/package\.json$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^scripts\/engineering\//,
  /^\.github\/workflows\//,
];
const browserRequired = process.env.GITHUB_EVENT_NAME === "workflow_dispatch"
  || files.length === 0
  || files.some((file) => browserRelevant.some((pattern) => pattern.test(file)));

console.log(`Changed files inspected: ${files.length}`);
for (const file of files) console.log(`- ${file}`);
console.log(`Browser workflows required: ${browserRequired}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `browser_required=${browserRequired}\n`, "utf8");
}
