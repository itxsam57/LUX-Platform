# LUX Platform — Project Test Matrix

Statuses: **PASS**, **FAIL**, **PENDING**, **BLOCKED**, **NOT APPLICABLE**, **NOT CONFIGURED**. A required FAIL/BLOCKED result prevents readiness for that feature or slice. A PENDING exact-head checkpoint must become green before the Governor advances.

## Candidate and acceptance state

- **Accepted baseline:** Slices 0–3 on `main` at `21135e5895390294ba503df3d2dfba1a3dc6795e`.
- **Active cumulative candidate:** Slice 5 — Creator and depicted-person verification, Draft PR #6 (`feature/slices-4-10-marketplace-core`).
- **PR base:** `main` at `21135e5895390294ba503df3d2dfba1a3dc6795e`.
- **Clean Slice 5 functional checkpoint:** feature head `192468df4fbe7f764a2761fb5f75764a2da378af`, Engineering Gate run `32856235160` (#443).
- **Functional checkpoint result:** PASS — 176-file repository/secret checks, 55 unit tests, 1 integration test, 224 pgTAP/RLS assertions across 9 files, production build, and 61 passed / 1 skipped desktop-mobile browser workflows with zero flaky tests.
- **Task 4 state:** foundation/health/home/evidence reconciliation is in progress. The final reconciliation head must obtain its own green Engineering Gate; the prior functional checkpoint never substitutes for a failed or missing current-head gate.
- **Owner acceptance:** intentionally deferred under `BATCH_AFTER_SLICE_10`. No Slice 4–9 owner browser acceptance is claimed.
- **Merge:** prohibited before the combined Slice 10 owner handoff and acceptance.

## Permanent engineering gate

| ID | Check | Command / evidence | Required | Candidate status |
|---|---|---|---:|---|
| ENG-001 | Required repository files and master commands exist | `pnpm repo:check` | Yes | PASS — 176 tracked files at Slice 5 functional checkpoint |
| ENG-002 | Generated evidence, private env files and forbidden key material are not tracked | `pnpm repo:check` | Yes | PASS |
| ENG-003 | Tracked-file secret-pattern scan | `pnpm security:secrets` | Yes | PASS — 176 files inspected |
| ENG-004 | Reproducible frozen dependency install | `pnpm install --frozen-lockfile` | Yes | PASS |
| ENG-005 | ESLint with zero warnings | `pnpm lint` | Yes | PASS |
| ENG-006 | Strict TypeScript | `pnpm typecheck` | Yes | PASS |
| ENG-007 | Unit-testable application/domain logic meets scoped coverage floor | `pnpm test:unit` | Yes | PASS — latest Task 4 pre-final run: 57/57; 97.55% statements/lines, 85.95% branches, 100% functions |
| ENG-008 | Health route API contract | `pnpm test:integration` | Yes | PASS — 1/1, Slice 5 contract |
| ENG-009 | Production dependency audit | `pnpm security:dependencies` | Yes | PASS — no known vulnerabilities |
| ENG-010 | Audited runtime dependency compatibility | `pnpm runtime:dependencies` | Yes | PASS — nanoid 3.3.18, postcss 8.5.23, sharp 0.35.3 |
| ENG-011 | Next.js optimized production build | `pnpm build` | Yes | PASS |
| ENG-012 | Supabase database and RLS regression suite | `pnpm test:database` | Yes | PASS — 9 files / 224 assertions |
| ENG-013 | Chromium desktop workflows | Playwright `chromium-desktop` | Yes when browser-impacting | PASS at clean functional checkpoint; final Task 4 head PENDING |
| ENG-014 | Chromium mobile workflows | Playwright `chromium-mobile` | Yes when browser-impacting | PASS at clean functional checkpoint; final Task 4 head PENDING |
| ENG-015 | Master gate fails closed and preserves cheap-before-expensive ordering | `pnpm verify:full` | Yes | PASS |
| ENG-016 | Change-aware verification and truthful manual-test handoff | `ci-impact.mjs` + `report:handoff` | Yes | PASS — owner testing correctly deferred through Slice 9 |
| ENG-017 | GitHub Actions isolated Supabase, caching, failure evidence and Job Summary | `Engineering Gate` | Yes | PASS — final Slice 5 reconciliation run still required |

## Foundation and Slice 1 regressions

| ID | Workflow / boundary | Automated assertions | Required | Candidate status |
|---|---|---|---:|---|
| FND-001 | `/` and framework navigation | route and visible state stay synchronized without manual refresh | Yes | PASS at clean checkpoint; Slice 5 label reconciliation pending final gate |
| FND-002 | Back/Forward/refresh | history restores correct screen and protected state | Yes | PASS |
| FND-003 | `/health` | 200 with current active Slice 5 contract | Yes | PASS — unit/integration and browser contract updated |
| FND-004 | Unknown route | controlled 404 with recovery path | Yes | PASS |
| FND-005 | Responsive safety | no horizontal document overflow at desktop/mobile widths | Yes | PASS |
| FND-006 | Keyboard navigation | primary account/navigation actions remain reachable and operable | Yes | PASS |
| UI-001 | Design-system catalogue | required primitive families render without runtime/page errors | Yes | PASS |
| UI-002 | Tabs | ArrowLeft/Right, Home/End keep focus and selected state synchronized | Yes | PASS |
| UI-003 | Dialog/drawer/menu feedback | explicit close paths, Escape, truthful action feedback | Yes | PASS |
| UI-004 | Responsive shell | correct desktop sidebar/top bar and mobile navigation/touch targets | Yes | PASS |
| UI-005 | Controlled route states | no white screen/uncontrolled route state | Yes | PASS |

## Slice 2 — Authentication, adult access and workspace isolation

These protections are accepted on `main` and remain mandatory cumulative regressions.

| ID | Check | Automated protection | Required | Candidate status |
|---|---|---|---:|---|
| AUTH-001 | Sign-up validation and account-enumeration resistance | auth unit/E2E + database boundary | Yes | PASS |
| AUTH-002 | Email verification, sign-in/sign-out and password recovery | desktop/mobile auth workflows | Yes | PASS |
| AUTH-003 | Precise session revocation / sign out all devices | pgTAP `0002` + desktop/mobile E2E | Yes | PASS |
| AUTH-004 | Adult access gate precedes protected workspace access | auth policy + E2E | Yes | PASS |
| AUTH-005 | Provider-required mode fails closed; self-attestation is development-only | auth policy + environment contract + build/E2E | Yes | PASS/PARTIAL — production provider adapter remains intentionally unconfigured |
| AUTH-006 | Fan/Creator/Agency/Staff route isolation | pgTAP `0001` + auth-isolation E2E | Yes | PASS |
| AUTH-007 | Requested role grants no permission before approval | database/RLS + E2E | Yes | PASS |
| AUTH-008 | Approved roles remain separate until explicitly activated | database/RLS + history/refresh/direct-route E2E | Yes | PASS |
| AUTH-009 | Restricted staff/super-admin boundary | database/RLS + route denial workflows | Yes | PASS |

## Slice 3 — Profiles, privacy, media and notifications

These protections are accepted on `main` and remain mandatory cumulative regressions.

| ID | Check | Automated protection | Required | Candidate status |
|---|---|---|---:|---|
| PRO-001 | Owner profile edit persistence and validation | policy unit tests + profile E2E | Yes | PASS |
| PRO-002 | Safe avatar/banner processing | media unit tests + profile E2E | Yes | PASS — constrained WebP with metadata stripped |
| PRO-003 | Private storage and opaque public media addressing | pgTAP `0004`/`0006` + E2E | Yes | PASS |
| PRO-004 | Public projection leaks no email/auth/age/internal UUID data | pgTAP `0003` + profile E2E | Yes | PASS |
| PRO-005 | Public / unlisted / private visibility remain distinct | pgTAP `0003` + profile E2E | Yes | PASS |
| PRO-006 | Follow/block/mute graph remains consistent and privacy-safe | pgTAP + desktop/mobile E2E | Yes | PASS |
| PRV-001 | Supporter anonymity defaults privacy-on and persists | profile/privacy RPC + E2E | Yes | PASS |
| PRV-002 | Owner export is allowlisted, UUID-free and auditable | pgTAP `0005` + export E2E | Yes | PASS |
| PRV-003 | Deletion request is idempotent and cancellable | pgTAP + privacy-rights E2E | Yes | PASS |
| PRV-004 | Privacy rights remain removable without current adult assurance | pgTAP `0006` + privacy-rights E2E | Yes | PASS |
| NOT-001 | Notifications are recipient-only, markable, deep-linked and block-suppressed | pgTAP + notification E2E | Yes | PASS |

## Slice 4 — Feed and discovery

| ID | Check | Automated protection | Required | Candidate status |
|---|---|---|---:|---|
| DSC-001 | Public discovery excludes private/unlisted profiles and either-direction blocks | pgTAP `0007_slice_4_discovery` | Yes | PASS |
| DSC-002 | For You ranking is deterministic, explainable and diversity-capped | `discovery/ranking.test.ts` | Yes | PASS |
| DSC-003 | Discovery response is an explicit privacy-safe allowlist | projection parser + pgTAP | Yes | PASS |
| DSC-004 | `/app/feed`, `/app/explore`, `/app/search` are real adult-protected routes | `discovery.spec.ts` desktop/mobile | Yes | PASS |
| DSC-005 | Following contains only followed eligible public profiles | database candidate boundary + browser workflow | Yes | PASS |

## Slice 5 — Creator and depicted-person verification

| ID | Check | Automated protection | Required | Candidate status |
|---|---|---|---:|---|
| VER-001 | Participant can start synthetic V2 but cannot self-promote | verification policy + pgTAP `0008*` + `verification.spec.ts` | Yes | PASS |
| VER-002 | Reviewer queue is denied to ordinary users and restricted to authorized staff/super-admin transitions | pgTAP `0008b` + verification E2E | Yes | PASS |
| VER-003 | V3 requires current V2 plus performer/liveness, payout-ownership and consent-education prerequisites | verification policy + pgTAP `0008` | Yes | PASS |
| VER-004 | Public profile exposes only normalized safe verification badge/state | pgTAP public boundary + verification E2E | Yes | PASS |
| VER-005 | Legal identity evidence, provider references, raw payloads and internal UUIDs stay private | RLS/RPC boundary + browser privacy assertions | Yes | PASS |
| VER-006 | Revocation or expiry removes current V3/V2 state and public badge truthfully downgrades/disappears | pgTAP + verification E2E | Yes | PASS |
| VER-007 | Synthetic verification is development/CI-only; production fails closed without an approved provider | environment/policy tests + server adapter contract | Yes | PASS/PARTIAL — production provider intentionally not configured |
| VER-008 | Reviewer mutations synchronize on durable committed state rather than incidental navigation | private summary polling + reviewer E2E | Yes | PASS |
| VER-009 | Super-admin age assurance preserves its active staff workspace and does not force Fan activation | verification E2E helper + workspace isolation boundary | Yes | PASS |

## Security matrix

| ID | Boundary | Candidate status | Activation / scope rule |
|---|---|---|---|
| SEC-001 | Tracked secret/private-key detection | PASS | permanent engineering gate |
| SEC-002 | Generated browser evidence excluded from Git | PASS | permanent engineering gate |
| SEC-003 | Production dependency audit/runtime compatibility | PASS | permanent engineering gate |
| SEC-004 | Authentication/session security | PASS | accepted Slice 2 boundary |
| SEC-005 | Role/workspace isolation | PASS | accepted Slice 2 boundary |
| SEC-006 | Database constraints/RLS | PASS | cumulative through Slice 5 |
| SEC-007 | Profile-media ownership/type/size/privacy | PASS | accepted Slice 3 profile-media scope |
| SEC-008 | Adult-access provider boundary | PASS/PARTIAL | provider-required mode fails closed; production adapter remains deferred |
| SEC-009 | Identity/performer verification evidence boundary | PASS/PARTIAL | normalized V2/V3 state is implemented; synthetic adapter is dev/CI only and production remains fail-closed |
| SEC-010 | Payment/webhook/idempotency | BLOCKED | introduced in the funding/payment slice |
| SEC-011 | Consent/release/payout invariants | BLOCKED | introduced in later canonical slices |

## Deferred product layers

The Crowd Demand Board, project drafts and collaboration invitations, contracts/consent/boundaries, campaign publishing and pre-booking, funding dashboard/payment state, production uploads, delivery review, secure releases, double-entry ledger/revenue splits/payouts, copyright operations, full agency operations, moderation and later administration remain deferred to their canonical slices. Slice 5 PASS must not be interpreted as implementing them.

## Readiness rule

Slice 5 becomes an **automated checkpoint** only when the latest required Engineering Gate attached to the final Task 4 reconciliation head is green. The clean functional checkpoint at `192468df4fbe7f764a2761fb5f75764a2da378af` proves the verification workflows themselves, but it cannot substitute for a failed or missing gate after foundation/evidence changes. Owner acceptance remains deferred until the combined Slice 10 handoff, and PR #6 must remain Draft/unmerged until then.
