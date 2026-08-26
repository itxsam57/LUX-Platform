# LUX Platform — Project Test Matrix

Statuses: **PASS**, **FAIL**, **PENDING**, **BLOCKED**, **NOT APPLICABLE**, **NOT CONFIGURED**. A required FAIL/BLOCKED result prevents readiness for that feature or slice. A PENDING exact-head checkpoint must become green before the Governor advances.

## Candidate and acceptance state

- **Accepted baseline:** Slices 0–3 on `main` at `21135e5895390294ba503df3d2dfba1a3dc6795e`.
- **Active cumulative candidate:** Slice 6 — Crowd Demand Board, Draft PR #6 (`feature/slices-4-10-marketplace-core`).
- **PR base:** `main` at `21135e5895390294ba503df3d2dfba1a3dc6795e`.
- **Clean Slice 6 functional checkpoint:** Task 3 feature head `adddb274fbb78eb7ee722d8e4c999ae0bc2a5356`, Engineering Gate run `32981870520` (#517).
- **Functional checkpoint result:** PASS — 196-file repository/secret checks, 72 unit tests, 1 integration test, 310 pgTAP/RLS assertions across 12 files, production build, and 67 passed / 1 skipped desktop-mobile browser workflows with no retry/flaky recovery.
- **Task 4 state:** Slice 6 foundation/health/home/evidence reconciliation is implemented but PENDING its own exact-head Engineering Gate. The Task 3 checkpoint does not substitute for a missing or failed reconciliation-head gate.
- **Owner acceptance:** intentionally deferred under `BATCH_AFTER_SLICE_10`. No Slice 4–9 owner browser acceptance is claimed.
- **Merge:** prohibited before the combined Slice 10 owner handoff and acceptance.

## Permanent engineering gate

| ID | Check | Command / evidence | Required | Candidate status |
|---|---|---|---:|---|
| ENG-001 | Required repository files and master commands exist | `pnpm repo:check` | Yes | PASS at Task 3 checkpoint — 196 tracked files |
| ENG-002 | Generated evidence, private env files and forbidden key material are not tracked | `pnpm repo:check` | Yes | PASS |
| ENG-003 | Tracked-file secret-pattern scan | `pnpm security:secrets` | Yes | PASS at Task 3 checkpoint — 196 files |
| ENG-004 | Reproducible frozen dependency install | `pnpm install --frozen-lockfile` | Yes | PASS |
| ENG-005 | ESLint with zero warnings | `pnpm lint` | Yes | PASS |
| ENG-006 | Strict TypeScript | `pnpm typecheck` | Yes | PASS |
| ENG-007 | Unit-testable application/domain logic meets scoped coverage floor | `pnpm test:unit` | Yes | PASS at Task 3 checkpoint — 72/72; 97.55% statements/lines, 85.95% branches, 100% functions |
| ENG-008 | Health route API contract | `pnpm test:integration` | Yes | PENDING exact-head Slice 6 reconciliation gate; contract now requires Slice 6 |
| ENG-009 | Production dependency audit | `pnpm security:dependencies` | Yes | PASS — no known vulnerabilities at Task 3 checkpoint |
| ENG-010 | Audited runtime dependency compatibility | `pnpm runtime:dependencies` | Yes | PASS — nanoid 3.3.18, postcss 8.5.23, sharp 0.35.3 |
| ENG-011 | Next.js optimized production build | `pnpm build` | Yes | PASS at Task 3 checkpoint; final reconciliation head PENDING |
| ENG-012 | Supabase database and RLS regression suite | `pnpm test:database` | Yes | PASS — 12 files / 310 assertions at Task 3 checkpoint |
| ENG-013 | Chromium desktop workflows | Playwright `chromium-desktop` | Yes when browser-impacting | PASS at Task 3 checkpoint; final reconciliation head PENDING |
| ENG-014 | Chromium mobile workflows | Playwright `chromium-mobile` | Yes when browser-impacting | PASS at Task 3 checkpoint; final reconciliation head PENDING |
| ENG-015 | Master gate fails closed and preserves cheap-before-expensive ordering | `pnpm verify:full` | Yes | PASS |
| ENG-016 | Change-aware verification and truthful manual-test handoff | `ci-impact.mjs` + `report:handoff` | Yes | PENDING final Slice 6 handoff; owner testing remains deferred through Slice 9 |
| ENG-017 | GitHub Actions isolated Supabase, caching, failure evidence and Job Summary | `Engineering Gate` | Yes | PENDING exact-head Slice 6 Task 4 gate |

## Foundation and Slice 1 regressions

| ID | Workflow / boundary | Automated assertions | Required | Candidate status |
|---|---|---|---:|---|
| FND-001 | `/` and framework navigation | route and visible state stay synchronized without manual refresh | Yes | PENDING final Slice 6 label/home reconciliation gate |
| FND-002 | Back/Forward/refresh | history restores correct screen and protected state | Yes | PASS |
| FND-003 | `/health` | 200 with current active Slice 6 contract | Yes | PENDING exact-head unit/integration/browser verification |
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

## Slice 6 — Crowd Demand Board

| ID | Check | Automated protection | Required | Candidate status |
|---|---|---|---:|---|
| DEM-001 | Demand validation, opaque public IDs and public-safe projection | demand policy + pgTAP `0009` + demand E2E | Yes | PASS at Task 3 checkpoint |
| DEM-002 | One account has at most one support edge and equivalent retries remain idempotent | pgTAP `0009` + `demand.spec.ts` desktop/mobile | Yes | PASS at Task 3 checkpoint |
| DEM-003 | Referenced creator is only suggested/requested until their own explicit interest | demand policy + pgTAP `0009` + demand E2E | Yes | PASS at Task 3 checkpoint |
| DEM-004 | Creator decline remains private while durable creator interest may become public | pgTAP `0010` + demand E2E | Yes | PASS at Task 3 checkpoint |
| DEM-005 | Block/privacy/effective-expiry rules fail closed around Demand interactions | pgTAP `0009`/`0010b` + policy | Yes | PASS at Task 3 checkpoint |
| DEM-006 | Conversion provenance is creator-only, requires active approved Creator workspace and durable interest, and grants fan no project control | conversion unit tests + pgTAP `0010b` | Yes | PASS at Task 3 checkpoint |
| DEM-007 | Slice 6 precursor does not create a project or mark demand converted before Slice 7 atomic creation | pgTAP `0010b` | Yes | PASS at Task 3 checkpoint |
| DEM-008 | Demand Board/create/detail/creator-response routes are real, refresh-safe and responsive | `demand.spec.ts` desktop/mobile + foundation contracts | Yes | PASS functionally; final Slice 6 metadata gate PENDING |

## Security matrix

| ID | Boundary | Candidate status | Activation / scope rule |
|---|---|---|---|
| SEC-001 | Tracked secret/private-key detection | PASS | permanent engineering gate |
| SEC-002 | Generated browser evidence excluded from Git | PASS | permanent engineering gate |
| SEC-003 | Production dependency audit/runtime compatibility | PASS | permanent engineering gate |
| SEC-004 | Authentication/session security | PASS | accepted Slice 2 boundary |
| SEC-005 | Role/workspace isolation | PASS | accepted Slice 2 boundary |
| SEC-006 | Database constraints/RLS | PASS | cumulative through Slice 6 Task 3; final reconciliation gate PENDING |
| SEC-007 | Profile-media ownership/type/size/privacy | PASS | accepted Slice 3 profile-media scope |
| SEC-008 | Adult-access provider boundary | PASS/PARTIAL | provider-required mode fails closed; production adapter remains deferred |
| SEC-009 | Identity/performer verification evidence boundary | PASS/PARTIAL | normalized V2/V3 state is implemented; synthetic adapter is dev/CI only and production remains fail-closed |
| SEC-010 | Payment/webhook/idempotency | BLOCKED | introduced in the funding/payment slice |
| SEC-011 | Consent/release/payout invariants | BLOCKED | introduced in later canonical slices |

## Deferred product layers

Project drafts and collaboration invitations, contracts/consent/boundaries, campaign publishing and pre-booking, funding dashboard/payment state, production uploads, delivery review, secure releases, double-entry ledger/revenue splits/payouts, copyright operations, full agency operations, moderation and later administration remain deferred to their canonical slices. Slice 6 must not be interpreted as implementing project creation, contract consent or financial state.

## Readiness rule

Slice 6 becomes an **automated checkpoint** only when the latest required Engineering Gate attached to the final Task 4 reconciliation head is green. Task 3 head `adddb274fbb78eb7ee722d8e4c999ae0bc2a5356` and Gate #517 prove the Demand workflows and conversion precursor, but cannot substitute for a missing or failed gate after foundation/evidence reconciliation. Owner acceptance remains deferred until the combined Slice 10 handoff, and PR #6 must remain Draft/unmerged until then.
