import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function backupRecoveryPlan({ sourceUrl, adminUrl, restoreDatabase }) {
  if (!sourceUrl || !adminUrl) throw new Error("BACKUP_SOURCE_DATABASE_URL and BACKUP_ADMIN_DATABASE_URL are required.");
  if (!/^[a-z][a-z0-9_]{7,62}$/.test(restoreDatabase)) throw new Error("BACKUP_RESTORE_DATABASE must be a safe temporary database name.");
  return { sourceUrl, adminUrl, restoreDatabase };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: options.capture ? "pipe" : "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}.`);
  return result.stdout ?? "";
}

export function runBackupRecovery({ sourceUrl, adminUrl, restoreDatabase, runner = run }) {
  const plan = backupRecoveryPlan({ sourceUrl, adminUrl, restoreDatabase });
  const work = mkdtempSync(join(tmpdir(), "lux-backup-recovery-"));
  const dumpPath = join(work, "lux.dump");
  try {
    runner("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", dumpPath, plan.sourceUrl]);
    runner("psql", [plan.adminUrl, "--set", "ON_ERROR_STOP=1", "--command", `drop database if exists ${plan.restoreDatabase}`]);
    runner("psql", [plan.adminUrl, "--set", "ON_ERROR_STOP=1", "--command", `create database ${plan.restoreDatabase}`]);
    const restoredUrl = new URL(plan.adminUrl);
    restoredUrl.pathname = `/${plan.restoreDatabase}`;
    runner("pg_restore", ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", restoredUrl.toString(), dumpPath]);
    const probe = runner("psql", [restoredUrl.toString(), "--tuples-only", "--no-align", "--command", "select count(*) from public.profiles"], { capture: true }).trim();
    if (!/^\d+$/.test(probe)) throw new Error("Restored database probe did not return a profile count.");
    return { restoredDatabase: plan.restoreDatabase, profileCount: Number(probe) };
  } finally {
    try { runner("psql", [plan.adminUrl, "--set", "ON_ERROR_STOP=1", "--command", `drop database if exists ${plan.restoreDatabase}`]); } catch {}
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runBackupRecovery({
    sourceUrl: process.env.BACKUP_SOURCE_DATABASE_URL,
    adminUrl: process.env.BACKUP_ADMIN_DATABASE_URL,
    restoreDatabase: process.env.BACKUP_RESTORE_DATABASE ?? "lux_restore_probe",
  });
  console.log(`Backup restoration verified in temporary database ${result.restoredDatabase}; restored profile rows: ${result.profileCount}.`);
}
