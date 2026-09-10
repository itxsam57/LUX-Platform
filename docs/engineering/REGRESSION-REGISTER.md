# LUX Platform — Regression Register

Stable IDs are permanent. Do not remove or weaken a protection without explicit approval and replacement evidence.

Status is evaluated on the active cumulative Milestone 1 candidate. **ACTIVE** means the repository protection exists and must keep passing; **PARTIAL** means repository protection exists but production-provider or external-runtime acceptance is still outstanding; **BLOCKED** means the corresponding required system is absent.

| ID | Defect prevented / expected behavior | Automated protection | Status |
|---|---|---|---|
| REG-001 | URL/history changes never leave stale visible state or require manual refresh | foundation/navigation/history Playwright | ACTIVE |
| REG-002 | Cross-role/workspace access is denied by trusted server/API/database boundaries | auth/workspace pgTAP + E2E | ACTIVE |
| REG-003 | Visible controls complete real authorized durable workflows and report truthful state | cumulative integration + E2E | ACTIVE |
| REG-004 | Verification submitter/reviewer state remains one durable normalized record | Slice 5 pgTAP + verification E2E | ACTIVE/PARTIAL |
| REG-005 | Record/form/media state never leaks between owners | profile/project/funding RLS/RPC + E2E | ACTIVE |
| REG-006 | Supported profile media validates, sanitizes, persists, replaces and renders consistently | media unit + pgTAP + E2E | ACTIVE/PARTIAL |
| REG-007 | Saved drafts survive navigation/refresh and stale revisions cannot overwrite newer state | project/campaign persistence + project E2E | ACTIVE |
| REG-008 | Notifications remain recipient-only, block-aware and deep-link correctly | notification pgTAP + privacy-rights E2E | ACTIVE |
| REG-009 | Back/Forward/direct navigation cannot revive another workspace or stale permission | auth-isolation E2E | ACTIVE |
| REG-010 | White screens/silent crashes are replaced by controlled loading/error/404 states | route boundaries + Playwright runtime checks | ACTIVE |
| REG-011 | Duplicate clicks/retries do not create duplicate durable effects, including demand/pre-book/payment/refund paths | pgTAP + E2E + payment tests | ACTIVE |
| REG-012 | Queue transitions update durable subject state rather than disappearing on one side | verification transition RPC + E2E | ACTIVE/PARTIAL |
| REG-013 | Internal navigation remains framework-safe | ESLint + Playwright | ACTIVE |
| REG-014 | Coverage measures unit-testable logic while browser/integration tests cover routes/persistence | Vitest config + engineering gate | ACTIVE |
| REG-015 | Dependency install cannot drift | committed lockfile + frozen CI install | ACTIVE |
| REG-016 | Generated evidence, private env files or secrets never enter Git | gitignore + repo check + secret scan | ACTIVE |
| REG-017 | Consent/contract gates remain enforced through release and payout eligibility | Slices 8, 13 and 14 policy + pgTAP/browser protection | ACTIVE |
| REG-018 | Agency communication can never replace personal performer consent | Slice 8 pgTAP + contracts-consent E2E | ACTIVE |
| REG-019 | Vulnerable production dependencies do not pass unnoticed | dependency audit + frozen versions | ACTIVE |
| REG-020 | Security overrides cannot silently break runtime image tooling | runtime compatibility + build + media tests | ACTIVE |
| REG-021 | Expensive browser work never runs after a cheap prerequisite failure | master gate ordering + workflow dependency | ACTIVE |
| REG-022 | Owner receives exact visible tests only after automated readiness; Milestone 1 owner acceptance stays separate from automation | handoff generator + governor ledger | ACTIVE |
| REG-023 | Fixed mobile navigation never covers actionable controls | mobile shell/touch-target Playwright | ACTIVE |
| REG-024 | Hidden overlay content never widens the mobile document | desktop/mobile overflow regressions | ACTIVE |
| REG-025 | Invalid responsive sizing never creates intrinsic horizontal overflow | build + desktop/mobile overflow | ACTIVE |
| REG-026 | Keyboard tab focus and selected state remain synchronized | design-system Playwright | ACTIVE |
| REG-027 | Dialog/drawer/menu always has reliable close/Escape behavior | design-system Playwright | ACTIVE |
| REG-028 | Handoff never reports an obsolete slice/deferred area/testing policy | foundation contract + handoff generator | ACTIVE |
| REG-029 | Catalogue fixtures never imply nonexistent production actions | catalogue copy + browser assertions | ACTIVE |
| REG-030 | Auth responses do not leak whether an account exists | auth policy + auth E2E | ACTIVE |
| REG-031 | Sign-out-all invalidates older protected sessions while permitting a new login | precise revocation pgTAP + E2E | ACTIVE |
| REG-032 | Requested Creator/Agency role grants no permission before approval | auth/workspace RLS + E2E | ACTIVE |
| REG-033 | Approved roles do not silently merge or self-activate | workspace RLS + navigation E2E | ACTIVE |
| REG-034 | Public profile never exposes email/auth/age/internal UUID data | public-profile allowlist pgTAP + E2E | ACTIVE |
| REG-035 | Public/unlisted/private visibility states remain distinct | visibility pgTAP + profile E2E | ACTIVE |
| REG-036 | Profile media strips attacker metadata, hides account UUID path and obeys privacy | media processing + pgTAP + E2E | ACTIVE |
| REG-037 | Duplicate handles/unsafe links fail safely while valid profile edits persist | profile policy + hardening E2E | ACTIVE |
| REG-038 | Block/follow relationships cannot remain contradictory or be bypassed | relationship pgTAP + profile E2E | ACTIVE |
| REG-039 | Existing mute/block can still be removed after adult assurance expiry | age-revocation pgTAP + privacy-rights E2E | ACTIVE |
| REG-040 | Supporter identity defaults private rather than public | privacy resolver + E2E | ACTIVE |
| REG-041 | Account export excludes tokens/auth/age/internal UUID relationships and writes a receipt | export pgTAP + E2E | ACTIVE |
| REG-042 | Repeated deletion request creates at most one active request | privacy pgTAP + E2E | ACTIVE |
| REG-043 | Notification cannot be read by another user or survive a block relationship | pgTAP + privacy-rights E2E | ACTIVE |
| REG-044 | Adult assurance expiry between staging and mutation fails closed | media-staging age boundary + E2E | ACTIVE |
| REG-045 | Avatar replacement never changes guarded public address or exposes partial media state | media boundary + hardening E2E | ACTIVE |
| REG-046 | Private/unlisted/blocked profiles never enter discovery ranking | discovery pgTAP + browser workflows | ACTIVE |
| REG-047 | For You ranking stays deterministic/explainable/diversity-capped | ranking unit tests | ACTIVE |
| REG-048 | Discovery projections never grow to expose UUID/email/private fields | projection parser + pgTAP + build/E2E | ACTIVE |
| REG-049 | Feed/explore/search cannot regress to 404/stale/manual-refresh routes | discovery desktop/mobile E2E | ACTIVE |
| REG-050 | Users cannot self-promote V2/V3 or perform unauthorized review transitions | verification pgTAP + E2E | ACTIVE |
| REG-051 | Public verification never leaks legal evidence/provider refs/raw payload/internal UUIDs | verification RLS/RPC + E2E | ACTIVE |
| REG-052 | Revoked/expired verification never remains current or keeps a stronger badge | verification policy + pgTAP + E2E | ACTIVE |
| REG-053 | V3 cannot be granted without V2 and performer prerequisites | verification policy + pgTAP | ACTIVE |
| REG-054 | Synthetic identity cannot be mistaken for production verification | environment/policy + fail-closed adapter boundary | ACTIVE/PARTIAL |
| REG-055 | Reviewer E2E synchronizes against committed state, not incidental navigation | verification durable-state polling | ACTIVE |
| REG-056 | Super-admin bootstrap cannot collapse staff/fan workspace isolation | verification reviewer workflow | ACTIVE |
| REG-057 | Home, health and handoff must advertise one active slice | foundation unit/API/browser + handoff generator | ACTIVE |
| REG-058 | Retried demand support cannot inflate counts | demand support primary key + pgTAP + E2E | ACTIVE |
| REG-059 | Suggested creator can never be presented as committed before their own interest action | demand policy + pgTAP + E2E | ACTIVE |
| REG-060 | Creator decline remains private | private response projection + demand E2E | ACTIVE |
| REG-061 | Fan/unrelated/stale creator cannot acquire demand conversion control | conversion unit + pgTAP | ACTIVE |
| REG-062 | Demand conversion precursor cannot fabricate a project before atomic creation | conversion pgTAP | ACTIVE |
| REG-063 | Later block/decline/expiry must invalidate earlier creator interest at conversion time | conversion unit + pgTAP | ACTIVE |
| REG-064 | Demand→project conversion must preserve source provenance and creator ownership without granting fan control | Slice 7 project pgTAP + cumulative journey | ACTIVE |
| REG-065 | Stale project revision must not overwrite a newer durable revision | project policy/pgTAP + projects E2E | ACTIVE |
| REG-066 | Invitation negotiation state must persist, while invitation acceptance remains explicitly non-legal | invitation policy/pgTAP + E2E | ACTIVE |
| REG-067 | Exact terms acceptance must bind an immutable version; material changes reopen affected acceptance | contract version/hash tests + pgTAP + E2E | ACTIVE |
| REG-068 | Depicted-person consent must be personal and cannot be executed by an agency | contract/consent pgTAP + E2E | ACTIVE |
| REG-069 | Contract lock must fail until every required acceptance/consent is current | contract pgTAP + E2E | ACTIVE |
| REG-070 | Campaign publication must fail closed until contract/verification/funding gates permit it; public projection stays allowlisted | campaign policy/pgTAP + E2E | ACTIVE |
| REG-071 | Pre-book must remain an idempotent commitment, not a hidden payment/card authorization | pre-book policy/pgTAP + E2E | ACTIVE |
| REG-072 | Payment transitions/webhook replay must be legal, verified and idempotent without raw card retention | sandbox adapter tests + funding-payment pgTAP | ACTIVE/PARTIAL |
| REG-073 | Sandbox payment state must be visibly non-production and production payment mode must fail closed without an approved provider | payment env/adapter + funding E2E | ACTIVE/PARTIAL |
| REG-074 | Funding dashboard/detail must expose only the signed-in supporter's safe projection and never processor/internal IDs | funding projection pgTAP + funding E2E | ACTIVE |
| REG-075 | Material campaign change must show exact old/new terms and require explicit supporter acceptance | funding change RPC + E2E | ACTIVE |
| REG-076 | Refund intent must be explicit and idempotent; duplicate requests cannot create duplicate durable effects | refund RPC + funding E2E | ACTIVE |
| REG-077 | Cross-slice navigation cannot strand users between locked project→campaign or public campaign→pre-book | cumulative `marketplace-4-10-journey.spec.ts` desktop/mobile | ACTIVE |
| REG-078 | Fans cannot read private production assets or unapproved production updates | production policy + Slice 11 pgTAP + production routes | ACTIVE |
| REG-079 | Final-file replacement invalidates stale final-cut/review approval and review decisions remain durable/audited | review policy + Slice 12 pgTAP | ACTIVE |
| REG-080 | Non-entitled/refunded/expired viewers cannot obtain durable playback access or permanent object URLs | release policy + Slice 13 pgTAP | ACTIVE |
| REG-081 | Journals balance, unavailable funds cannot be paid, and payout/reconciliation retries remain idempotent | finance policy + earnings/payout E2E + Slice 14 pgTAP | ACTIVE/PARTIAL |
| REG-082 | Copyright evidence stays scoped while false-positive/counter-notice/history paths remain available | copyright policy + Slice 15 pgTAP | ACTIVE |
| REG-083 | Agency authority requires performer-accepted scope and can never substitute for performer consent/final-cut approval | agency policy + Slice 16 pgTAP | ACTIVE |
| REG-084 | Staff queues remain permission-scoped, critical actions require reason/confirmation, audit history is immutable, and release requires recovery proof | admin policy + launch-hardening E2E + backup-recovery harness + Slice 17 pgTAP | ACTIVE/PARTIAL |

## Evidence baseline

- Canonical disposable-lab committed baseline: `518716402c09def0f2428ea4bd50398a9020132b`.
- The active local Milestone 1 candidate adds repository-buildable Slices 11–17, Next.js 15.5.24 / Sharp 0.35.4 dependency hardening, Slice 17 foundation/handoff identity, migrations `20260910000100`…`20260910000700`, and pgTAP `0019`…`0025`.
- Latest focused reconciliation evidence: foundation unit 44/44, handoff regression 2/2, and foundation desktop/mobile Playwright 10/10. The canonical full gate must be rerun after final reconciliation; its generated report is the source of truth for unavailable database/browser stages.
- Live Supabase/RLS, authenticated DB-backed browser acceptance, real staging backup restore, approved production providers, and product-owner Milestone 1 acceptance remain external/owner gates and must never be inferred from local unit or synthetic-adapter success.

## Adding regressions

For every confirmed serious defect, add a permanent ID with root cause, affected workflow, expected behavior, automated protection and status. A green result obtained by weakening/skipping genuine coverage is not valid regression protection.
