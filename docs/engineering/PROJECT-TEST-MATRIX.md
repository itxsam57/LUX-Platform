# LUX Platform — Project Test Matrix

Statuses: **PASS**, **FAIL**, **BLOCKED**, **NOT APPLICABLE**, **NOT CONFIGURED**. A required BLOCKED/FAIL result prevents readiness for that feature or slice.

## Slice 0 engineering gate

| ID | Check | Command / evidence | Required | Audit status |
|---|---|---|---:|---|
| ENG-001 | Required repository files and commands exist | `pnpm repo:check` | Yes | NOT CONFIGURED |
| ENG-002 | No committed generated evidence, private env files, or forbidden key material | `pnpm repo:check` | Yes | NOT CONFIGURED |
| ENG-003 | Secret-pattern scan | `pnpm security:secrets` | Yes | NOT CONFIGURED |
| ENG-004 | Reproducible frozen dependency install | `pnpm install --frozen-lockfile` | Yes | FAIL — lockfile absent at audit |
| ENG-005 | ESLint, zero warnings | `pnpm lint` | Yes | PASS — owner local run |
| ENG-006 | Strict TypeScript | `pnpm typecheck` | Yes | PASS — owner local run |
| ENG-007 | Foundation domain unit tests and ≥80% scoped coverage | `pnpm test:unit` | Yes | PASS after coverage-scope correction |
| ENG-008 | Health route contract test | `pnpm test:integration` | Yes | NOT CONFIGURED |
| ENG-009 | Dependency vulnerability audit | `pnpm security:dependencies` | Yes | NOT CONFIGURED |
| ENG-010 | Next.js production build | `pnpm build` | Yes | NOT CONFIGURED |
| ENG-011 | Chromium desktop workflow tests | `pnpm test:e2e -- --project=chromium-desktop` | Yes | NOT CONFIGURED |
| ENG-012 | Chromium mobile workflow tests | `pnpm test:e2e -- --project=chromium-mobile` | Yes | NOT CONFIGURED |
| ENG-013 | Full master gate exits non-zero on required failure | `pnpm verify:full` | Yes | NOT CONFIGURED |
| ENG-014 | Concise manual handoff generation | `pnpm report:handoff` | Yes | NOT CONFIGURED |
| ENG-015 | GitHub Actions gate with concurrency and cheap-before-expensive order | workflow result | Yes | PARTIAL — existing CI lacks complete kit behavior |

## Current public workflows

| ID | Workflow | Automated assertions | Manual owner test |
|---|---|---|---|
| FND-001 | `/` loads | successful response; LUX heading; active slice text; no page/console errors | only when visible source changed |
| FND-002 | Home → design system | Next.js link changes URL and shows target heading without forced reload | only when visible source changed |
| FND-003 | Browser Back/Forward and refresh | history restores correct screen; refresh remains on current route | only when visible source changed |
| FND-004 | `/health` | 200; exact service/status/build slice; valid timestamp | none |
| FND-005 | Unknown route | 404; controlled state; recovery link returns home | only when visible source changed |
| FND-006 | Responsive safety | no horizontal document overflow at desktop and Pixel 7 viewports | final visual comfort remains manual when UI changed |
| FND-007 | Basic keyboard path | primary links can be reached and activated by keyboard | final usability judgement manual when UI changed |

## Security matrix

| ID | Boundary | Status | Activation rule |
|---|---|---|---|
| SEC-001 | Tracked secret/private-key detection | NOT CONFIGURED | install in Slice 0 |
| SEC-002 | Generated browser evidence excluded from Git | NOT CONFIGURED | install in Slice 0 |
| SEC-003 | Authentication/session security | BLOCKED | introduce with authentication slice |
| SEC-004 | Role and tenant isolation | BLOCKED | introduce with workspace/RLS slice |
| SEC-005 | Database constraints/RLS | BLOCKED | introduce with first database migration |
| SEC-006 | Upload ownership/type/size/access | BLOCKED | introduce with storage/upload slice |
| SEC-007 | Payment/webhook/idempotency | BLOCKED | introduce with payment adapter slice |
| SEC-008 | Consent/release/payout invariants | BLOCKED | introduce with consent, review, and ledger slices |

## Future product layers

The following are recorded but intentionally not installed yet because their production systems do not exist: authentication, age assurance, profiles, feeds, verification, demand board, invitations, negotiation, contracts, consent, campaigns, pre-booking, funding, production uploads, delivery review, secure entitlements, ledger/payouts, copyright operations, agency workspace, moderation, and administration.

For each future slice, update this matrix before implementation with positive, negative, unauthorized, persistence, duplicate-action, retry, audit, and recovery cases. Do not mark absent systems PASS.

## Readiness rule

Slice 0 is ready only when ENG-001 through ENG-015 are PASS or explicitly NOT APPLICABLE. Future BLOCKED product rows do not block Slice 0, but they block any claim that those product features are ready.
