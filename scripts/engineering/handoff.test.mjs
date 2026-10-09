import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("handoff reports Milestone 1 Slice 17 without deferring implemented slices", () => {
  const output = "/tmp/lux-handoff-test.md";
  rmSync(output, { force: true });

  const result = spawnSync(
    process.execPath,
    ["scripts/engineering/handoff.mjs", "--status=fail", `--output=${output}`],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = readFileSync(output, "utf8");
  assert.match(report, /Active slice:\*\* 17 — Administration and Launch Hardening/);
  assert.doesNotMatch(report, /production uploads[\s\S]*delivery review[\s\S]*secure releases/);
  assert.match(report, /Owner acceptance remains separate from automated evidence/);
});

test("handoff reports external gate availability without claiming unavailable checks passed", () => {
  const output = "/tmp/lux-handoff-external-test.md";
  const gateReport = "/tmp/lux-full-gate-external-test.json";
  rmSync(output, { force: true });
  writeFileSync(gateReport, JSON.stringify({
    passed: false,
    results: [
      { name: "Supabase database and RLS tests", status: "NOT AVAILABLE ON LOCAL HARDWARE" },
      { name: "Desktop/mobile browser workflows", status: "FAIL" },
    ],
  }));

  const result = spawnSync(
    process.execPath,
    [
      "scripts/engineering/handoff.mjs",
      "--status=fail",
      `--gate-report=${gateReport}`,
      `--output=${output}`,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = readFileSync(output, "utf8");
  assert.match(report, /Supabase database and RLS tests: NOT AVAILABLE ON LOCAL HARDWARE/);
  assert.match(report, /Desktop\/mobile browser workflows: FAIL/);
  assert.doesNotMatch(report, /full engineering gate passed, including the isolated Supabase database\/RLS suite/);
});

test("handoff includes untracked product files in visible feature detection", () => {
  const output = "/tmp/lux-handoff-untracked-test.md";
  const probeDir = "apps/web/src/app/releases/__handoff-untracked-probe__";
  const probeFile = `${probeDir}/page.tsx`;
  rmSync(output, { force: true });
  mkdirSync(probeDir, { recursive: true });
  writeFileSync(probeFile, "export default function Probe() { return null; }\n");

  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/engineering/handoff.mjs", "--status=fail", `--output=${output}`],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = readFileSync(output, "utf8");
    assert.match(report, /Secure release and entitled playback/);
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
});
