import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { spawnSync } from "node:child_process";

const binaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".mp4", ".mov", ".avi", ".woff", ".woff2", ".ttf", ".eot"]);
const secretPatterns = [
  ["private key material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["OpenAI-style secret key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{16,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
];

const trackedResult = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (trackedResult.status !== 0) {
  console.error("Secret scan could not read tracked files.");
  process.exit(1);
}

const tracked = trackedResult.stdout.split("\0").filter(Boolean);
const findings = [];
for (const file of tracked) {
  if (/(^|\/)\.env(?:\..+)?$/.test(file) && file !== ".env.example") {
    findings.push([file, "tracked private environment file"]);
    continue;
  }
  if (binaryExtensions.has(extname(file).toLowerCase())) continue;
  if (statSync(file).size > 1_000_000) continue;

  let content;
  try { content = readFileSync(file, "utf8"); } catch { continue; }
  for (const [name, pattern] of secretPatterns) if (pattern.test(content)) findings.push([file, name]);
}

if (findings.length > 0) {
  console.error("Tracked-file secret scan failed. Secret values are intentionally not printed:");
  for (const [file, name] of findings) console.error(`- ${file}: ${name}`);
  process.exit(1);
}

console.log(`Tracked-file secret scan passed (${tracked.length} files inspected).`);
