# LUX Platform — Regression Register

Stable IDs remain permanent. Do not remove or weaken a protection without explicit approval and replacement evidence.

Status is evaluated on the active candidate. **ACTIVE** means the protection exists and must pass the applicable gate; **PARTIAL** means the implemented slice is protected but a broader later product layer still needs its own regression; **BLOCKED** means the corresponding production system is intentionally absent.

| ID | Defect prevented | Expected behavior | Automated protection | Status |
|---|---|---|---|---|
| REG-001 | URL changes while visible page stays stale or requires refresh | Route, Back, Forward, and refresh always show the matching screen | Playwright foundation/navigation/history/refresh | ACTIVE |
| REG-002 | Cross-role or cross-workspace access | Trusted server/API/database boundaries deny unauthorized routes and data | pgTAP auth/workspace RLS + `auth-isolation.spec.ts` | ACTIVE |
| REG-003 | Button changes text without completing a real workflow | Implemented production controls perform authorized durable actions and report truthful success/failure | Slice 2/3 integration + E2E; later actions require their own tests | ACTIVE/PARTIAL |
| REG-004 | Submitted evidence missing for reviewer or reviewer result missing for submitter | Both sides reference one durable record and synchronize without refresh | future upload/review integration | BLOCKED |
| REG-005 | File or form state leaks into another record/account | Implemented profile state and media stay owner-scoped; later records require equivalent guards | profile RPC/RLS + media boundary + E2E | ACTIVE/PARTIAL |
| REG-006 | Allowed media cannot upload/replace/preview safely | Declared profile image types validate, sanitize, persist, replace and render consistently | media unit tests + pgTAP media boundary + profile E2E | ACTIVE/PARTIAL |
| REG-007 | Draft text disappears after navigation/refresh | Saved draft restores; unsaved-exit behavior is explicit | future draft-bearing workflow tests | BLOCKED |
| REG-008 | Notification opens dead/wrong/unauthorized route | Recipient-only notification deep link opens the permitted profile target and blocked actors are suppressed | pgTAP notification rules + `privacy-rights.spec.ts` | ACTIVE |
| REG-009 | Back action enters another workspace or revives stale permission | Back/Forward/refresh/direct navigation remains inside current authorized workspace | `auth-isolation.spec.ts` desktop/mobile | ACTIVE |
| REG-010 | White screen, silent crash, or uncontrolled error | Controlled loading/error/404 state; no uncaught page or console errors | route boundaries + Playwright page-error/console/404 checks | ACTIVE |
| REG-011 | Duplicate click creates duplicate durable effect | Implemented idempotent flows create one durable effect; payment idempotency remains future scope | deletion/follow notification pgTAP + privacy E2E | ACTIVE/PARTIAL |
| REG-012 | Queue item disappears while permanently pending elsewhere | One valid state transition updates all projections atomically | future queue/state-machine integration | BLOCKED |
| REG-013 | Internal links use raw anchors and fail framework navigation rules | Internal route navigation uses framework-safe navigation and passes lint/browser tests | ESLint + Playwright | ACTIVE |
| REG-014 | Unit coverage includes framework/config files and creates misleading failure | Coverage floor applies to unit-testable application/domain logic; UI/routes have separate tests | Vitest config + engineering gate | ACTIVE |
| REG-015 | CI cache/setup fails because lockfile is missing or install drifts | Lockfile is committed; CI uses frozen install and supported pnpm cache | repository check + frozen GitHub Actions install | ACTIVE |
| REG-016 | Generated evidence or secrets enter Git | Reports, coverage, build output, traces, screenshots, video, env files and keys remain untracked | `.gitignore`, repository check, secret scan | ACTIVE |
| REG-017 | Release/payout occurs without consent, legality, copyright, quality and review gates | All required durable approvals precede entitlement or ledger release | future consent/security/ledger tests | BLOCKED |
| REG-018 | Agency action replaces performer consent | Performer personally accepts project-specific terms and required final-cut approval | future consent/authorization tests | BLOCKED |
| REG-019 | Vulnerable framework/browser dependencies pass unnoticed | Production audit blocks required advisories and frozen audited versions are committed | dependency audit + frozen install | ACTIVE |
| REG-020 | Security override resolves but breaks Next.js runtime image tooling | Audited runtime resolutions remain compatible and Sharp performs real image conversion | runtime compatibility check + production build + media tests | ACTIVE |
| REG-021 | Expensive browser setup runs after cheap prerequisite failure | Browser install/tests are blocked until cheap prerequisite gates pass | master gate ordering + GitHub workflow dependency | ACTIVE |
| REG-022 | Owner receives vague or unnecessary manual testing | Generated handoff lists exact visible tests only after automated readiness; the approved Slice 4→10 run defers owner execution until the combined Slice 10 handoff | `report:handoff` + GitHub Job Summary + Governor policy | ACTIVE |
| REG-023 | Fixed mobile navigation covers a button | Interactive content retains safe bottom clearance and visible controls remain actionable | mobile shell/touch-target Playwright | ACTIVE |
| REG-024 | Hidden tooltip/overlay widens the mobile document | Absolutely positioned content stays bounded by viewport | desktop/mobile overflow regression | ACTIVE |
| REG-025 | Invalid responsive width silently creates intrinsic overflow | Responsive containers use valid widths and document never exceeds viewport | build + desktop/mobile overflow workflow | ACTIVE |
| REG-026 | Tabs look keyboard-accessible while focus and selection diverge | ArrowLeft/Right, Home and End keep focus and selected tab synchronized | desktop/mobile design-system workflow | ACTIVE |
| REG-027 | Dialog/drawer opens without reliable close path | Labelled overlays close through controls and Escape without trapping route | desktop/mobile overlay workflow | ACTIVE |
| REG-028 | Handoff describes an old slice, obsolete deferred area, or wrong owner-test timing | Handoff derives active slice, changed visible surfaces, deferred areas and owner-testing policy from repository/Governor state | handoff generator + Job Summary | ACTIVE |
| REG-029 | Catalogue control implies a production action that does not exist | Fixtures explicitly state they do not upload, persist, authorize, pay or modify production data | catalogue copy assertions + browser review | ACTIVE |
| REG-030 | Weak/generic auth behavior leaks whether an account exists | Sign-up/recovery responses remain safe while valid verification/recovery still works | auth policy + desktop/mobile `auth-isolation.spec.ts` | ACTIVE |
| REG-031 | “Sign out all devices” leaves an older protected session usable | Revocation invalidates prior sessions while allowing a fresh authenticated session | pgTAP precise revocation + desktop/mobile E2E | ACTIVE |
| REG-032 | Requested Creator/Agency role becomes permission before approval | Requested state grants no protected route/data access | auth/workspace RLS + direct-route E2E | ACTIVE |
| REG-033 | Approved roles silently merge or activate themselves | Approved roles remain separate until explicit workspace activation; unrelated staff access remains denied | auth/workspace RLS + history/refresh/direct-route E2E | ACTIVE |
| REG-034 | Public profile response leaks email, auth metadata, age evidence or internal UUID | Public profile is an allowlisted projection only | pgTAP `0003_profiles_privacy_rls` + profile E2E | ACTIVE |
| REG-035 | Public/unlisted/private profile states collapse into one visibility mode | Public is generally readable, unlisted is direct-link readable but undiscoverable, private is owner-only | pgTAP visibility assertions + desktop/mobile profile E2E | ACTIVE |
| REG-036 | Profile media stores attacker metadata, exposes account UUID path, or ignores privacy | Decode/auto-orient/constrain/strip/re-encode to WebP; private bucket uses opaque namespace; guarded handle route enforces visibility | media unit tests + pgTAP `0004`/`0006` + profile E2E | ACTIVE |
| REG-037 | Duplicate handle or unsafe link persists and later renders dangerous/stale state | Handle uniqueness/reserved rules and HTTPS-only links fail safely; valid edits persist after refresh | policy unit tests + `profile-hardening.spec.ts` | ACTIVE |
| REG-038 | Follow/block edges remain contradictory or block can be bypassed | Blocking removes follow edges both directions, prevents interaction, hides profiles, and unblock permits a fresh lawful follow | pgTAP relationship rules + profile E2E | ACTIVE |
| REG-039 | Mute/block privacy right becomes unavailable after adult assurance expires | Existing mute/block relationships can still be removed with a current authenticated session | pgTAP age-revocation boundary + `privacy-rights.spec.ts` | ACTIVE |
| REG-040 | Supporter identity defaults public by accident | Supporter anonymity defaults on, preview matches durable resolver, and preference persists | profile/privacy boundary + E2E | ACTIVE |
| REG-041 | Account export leaks tokens, auth metadata, age evidence or internal UUID relationships | Export uses explicit owner allowlist, UUID-free social projection and writes a receipt | pgTAP `0005_profile_export_boundary` + `privacy-export.spec.ts` | ACTIVE |
| REG-042 | Repeated deletion submit creates multiple active deletion requests | Exact confirmation produces at most one active request and cancellation is durable | pgTAP privacy rules + `privacy-rights.spec.ts` | ACTIVE |
| REG-043 | Notification is readable by another user or survives a block relationship | Only recipient reads/marks it; profile deep link is authorized; blocked actor notification is suppressed | pgTAP + `privacy-rights.spec.ts` | ACTIVE |
| REG-044 | Adult assurance expires between media staging and durable profile mutation | Final storage/profile mutation revalidates current authorization/assurance and fails closed | pgTAP `0006_media_staging_age_revocation` + profile hardening workflows | ACTIVE |
| REG-045 | Public avatar replacement changes address or serves stale/partially committed media | Replacement completes before success state and stable guarded media URL resolves the new processed object | media boundary + `profile-hardening.spec.ts` | ACTIVE |
| REG-046 | Private, unlisted, or blocked profiles enter discovery ranking and leak through feed/search | Discovery candidate RPCs suppress private/non-discoverable and either-direction blocked profiles before ranking/rendering | pgTAP `0007_slice_4_discovery` + discovery browser workflows | ACTIVE |
| REG-047 | For You ranking becomes opaque, unstable, or lets one creator monopolize results | Explicit followed/interest/freshness/engagement weights, stable tie breaking and creator diversity cap remain deterministic | `src/lib/discovery/ranking.test.ts` | ACTIVE |
| REG-048 | Search/discovery response grows to expose UUID/email/private fields | Discovery UI parses an explicit profile allowlist and database projections use public handle/stage fields only | discovery projection parser + pgTAP boundary + build/browser tests | ACTIVE |
| REG-049 | Discovery routes look implemented but are 404s or require manual refresh | `/app/feed`, `/app/explore`, `/app/search` are real adult-protected routes and preserve responsive/navigation behavior | `discovery.spec.ts` desktop/mobile + foundation regressions | ACTIVE |

## Evidence baseline

The accepted Slices 0–3 baseline is `main` at `21135e5895390294ba503df3d2dfba1a3dc6795e`. Slice 4 is the active candidate on Draft PR #6. Its current checkpoint must obtain its own green cumulative Engineering Gate; older Slice 3 evidence cannot substitute for a failed or missing current-head gate.

## Adding regressions

For every confirmed serious defect, add a new permanent ID with the root cause, affected role/workflow, expected behavior, automated test path/name, any final manual spot-check, date and status. A green test obtained by skipping or weakening coverage is not valid regression protection.