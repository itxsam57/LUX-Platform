# LUX Platform — Regression Register

Stable IDs remain permanent. Do not remove or weaken a protection without explicit approval and replacement evidence.

| ID | Defect prevented | Expected behavior | Automated protection | Status |
|---|---|---|---|---|
| REG-001 | URL changes while visible page stays stale or requires refresh | Route, Back, Forward, and refresh always show the matching screen | Playwright navigation/history/refresh | ACTIVE |
| REG-002 | Cross-role or cross-tenant access | Trusted server/API/database boundary denies unauthorized access | future auth/RLS suites | BLOCKED — systems absent |
| REG-003 | Button changes text without completing real workflow | Every production control performs an authorized durable action and reports success/failure | future integration/E2E per action ID | BLOCKED |
| REG-004 | Submitted evidence missing for reviewer or reviewer result missing for submitter | Both sides reference one durable record and synchronize without refresh | future upload/review integration | BLOCKED |
| REG-005 | File or form state leaks into another record | Each record owns isolated state and storage key | future form/upload tests | BLOCKED |
| REG-006 | Allowed media cannot upload or preview | Declared types validate, persist, and preview consistently | future upload matrix | BLOCKED |
| REG-007 | Draft text disappears after navigation/refresh | Saved draft restores; unsaved-exit behavior is explicit | future persistence E2E | BLOCKED |
| REG-008 | Notification opens dead/wrong route | Deep link opens authorized target in stable state | future notification integration/E2E | BLOCKED |
| REG-009 | Back action enters another workspace | Back/return remains within current authorized workspace | current public history test; future role navigation tests | ACTIVE/PARTIAL |
| REG-010 | White screen, silent crash, or uncontrolled error | Controlled loading/error/404 state; no uncaught page or console errors | route boundaries + Playwright page-error/console/404 checks | ACTIVE |
| REG-011 | Duplicate click creates duplicate record/payment | Idempotency prevents duplicate durable effect | future API/payment tests | BLOCKED |
| REG-012 | Queue item disappears while permanently pending elsewhere | One valid state transition updates all projections atomically | future state-machine/integration tests | BLOCKED |
| REG-013 | Internal links use raw anchors and fail framework navigation rules | Internal route navigation uses Next.js `Link` and passes lint | ESLint + Playwright | ACTIVE |
| REG-014 | Unit coverage includes framework/config files and creates misleading failure | ≥80% threshold applies to unit-testable application/domain logic; UI/routes have separate tests | Vitest config + repository review | ACTIVE |
| REG-015 | CI cache/setup fails because lockfile is missing | lockfile is committed; CI uses frozen install and supported pnpm cache | repository check + frozen GitHub Actions install | ACTIVE |
| REG-016 | Generated evidence or secrets enter Git | reports, coverage, build output, traces, screenshots, video, env files, and keys remain untracked | `.gitignore`, repository check, secret scan | ACTIVE |
| REG-017 | Release/payout occurs without consent, legality, copyright, quality, and review gates | all required durable approvals precede entitlement or ledger release | future state-machine/security/ledger tests | BLOCKED |
| REG-018 | Agency action replaces performer consent | performer personally accepts project-specific terms and required final-cut approval | future consent/authorization tests | BLOCKED |
| REG-019 | Vulnerable framework/browser dependencies pass unnoticed | production audit blocks high/critical advisories; audited patch versions and lockfile are committed | dependency audit + frozen install | ACTIVE |
| REG-020 | Security override resolves but breaks Next.js runtime image tooling | Next resolves PostCSS 8.5.18 and Sharp 0.35.0; Sharp performs a real SVG→PNG conversion before build | runtime dependency compatibility check + production build + E2E | ACTIVE |
| REG-021 | Expensive browser setup runs after cheap prerequisite failure | browser install/tests are blocked until repository, secret, lint, type, unit/API, dependency, runtime, and build gates pass | master gate state ordering | ACTIVE |
| REG-022 | Owner receives vague or unnecessary manual testing | generated handoff lists exact visible tests or explicitly says none are required | `report:handoff` + GitHub Job Summary | ACTIVE |
| REG-023 | Fixed mobile navigation covers a button and Playwright cannot activate it | interactive content retains bottom clearance and controls can be placed fully inside the safe viewport | Pixel 7 overlay/menu/feedback workflows | ACTIVE |
| REG-024 | Hidden tooltip or overlay widens the mobile document | absolutely positioned content remains bounded by the viewport even before it becomes visible | desktop/mobile document-width regression + bounded tooltip primitive | ACTIVE |
| REG-025 | Responsive width declaration is invalid and silently falls back to an overflowing intrinsic width | mobile containers use valid `calc()` expressions and document width never exceeds viewport width | production build + desktop/mobile overflow workflow | ACTIVE |
| REG-026 | Tabs appear keyboard accessible but arrow-key focus and selection diverge | ArrowLeft/Right, Home, and End keep focus and selected tab synchronized | desktop/mobile tab workflow | ACTIVE |
| REG-027 | Dialog or drawer opens without a reliable close path | labelled overlays close through their control and Escape without trapping the route | desktop/mobile overlay workflow | ACTIVE |
| REG-028 | Handoff describes an old slice or obsolete visible test | handoff reads the active slice contract and maps changed files to current visible surfaces | handoff generator + Job Summary | ACTIVE |
| REG-029 | Catalogue control implies a production action that does not exist | fixtures state that they do not upload, persist, authorize, pay, or modify production data | catalogue copy assertions/review + future action integration tests | ACTIVE/PARTIAL |

## Status meanings

- **ACTIVE:** protection exists and must pass the applicable full gate.
- **PARTIAL:** a public/foundation version exists, but future role-specific or durable-workflow coverage is still required.
- **BLOCKED:** required future protection cannot exist until the corresponding production layer is implemented; install it in that build slice before acceptance.

## Adding regressions

For every confirmed serious defect, add a new permanent ID with the root cause, affected role/workflow, expected behavior, automated test path/name, any final manual spot-check, date, and status. A green test obtained by skipping or weakening coverage is not valid regression protection.
