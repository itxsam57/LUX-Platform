# LUX Milestone 1 staging-to-production release checklist

This checklist is the release gate for the exact candidate commit. Do not reuse evidence from an older SHA.

## Candidate identity and engineering gate

- Record the exact Git SHA and confirm the working tree contains only intended release changes.
- Install with the frozen lockfile.
- Run `pnpm verify:full` with database tests enabled in the staging/CI environment.
- Require repository integrity, secret scan, zero-warning lint, strict typecheck, unit/integration tests, dependency audit, runtime compatibility, database/RLS tests, production build, and desktop/mobile browser workflows to pass.
- Confirm the production-path Graphify requirement map is pinned to the same SHA and has no repository-actionable requirement rows.

## Backup and recovery proof

- Use staging database credentials that may create and drop a temporary database; never point the restore target at production.
- Set `BACKUP_SOURCE_DATABASE_URL`, `BACKUP_ADMIN_DATABASE_URL`, and a disposable `BACKUP_RESTORE_DATABASE` value.
- Run `pnpm backup:recovery`.
- Preserve the command result in release evidence. The proof must show that a custom-format dump was created, restored into the temporary database, and queried successfully before the temporary database was removed.
- A missing database tool, missing credential, provider restriction, failed restore, or failed probe blocks release rather than being recorded as a pass.

## Product and security acceptance

- Run the complete desktop and mobile workflows on the exact candidate, including direct URL, refresh, back/forward, controlled recovery, and duplicate-click/idempotency behavior.
- Re-run cross-role and cross-tenant denial flows, private storage/evidence access checks, notification deep links, immutable audit history, and critical-action confirmation/reason checks.
- Confirm no unresolved critical or high-severity defect remains.
- Product owner completes the Milestone 1 end-to-end acceptance on the same candidate and records acceptance before production promotion.

## Promotion and rollback

- Confirm production configuration uses approved provider credentials and no development/sandbox adapter is presented as production.
- Record the currently deployed release identifier and database migration state before promotion.
- Promote only the accepted candidate SHA and apply migrations in repository order.
- Run health and smoke checks immediately after promotion.
- If a release check fails, stop traffic expansion and roll the application back to the recorded prior release. For database recovery, follow the provider-approved restore procedure using the verified backup artifact; do not improvise destructive rollback SQL.
