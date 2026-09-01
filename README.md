# LUX Platform

LUX is the working code name for an adult-only, privacy-first, crowd-demanded and crowdfunded creator marketplace.

Audiences can discover creators, signal demand, pre-book and support creator-approved campaigns, but they never gain control over a creator or depicted person. Participation, collaborators, boundaries, compensation, exact terms, consent and release decisions remain with the people involved.

## Canonical source of truth

The documentation under `docs/product`, `docs/engineering`, `docs/testing` and the active Superpowers plans is the product and engineering source of truth. Production code must not silently contradict it.

Start with:

- `docs/product/00_CANONICAL_PROJECT_LOCK.md`
- `docs/engineering/PROJECT-PROFILE.md`
- `docs/engineering/PROJECT-TEST-MATRIX.md`
- `docs/engineering/REGRESSION-REGISTER.md`
- `docs/engineering/10_SLICES_4_10_CLOSURE.md`

## Build method

LUX is built as independently testable vertical slices. Source, persistence, authorization, privacy, build and desktop/mobile workflows are cumulatively reverified before a slice advances. For the owner-approved Slices 4–10 run, visible owner testing is intentionally batched into one combined handoff after Slice 10 automation is green.

## Current repository layout

```text
apps/web                  Next.js web application and shared UI system
supabase/migrations       Versioned Postgres/RLS/RPC schema changes
supabase/tests            pgTAP database/RLS regression suite
docs/product              Canonical product lock
docs/engineering          Engineering profile, matrix, regressions and closure records
docs/testing              Hard-test and acceptance protocols
scripts/engineering       Repository gate, security, impact and handoff automation
.github/workflows         GitHub Actions Engineering Gate
```

## Engineering commands

```bash
pnpm install --frozen-lockfile
pnpm verify:quick
pnpm verify:affected
pnpm verify:full
pnpm report:handoff
```

`verify:full` fails closed on required failures and generates the manual-test handoff under `.engineering/reports/`.

## Current status

**Build Slice 10 candidate: Fan Funding Dashboard and Badges.**

Slices 0–3 remain the accepted `main` baseline at `21135e5895390294ba503df3d2dfba1a3dc6795e`. Draft PR #6 cumulatively implements Slices 4–10. The latest feature checkpoint, `be96c14fccc49ecae0987ccb5a908c71c32a3762`, passed Engineering Gate #686 with 142 unit tests, 509 database/RLS assertions and 79 passed / 1 skipped desktop-mobile Playwright workflows, including the full Slices 4–10 marketplace journey.

Implemented in the current candidate:

- authentication, adult-access/session/workspace boundaries;
- profiles, privacy, guarded media and notifications;
- feed/explore/search discovery;
- dev/CI V2/V3 verification with restricted review and production fail-closed provider mode;
- Crowd Demand Board and creator-owned project conversion;
- versioned projects and collaboration invitations/negotiation;
- immutable terms, personal depicted-person consent and contract lock gates;
- campaign publishing, public campaign projection and idempotent pre-booking;
- provider-neutral sandbox payment lifecycle for dev/CI;
- private supporter funding dashboard, badges, material-change acceptance and idempotent refund intent;
- cumulative desktop/mobile creator-controlled journey across Slices 4–10.

Task 5 is reconciling the active Slice 10 build identity and closure documents. A fresh exact-head Engineering Gate must pass after that reconciliation before the owner handoff is considered ready.

## Not yet complete

This is not the finished Milestone 1 platform. Slices 11–17 remain future work: production workspace/uploads, delivery/platform review, secure release/fan library, double-entry ledger/revenue splits/payouts, copyright operations, full agency workspace and administration/launch hardening.

Synthetic identity and sandbox payment adapters are development/CI tools only. They are not production verification, production payment processing or real revenue. Production provider-required modes remain fail-closed until approved adapters are configured.

PR #6 remains Draft and must not merge until the combined Slices 4–10 owner browser handoff is completed and accepted.
