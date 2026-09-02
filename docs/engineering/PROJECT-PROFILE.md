# LUX Platform — Project Profile

**Accepted `main` baseline:** Slices 0–3 at `21135e5895390294ba503df3d2dfba1a3dc6795e`.  
**Current cumulative candidate:** Build Slice 10 on Draft PR #6 (`feature/slices-4-10-marketplace-core`).  
**Latest feature-automation checkpoint:** `be96c14fccc49ecae0987ccb5a908c71c32a3762`, Engineering Gate `33478175270` (#686), fully green.  
**Closure state:** Slices 4–10 feature automation is green; the Task 5 documentation/build-identity exact-head gate and combined owner browser acceptance are still required. PR #6 remains Draft and unmerged.

## Product identity

LUX is the working code name for an adult-only, privacy-first, crowd-demanded and crowdfunded creator marketplace. Fans may signal demand and fund opportunities, but creators and depicted people retain control over participation, collaborators, boundaries, compensation, consent, final release, and distribution.

Canonical product rules live in `docs/product/00_CANONICAL_PROJECT_LOCK.md`. The current candidate implements the canonical sequence through **Slice 10 — Fan Funding Dashboard and Badges**. It is not the finished Milestone 1 product; Slices 11–17 remain future work.

## Current technology

- pnpm 10.15.0 workspace with committed lockfile and frozen-install enforcement.
- Next.js 15.5.21 App Router, React 19.1.1, TypeScript 5.9.2 strict.
- ESLint 9.34.0 with zero-warning policy.
- Vitest 3.2.4 with V8 coverage.
- Playwright 1.55.1 with Chromium desktop and Pixel 7 emulation.
- Supabase Postgres/RLS/RPC migrations and pgTAP database tests.
- GitHub Actions on Ubuntu/Node.js 22 with an isolated Supabase stack for database and browser verification.

## Implemented candidate capabilities through Slice 10

- Repository/quality foundation, responsive application shell, health and controlled route states.
- Authentication, password recovery, adult-access boundary, session revocation, role request/approval and active-workspace isolation.
- Profiles, public/unlisted/private visibility, guarded media, follow/block/mute, privacy export/deletion and notifications.
- Privacy-safe feed/explore/search discovery with deterministic ranking.
- Development/CI V2 identity and V3 depicted-person verification workflow with restricted review; production verification fails closed without an approved provider.
- Crowd Demand Board with idempotent support, suggested-creator semantics, private decline and explicit creator interest.
- Creator-owned project conversion, versioned project drafts, collaboration invitations, negotiation and agency communication authority boundaries.
- Immutable exact project terms, personal participant acceptance, depicted-person consent, material-change reopening and contract lock gates.
- Campaign draft/review/publication, truthful public campaign projection and idempotent pre-booking that is explicitly not a payment.
- Provider-neutral payment boundary with deterministic sandbox adapter in dev/CI only, durable payment transitions, webhook/idempotency controls, refund intent, material-change workflow, supporter badges/privacy and owner-only funding dashboard/detail.
- One cumulative desktop/mobile journey proving discovery → demand → creator project → invitation/negotiation → consent/lock → campaign → public pre-book → funding lifecycle.

## Current roles and access boundaries

The candidate exercises anonymous visitor, adult-assured fan, requested/approved/active creator, depicted performer, agency communication role, restricted reviewer/staff and super-admin contexts. Roles do not silently merge, requested roles grant no permission, performer consent remains personal, and private/public projections are separated by server/RLS/RPC boundaries.

## Current critical workflows

| Area | Automated protection |
|---|---|
| Foundation/navigation | unit + API + desktop/mobile Playwright |
| Auth/workspace/privacy | policy tests + pgTAP/RLS + desktop/mobile E2E |
| Discovery/verification/demand | unit + pgTAP + desktop/mobile E2E |
| Projects/invitations/contracts/consent | unit + pgTAP + desktop/mobile E2E |
| Campaign/pre-book | policy + pgTAP + desktop/mobile E2E |
| Funding/payment lifecycle | adapter unit tests + pgTAP + desktop/mobile E2E |
| Cross-slice owner journey | `marketplace-4-10-journey.spec.ts` desktop/mobile |
| Engineering gate | `pnpm verify:full` + GitHub Engineering Gate |

## Latest verified feature checkpoint

Gate #686 on exact branch head `be96c14fccc49ecae0987ccb5a908c71c32a3762` passed:

- repository integrity and tracked secret scan over 270 files;
- lint and strict TypeScript;
- 142 unit tests with 97.57% statements/lines, 85.95% branches and 100% functions;
- 1 integration/API test;
- production dependency audit with no known vulnerabilities and runtime compatibility checks;
- 20 pgTAP files / 509 database and RLS assertions;
- optimized production build;
- 79 desktop/mobile browser workflows passed and 1 intentionally skipped, with the Slices 4–10 cumulative journey green on both projects.

This checkpoint proves feature automation before Task 5 metadata reconciliation. A new exact-head gate is mandatory after this document and the Slice 10 build identity are committed.

## Data and provider policy

- Public projections are explicit allowlists; private negotiation, verification evidence, internal UUIDs and payment processor references must not leak.
- Raw card/PAN/CVV data is never stored.
- Synthetic identity and sandbox payment adapters are deterministic development/CI tools only and never constitute production verification or real revenue.
- Provider-required production identity/payment modes fail closed until approved adapters are configured.

## Deferred Slices 11–17

Production workspace/uploads, delivery and platform review, secure release/fan library, immutable double-entry ledger/revenue splits/payouts, copyright/stolen-content operations, full agency workspace, moderation/administration and launch hardening remain deferred. The current funding records are not a substitute for Slice 14 accounting or payouts.

## Verification commands

- `pnpm verify:quick` — repository/secret/lint/type/unit/API checks.
- `pnpm verify:affected` — safe change-aware verification.
- `pnpm verify:full` — repository, secret, lint, type, unit, API/integration, dependency audit, runtime compatibility, database/RLS, production build, desktop/mobile browser tests and handoff.
- `pnpm report:handoff` — regenerate the current manual-test handoff.

## Definition of done for the current PR

Task 5 is complete only when the reconciliation head itself passes the full Engineering Gate and the generated handoff says the combined Slices 4–10 browser pack is ready. The owner must then complete that visible handoff. PR #6 must remain Draft and unmerged until owner acceptance is recorded.

## Known limitations

- No preview deployment is configured.
- The owner's local machine cannot provide the Docker-based Supabase enforcement environment; GitHub Actions is the mandatory database/RLS verification environment.
- Production age/identity/payment providers are not configured; corresponding production actions remain fail-closed.
- Slices 11–17 are intentionally not implemented by this PR.
