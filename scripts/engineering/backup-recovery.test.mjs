import assert from "node:assert/strict";
import test from "node:test";
import { backupRecoveryPlan, runBackupRecovery } from "./backup-recovery.mjs";

test("backup recovery plan requires explicit source/admin URLs and a safe temporary database name", () => {
  assert.throws(() => backupRecoveryPlan({ sourceUrl: "", adminUrl: "postgres://admin/db", restoreDatabase: "lux_restore_probe" }), /required/);
  assert.throws(() => backupRecoveryPlan({ sourceUrl: "postgres://source/db", adminUrl: "postgres://admin/db", restoreDatabase: "prod-db;drop" }), /safe temporary database name/);
});

test("backup recovery dumps, recreates, restores, probes, and removes the temporary database", () => {
  const calls = [];
  const runner = (command, args, options = {}) => {
    calls.push([command, args]);
    if (command === "psql" && options.capture) return "17\n";
    return "";
  };
  const result = runBackupRecovery({
    sourceUrl: "postgres://source/lux",
    adminUrl: "postgres://admin/postgres",
    restoreDatabase: "lux_restore_probe",
    runner,
  });
  assert.equal(result.profileCount, 17);
  assert.deepEqual(calls.map(([command]) => command), ["pg_dump", "psql", "psql", "pg_restore", "psql", "psql"]);
  assert.match(calls[1][1].at(-1), /^drop database if exists lux_restore_probe$/);
  assert.match(calls[2][1].at(-1), /^create database lux_restore_probe$/);
  assert.match(calls.at(-1)[1].at(-1), /^drop database if exists lux_restore_probe$/);
});
