# LUX Platform — Project Test Matrix

Statuses: **PASS**, **FAIL**, **BLOCKED**, **NOT APPLICABLE**, **NOT CONFIGURED**. A required BLOCKED/FAIL result prevents readiness for that feature or slice.

**Latest full verification evidence:** GitHub Actions run `31016881008` at commit `d0f4f0124fcc05a3055da44ab9efdfad56b336f7` on 2026-08-05.

## Slice 0 engineering gate

| ID | Check | Command / evidence | Required | Verified status |
|---|---|---|---:|---|
| ENG-001 | Required repository files and master commands exist | `pnpm repo:check` | Yes | PASS |
| ENG-002 | Generated evidence, private env files, and forbidden key material are not tracked | `pnpm repo:check` | Yes | PASS |
| ENG-003 | Tracked-file secret-pattern scan | `pnpm security:secrets` | Yes | PASS |
| ENG-004 | Reproducible frozen dependency install | `pnpm install --frozen-lockfile` | Yes | PASS |
| ENG-005 | ESLint with zero warnings | `pnpm lint` | Yes | PASS |
| ENG-006 | Strict TypeScript | `pnpm typecheck` | Yes | PASS |
| ENG-007 | Foundation domain unit tests and ≥80% scoped coverage | `pnpm test:unit` | Yes | PASS — 5 tests; 100% statements/branches/functions/lines |
| ENG-008 | Health route API contract | `pnpm test:integration` | Yes | PASS — 1 test |
| ENG-009 | High/critical production dependency audit | `pnpm security:dependencies` | Yes | PASS — no high/critical advisory; one moderate remains disclosed |
| ENG-010 | Audited PostCSS/Sharp override resolution and Sharp conversion | `pnpm runtime:dependencies` | Yes | PASS |
| ENG-011 | Next.js optimized production build | `pnpm build` | Yes | PASS |
| ENG-012 | Chromium desktop workflow tests | Playwright `chromium-desktop` | Yes | PASS — 5 tests |
| ENG-013 | Chromium Pixel 7 workflow tests | Playwright `chromium-mobile` | Yes | PASS — 5 tests |
| ENG-014 | Master gate exits non-zero on required failure and blocks expensive stages | `pnpm verify:full` | Yes | PASS |
| ENG-015 | Change-aware verification command | `pnpm verify:affected` | Yes | PASS — installed and repository checked |
| ENG-016 | Truthful manual-test handoff generation | `pnpm report:handoff` | Yes | PASS |
| ENG-017 | GitHub Actions concurrency, cache, cheap-before-expensive order, failure evidence, Job Summary | `Engineering Gate` workflow | Yes | PASS |

## Current public workflows

| ID | Workflow | Automated assertions | Manual owner test |
|---|---|---|---|
| FND-001 | `/` loads | successful response; LUX heading; active slice text; no page/console errors | only when visible source changed |
| FND-002 | Home → design system | framework navigation updates URL and target screen without manual refresh | only when visible source changed |
| FND-003 | Browser Back/Forward and refresh | history restores the correct screen; refresh remains on current route | only when visible source changed |
| FND-004 | `/health` | 200; exact service/status/build slice; valid timestamp | none |
| FND-005 | Unknown route | 404; controlled state; recovery link returns home | only when visible source changed |
| FND-006 | Responsive safety | no horizontal document overflow at desktop and Pixel 7 viewports | final visual comfort only when UI changed |
| FND-007 | Basic keyboard path | primary links can be reached and activated by keyboard | final usability judgement only when UI changed |

## Security matrix

| ID | Boundary | Status | Activation rule |
|---|---|---|---|
| SEC-001 | Tracked secret/private-key detection | PASS | permanent Slice 0 gate |
| SEC-002 | Generated browser evidence excluded from Git | PASS | permanent Slice 0 gate |
| SEC-003 | High/critical production dependency audit | PASS | permanent gate; moderate advisory remains documented |
| SEC-004 | Authentication/session security | BLOCKED | introduce with authentication slice |
| SEC-005 | Role and tenant isolation | BLOCKED | introduce with workspace/RLS slice |
| SEC-006 | Database constraints/RLS | BLOCKED | introduce with first database migration |
| SEC-007 | Upload ownership/type/size/access | BLOCKED | introduce with storage/upload slice |
| SEC-008 | Payment/webhook/idempotency | BLOCKED | introduce with payment adapter slice |
| SEC-009 | Consent/release/payout invariants | BLOCKED | introduce with consent, review, and ledger slices |

## Future product layers

The following are recorded but intentionally not installed because their production systems do not exist: authentication, age assurance, profiles, feeds, verification, demand board, invitations, negotiation, contracts, consent, campaigns, pre-booking, funding, production uploads, delivery review, secure entitlements, ledger/payouts, copyright operations, agency workspace, moderation, and administration.

For each future slice, update this matrix before implementation with positive, negative, unauthorized, persistence, duplicate-action, retry, audit, and recovery cases. Absent systems must never be marked PASS.

## Readiness rule

Slice 0 engineering automation is ready because ENG-001 through ENG-017 pass. Future BLOCKED product rows do not block Slice 0, but they block any claim that those product capabilities are ready.
