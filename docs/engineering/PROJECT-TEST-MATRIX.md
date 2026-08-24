# LUX Platform — Project Test Matrix

Statuses: **PASS**, **FAIL**, **BLOCKED**, **NOT APPLICABLE**, **NOT CONFIGURED**. A required BLOCKED/FAIL result prevents readiness for that feature or slice.

## Candidate and acceptance state

- **Active candidate:** Slice 3 — Profiles and privacy, PR #4 (`feature/slice-3-profiles-privacy`).
- **Base:** `main` at `e09d6fe20bcbc9f6753b136021b707d8392a73ee`.
- **Pre-reconciliation full baseline:** Engineering Gate run `32680016367` (run #306), PR head `42bdb059e7cd6e89e77ee43b34d789c7240a41a3`, tested as GitHub PR integration commit `1b2f996dc3e94e77cad8a8f3a01049ef6db61f25`.
- **Baseline result:** all required automated gates PASS, including 166 pgTAP/RLS assertions and 48 desktop/mobile Playwright workflows.
- **Acceptance:** automated-ready; final owner browser acceptance is still required before merge.
- After any candidate-head change, the **latest successful Engineering Gate attached to the current PR head** is authoritative. A prior green run never substitutes for a failed or missing current-head gate.

## Permanent engineering gate

| ID | Check | Command / evidence | Required | Candidate status |
|---|---|---|---:|---|
| ENG-001 | Required repository files and master commands exist | `pnpm repo:check` | Yes | PASS — 137 tracked files inspected in baseline |
| ENG-002 | Generated evidence, private env files, and forbidden key material are not tracked | `pnpm repo:check` | Yes | PASS |
| ENG-003 | Tracked-file secret-pattern scan | `pnpm security:secrets` | Yes | PASS — 137 files inspected |
| ENG-004 | Reproducible frozen dependency install | `pnpm install --frozen-lockfile` | Yes | PASS |
| ENG-005 | ESLint with zero warnings | `pnpm lint` | Yes | PASS |
| ENG-006 | Strict TypeScript | `pnpm typecheck` | Yes | PASS |
| ENG-007 | Unit-testable application/domain logic meets scoped coverage floor | `pnpm test:unit` | Yes | PASS — 39 tests; 97.51% statements/lines, 85.95% branches, 100% functions |
| ENG-008 | Health route API contract | `pnpm test:integration` | Yes | PASS — 1 test |
| ENG-009 | Production dependency audit | `pnpm security:dependencies` | Yes | PASS — no known vulnerabilities in baseline |
| ENG-010 | Audited runtime dependency compatibility | `pnpm runtime:dependencies` | Yes | PASS — nanoid 3.3.18, postcss 8.5.23, sharp 0.35.3 |
| ENG-011 | Next.js optimized production build | `pnpm build` | Yes | PASS |
| ENG-012 | Supabase database and RLS regression suite | `pnpm test:database` | Yes | PASS — 6 files / 166 assertions |
| ENG-013 | Chromium desktop workflows | Playwright `chromium-desktop` | Yes when browser-impacting | PASS — 24 workflows |
| ENG-014 | Chromium mobile workflows | Playwright `chromium-mobile` | Yes when browser-impacting | PASS — 24 workflows |
| ENG-015 | Master gate fails closed and preserves cheap-before-expensive ordering | `pnpm verify:full` | Yes | PASS |
| ENG-016 | Change-aware verification and truthful manual-test handoff | `ci-impact.mjs` + `report:handoff` | Yes | PASS — Slice 3 handoff generated only after full gate |
| ENG-017 | GitHub Actions isolated Supabase, dependency caching, failure evidence and Job Summary | `Engineering Gate` | Yes | PASS |

## Foundation and Slice 1 regressions

| ID | Workflow / boundary | Automated assertions | Required | Candidate status |
|---|---|---|---:|---|
| FND-001 | `/` and framework navigation | route and visible state stay synchronized without manual refresh | Yes | PASS — desktop/mobile |
| FND-002 | Back/Forward/refresh | history restores correct screen and protected state | Yes | PASS — desktop/mobile |
| FND-003 | `/health` | 200 and current Slice 3 contract | Yes | PASS |
| FND-004 | Unknown route | controlled 404 with recovery path | Yes | PASS — desktop/mobile |
| FND-005 | Responsive safety | no horizontal document overflow at desktop/mobile widths | Yes | PASS |
| FND-006 | Keyboard navigation | primary account/navigation actions remain reachable and operable | Yes | PASS |
| UI-001 | Design-system catalogue | required primitive families render without runtime/page errors | Yes | PASS — desktop/mobile |
| UI-002 | Tabs | ArrowLeft/Right, Home/End keep focus and selected state synchronized | Yes | PASS — desktop/mobile |
| UI-003 | Dialog/drawer/menu feedback | explicit close paths, Escape, truthful action feedback | Yes | PASS — desktop/mobile |
| UI-004 | Responsive shell | correct desktop sidebar/top bar and mobile navigation/touch targets | Yes | PASS — desktop/mobile |
| UI-005 | Controlled route states and reduced-motion-safe presentation | no white screen/uncontrolled route state | Yes | PASS |

## Slice 2 — Authentication, adult access and workspace isolation

These protections are present in the Slice 3 PR candidate even though `main` has not yet accepted them independently.

| ID | Check | Automated protection | Required | Candidate status |
|---|---|---|---:|---|
| AUTH-001 | Sign-up validation and account-enumeration resistance | auth unit/E2E + database boundary | Yes | PASS |
| AUTH-002 | Email verification, sign-in/sign-out and password recovery | desktop/mobile auth workflows | Yes | PASS |
| AUTH-003 | Precise session revocation / sign out all devices | pgTAP `0002` + desktop/mobile E2E | Yes | PASS |
| AUTH-004 | Adult access gate precedes protected workspace access | auth policy + E2E | Yes | PASS |
| AUTH-005 | Provider-required mode fails closed; self-attestation is development-only | auth policy + environment contract + build/E2E | Yes | PASS — production provider adapter remains deferred |
| AUTH-006 | Fan/Creator/Agency/Staff route isolation | pgTAP `0001` + auth-isolation E2E | Yes | PASS |
| AUTH-007 | Requested role grants no permission before approval | database/RLS + E2E | Yes | PASS |
| AUTH-008 | Approved roles remain separate until explicitly activated | database/RLS + Back/Forward/refresh/direct-route E2E | Yes | PASS |
| AUTH-009 | Restricted staff/super-admin boundary | database/RLS + route denial workflows | Yes | PASS |

## Slice 3 — Profiles, privacy, media and notifications

| ID | Check | Automated protection | Required | Candidate status |
|---|---|---|---:|---|
| PRO-001 | Owner profile edit persistence | policy unit tests + profile E2E | Yes | PASS |
| PRO-002 | Handle/display/bio/language/link validation | policy unit tests + hardening E2E | Yes | PASS |
| PRO-003 | Safe avatar/banner processing | media unit tests + profile E2E | Yes | PASS — WebP, constrained dimensions, metadata stripped |
| PRO-004 | Private storage and opaque public media addressing | pgTAP `0004`/`0006` + E2E | Yes | PASS |
| PRO-005 | Public projection leaks no email/auth/age/internal UUID data | pgTAP `0003` + profile E2E | Yes | PASS |
| PRO-006 | Public / unlisted / private visibility remain distinct | pgTAP `0003` + profile E2E | Yes | PASS |
| PRO-007 | Follow/unfollow synchronizes without refresh | pgTAP + desktop/mobile E2E | Yes | PASS |
| PRO-008 | Block removes follow edges, prevents interaction and hides both directions | pgTAP + desktop/mobile E2E | Yes | PASS |
| PRO-009 | Mute is private and removable | pgTAP + privacy-rights E2E | Yes | PASS |
| PRV-001 | Supporter anonymity defaults privacy-on and persists | profile/privacy RPC + E2E | Yes | PASS |
| PRV-002 | Owner export is allowlisted, UUID-free and auditable | pgTAP `0005` + export E2E | Yes | PASS |
| PRV-003 | Deletion request is idempotent and cancellable | pgTAP + privacy-rights E2E | Yes | PASS |
| PRV-004 | Export/deletion/supporter privacy and removal of existing block/mute remain available without current adult assurance | pgTAP `0006` + privacy-rights E2E | Yes | PASS |
| NOT-001 | Notifications are recipient-only, markable, deep-linked and block-suppressed | pgTAP + notification E2E | Yes | PASS |
| ISO-001 | Profile/privacy tables use constrained RPC/RLS boundaries; audit rows cannot be forged by users | 166-assertion pgTAP suite | Yes | PASS |

## Security matrix

| ID | Boundary | Candidate status | Activation / scope rule |
|---|---|---|---|
| SEC-001 | Tracked secret/private-key detection | PASS | permanent engineering gate |
| SEC-002 | Generated browser evidence excluded from Git | PASS | permanent engineering gate |
| SEC-003 | Production dependency audit/runtime compatibility | PASS | permanent engineering gate |
| SEC-004 | Authentication/session security | PASS | Slice 2 candidate boundary |
| SEC-005 | Role/workspace isolation | PASS | Slice 2 candidate boundary |
| SEC-006 | Database constraints/RLS | PASS | Slice 2/3 candidate boundary |
| SEC-007 | Profile-media ownership/type/size/privacy | PASS | Slice 3 profile-media scope only; later production-upload systems remain deferred |
| SEC-008 | Payment/webhook/idempotency | BLOCKED | introduce with payment adapter slice |
| SEC-009 | Consent/release/payout invariants | BLOCKED | introduce with consent, review and ledger slices |
| SEC-010 | Adult-access provider boundary | PASS/PARTIAL | fail-closed provider-required mode exists; production provider integration remains deferred |

## Deferred product layers

Feeds/discovery, creator and depicted-person identity verification, demand board, invitations/negotiation/contracts, project consent, campaigns, pre-booking, funding/payments, production uploads, delivery review, secure entitlements/releases, ledger/payouts, copyright operations, agency operations beyond the current workspace boundary, moderation and later administration remain deferred to their canonical slices. They must not be inferred from Slice 3 PASS results.

## Readiness rule

The Slice 3 PR candidate is **automated-ready** only while its latest required Engineering Gate is green. It is **not accepted and must not merge** until the generated Slice 3 manual-test handoff is completed by the owner. After merge, this matrix becomes the accepted baseline for Slices 1–3; until then, `main` remains the previously accepted Slice 1 baseline.