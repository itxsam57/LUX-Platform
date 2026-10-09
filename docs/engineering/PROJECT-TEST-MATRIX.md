# LUX Platform — Project Test Matrix

Statuses used here: **PASS**, **EXTERNAL**, **OWNER REQUIRED**, and **FAIL**. PASS means the current repository has executable evidence for the stated boundary. EXTERNAL means implementation exists but canonical acceptance needs an environment/provider unavailable to this disposable lab. OWNER REQUIRED is manual product-owner acceptance.

## Candidate identity

- **Committed baseline:** `518716402c09def0f2428ea4bd50398a9020132b`.
- **Active candidate:** cumulative Milestone 1 through **Slice 17 — Administration and Launch Hardening** in the current local working tree.
- **Build identity:** home, `/health`, foundation contract and handoff report Slice 17.
- **Release posture:** local repository completion may be proven here; production promotion is blocked until external/provider/owner gates pass.

## Permanent engineering gate

| Check | Current evidence / required outcome | Status |
|---|---|---|
| Repository integrity + required canonical docs | `pnpm repo:check` | PASS at latest local checkpoint; rerun in exact-candidate gate |
| Tracked secret scan | `pnpm security:secrets` | PASS at latest local checkpoint; rerun in exact-candidate gate |
| ESLint zero warnings | `pnpm lint` | PASS at latest local checkpoint; rerun in exact-candidate gate |
| Strict TypeScript | `pnpm typecheck` | PASS at latest local checkpoint; rerun in exact-candidate gate |
| Unit/domain coverage | `pnpm test:unit` | PASS at latest local checkpoint; S11–S17 focused policy pack included |
| Engineering harness | runtime dependency, handoff truthfulness and backup-recovery harness tests | PASS for current focused handoff regression; full harness rerun required |
| Integration/API | `pnpm test:integration` | PASS at latest local checkpoint |
| Production dependency audit | Next.js 15.5.24 / Sharp 0.35.4 dependency set | PASS at latest local checkpoint, no known production advisories |
| Runtime compatibility | dependency versions plus real Sharp SVG→PNG signature probe | PASS at latest local checkpoint |
| Supabase database/RLS | `pnpm test:database` / pgTAP through `0025` | EXTERNAL — no runnable local Supabase stack/CLI in this lab |
| Production build | `pnpm build` | PASS at latest local checkpoint |
| Public/foundation desktop + mobile | foundation Playwright including history/404/overflow/health | PASS — 10/10 after Slice 17 identity reconciliation |
| Authenticated cumulative desktop + mobile | DB-backed role/tenant/storage/notification/cross-slice workflows | EXTERNAL — required Supabase test credentials are absent locally |
| Graphify requirement trace | exactly 18 IDs, production entry→implementation→test paths | PASS structurally at prior graph checkpoint; refresh required after final edits |
| Real backup restore | `pnpm backup:recovery` against staging source/admin/temporary DB | EXTERNAL — no staging PostgreSQL/Supabase URLs supplied to this lab |
| Product-owner Milestone 1 E2E | exact-candidate manual acceptance | OWNER REQUIRED |

## Slice acceptance state

| Requirement | Repository implementation | Remaining canonical acceptance |
|---|---|---|
| LUX-S00 Repository/quality foundation | PASS | none currently identified locally |
| LUX-S01 Design system/application shell | PASS | none currently identified locally |
| LUX-S02 Authentication/age/workspace isolation | PASS | EXTERNAL: live RLS + authenticated browser; production age provider |
| LUX-S03 Profiles/privacy | PASS | EXTERNAL: live RLS + authenticated persistence/privacy browser proof |
| LUX-S04 Feed/discovery | PASS | EXTERNAL: live DB-backed discovery/block/privacy browser proof |
| LUX-S05 Creator/depicted-person verification | PASS | EXTERNAL: live RLS/browser + approved production identity provider |
| LUX-S06 Crowd Demand Board | PASS | EXTERNAL: live DB/RLS + authenticated browser persistence/idempotency |
| LUX-S07 Project drafts/collaboration | PASS | EXTERNAL: live DB/RLS + authenticated concurrent/stale-update browser proof |
| LUX-S08 Contracts/consent | PASS | EXTERNAL: live DB/RLS + authenticated personal-consent browser proof |
| LUX-S09 Campaign/pre-booking | PASS | EXTERNAL: live DB/browser + approved production payment boundary |
| LUX-S10 Funding dashboard/badges | PASS | EXTERNAL: live DB/browser + production payment/provider reconciliation |
| LUX-S11 Production workspace | PASS | EXTERNAL: live RLS/storage and authenticated private-asset workflow |
| LUX-S12 Delivery/platform review | PASS | EXTERNAL: live review persistence/RLS and cross-role browser workflow |
| LUX-S13 Secure release/fan library | PASS | EXTERNAL: live entitlement/storage/playback enforcement workflow |
| LUX-S14 Ledger/revenue splits/payouts | PASS | EXTERNAL: live DB invariants/browser + approved payout/reconciliation provider |
| LUX-S15 Copyright/stolen-content operations | PASS | EXTERNAL: live evidence/RLS and staff/rights-owner browser workflow |
| LUX-S16 Agency workspace | PASS | EXTERNAL: live cross-agency isolation and performer/agency browser workflow |
| LUX-S17 Administration/launch hardening | PASS | EXTERNAL: live DB/browser + real staging restore; OWNER REQUIRED: product-owner E2E |

## Slices 11–17 focused protection

| Slice | Focused repository evidence |
|---|---|
| 11 | `production/policy.test.ts`, migration `20260910000100`, pgTAP `0019` |
| 12 | `review/policy.test.ts`, migration `20260910000200`, pgTAP `0020` |
| 13 | `releases/policy.test.ts`, migration `20260910000300`, pgTAP `0021` |
| 14 | `finance/policy.test.ts`, earnings/payout Playwright, migration `20260910000400`, pgTAP `0022` |
| 15 | `copyright/policy.test.ts`, migration `20260910000500`, pgTAP `0023` |
| 16 | `agency/policy.test.ts`, migration `20260910000600`, pgTAP `0024` |
| 17 | `admin/policy.test.ts`, launch-hardening Playwright, backup-recovery harness test, migration `20260910000700`, pgTAP `0025` |

## Security and truthfulness invariants

- Cross-role/cross-tenant access must fail at trusted server/database/storage boundaries.
- Private verification, production, release, finance, copyright and legal evidence must never appear in public projections.
- Duplicate actions/webhooks/payouts must remain idempotent and stale revisions must fail without mutation.
- Audit history is append-only; critical operations require explicit confirmation/reason where specified.
- Synthetic provider adapters are test-only and must remain visibly non-production/fail-closed in production mode.
- The handoff must report database/browser availability from the actual full-gate report instead of claiming unavailable stages passed.

## Readiness rule

Zero repository-actionable governor rows is necessary but not sufficient for production readiness. The release candidate remains blocked until live DB/RLS, authenticated browser, staging restore, provider, and product-owner gates are completed on the exact candidate.
