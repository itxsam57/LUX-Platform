# LUX Platform — Project Test Matrix

Statuses: **PASS**, **FAIL**, **PENDING**, **PARTIAL**, **BLOCKED**, **NOT APPLICABLE**. A required FAIL/BLOCKED result prevents readiness for the affected feature. A PENDING exact-head gate must become green before owner acceptance is requested.

## Candidate and acceptance state

- **Accepted baseline:** Slices 0–3 on `main` at `21135e5895390294ba503df3d2dfba1a3dc6795e`.
- **Active cumulative candidate:** Slice 10 — Fan Funding Dashboard and Badges, Draft PR #6 (`feature/slices-4-10-marketplace-core`).
- **Feature-automation checkpoint:** `be96c14fccc49ecae0987ccb5a908c71c32a3762`, Engineering Gate `33478175270` (#686).
- **Checkpoint result:** PASS — 270-file repository/secret checks, 142 unit tests, 1 integration test, 509 pgTAP/RLS assertions across 20 files, production build, 79 passed / 1 skipped desktop-mobile browser workflows.
- **Task 5 state:** PENDING exact-head reconciliation gate after Slice 10 foundation/docs/closure metadata are committed.
- **Owner acceptance:** PENDING combined Slices 4–10 browser handoff; not yet requested.
- **Merge:** prohibited until owner acceptance; PR #6 remains Draft/unmerged.

## Permanent engineering gate

| ID | Check | Required | Current status |
|---|---|---:|---|
| ENG-001 | Repository integrity / required files | Yes | PASS at #686; final closure head PENDING |
| ENG-002 | Generated/private evidence excluded from Git | Yes | PASS |
| ENG-003 | Tracked-file secret scan | Yes | PASS at #686 — 270 files |
| ENG-004 | Frozen dependency install | Yes | PASS |
| ENG-005 | ESLint zero warnings | Yes | PASS |
| ENG-006 | Strict TypeScript | Yes | PASS |
| ENG-007 | Unit/domain tests and scoped coverage | Yes | PASS — 142 tests; 97.57/85.95/100 coverage at #686 |
| ENG-008 | Health/API contract | Yes | PASS functionally; Slice 10 label exact-head gate PENDING |
| ENG-009 | Production dependency audit | Yes | PASS — no known vulnerabilities at #686 |
| ENG-010 | Runtime dependency compatibility | Yes | PASS |
| ENG-011 | Optimized production build | Yes | PASS at #686; final closure head PENDING |
| ENG-012 | Supabase database/RLS suite | Yes | PASS — 20 files / 509 assertions |
| ENG-013 | Chromium desktop workflows | Yes | PASS at #686; final closure head PENDING |
| ENG-014 | Chromium mobile workflows | Yes | PASS at #686; final closure head PENDING |
| ENG-015 | Master gate fails closed / cheap-before-expensive ordering | Yes | PASS |
| ENG-016 | Change-aware verification + truthful handoff | Yes | PENDING final Slice 10 handoff generation |
| ENG-017 | GitHub isolated Supabase + failure evidence + Job Summary | Yes | PASS at #686; final closure head PENDING |

## Foundation and accepted Slices 1–3 regressions

| ID | Boundary | Status |
|---|---|---|
| FND-001 | Home/build identity, route synchronization and history | PASS functionally; Slice 10 identity gate PENDING |
| FND-002 | Back/Forward/refresh preserves trusted state | PASS |
| FND-003 | `/health` reports active build slice | PASS functionally; Slice 10 identity gate PENDING |
| FND-004 | Controlled 404/recovery | PASS |
| FND-005 | Responsive no-overflow safety | PASS |
| FND-006 | Keyboard-accessible primary navigation | PASS |
| UI-001..005 | Design-system families, tabs, overlays, shell and controlled states | PASS |
| AUTH-001..009 | Signup/recovery/session/adult/workspace/role/staff boundaries | PASS; production adult provider remains PARTIAL/fail-closed |
| PRO-001..006 | Profile persistence, media, projections and visibility | PASS |
| PRV-001..004 | Supporter privacy, export, deletion and removable privacy rights | PASS |
| NOT-001 | Recipient-only/block-aware notifications | PASS |

## Slice 4 — Feed and discovery

| ID | Check | Status |
|---|---|---|
| DSC-001 | Privacy/block filtering before discovery ranking | PASS |
| DSC-002 | Deterministic explainable/diversity-capped ranking | PASS |
| DSC-003 | Explicit privacy-safe discovery projection | PASS |
| DSC-004 | Feed/explore/search protected routes | PASS |
| DSC-005 | Following contains only eligible followed profiles | PASS |

## Slice 5 — Creator and depicted-person verification

| ID | Check | Status |
|---|---|---|
| VER-001 | Participant cannot self-promote verification | PASS |
| VER-002 | Reviewer queue and transitions restricted | PASS |
| VER-003 | V3 requires current V2 + performer prerequisites | PASS |
| VER-004 | Public badge exposes normalized safe state only | PASS |
| VER-005 | Evidence/provider refs/internal UUIDs remain private | PASS |
| VER-006 | Revoke/expiry removes current state | PASS |
| VER-007 | Synthetic verification dev/CI only; production fail-closed | PASS/PARTIAL |
| VER-008 | Reviewer workflow synchronizes durable committed state | PASS |
| VER-009 | Super-admin staff workspace remains isolated | PASS |

## Slice 6 — Crowd Demand Board

| ID | Check | Status |
|---|---|---|
| DEM-001 | Validated demand + opaque IDs + public-safe projection | PASS |
| DEM-002 | One idempotent support edge per account | PASS |
| DEM-003 | Suggested creator is not implied committed | PASS |
| DEM-004 | Decline stays private; explicit interest may be public | PASS |
| DEM-005 | Block/privacy/expiry checks fail closed | PASS |
| DEM-006 | Creator-only demand conversion provenance | PASS |
| DEM-007 | No fabricated project/conversion before atomic Slice 7 creation | PASS |
| DEM-008 | Demand routes refresh-safe/responsive | PASS |

## Slice 7 — Projects and collaboration invitations

| ID | Check | Status |
|---|---|---|
| PRJ-001 | Interested demand converts atomically to creator-owned project with provenance | PASS |
| PRJ-002 | Versioned draft rejects stale overwrite | PASS |
| PRJ-003 | Private brief and internal identifiers remain private | PASS |
| INV-001 | Only authorized project creator sends/withdraws invitations | PASS |
| INV-002 | Interested/considering/negotiating/accepted/declined states are durable | PASS |
| INV-003 | Collaboration acceptance does not create legal consent | PASS |
| INV-004 | Agency communication authority is explicit and cannot substitute for performer action | PASS |

## Slice 8 — Contracts, consent and boundaries

| ID | Check | Status |
|---|---|---|
| CON-001 | Exact immutable versioned terms are accepted personally | PASS |
| CON-002 | Material term change invalidates/reopens affected acceptance | PASS |
| CON-003 | Depicted-person consent requires the verified performer | PASS |
| CON-004 | Agency cannot execute performer consent | PASS |
| CON-005 | Contract lock requires all current acceptance/consent gates | PASS |
| CON-006 | Terms/consent private projection exposes no forbidden evidence | PASS |

## Slice 9 — Campaign publishing and pre-book

| ID | Check | Status |
|---|---|---|
| CMP-001 | Campaign draft persists exact target/deadline/delivery/refund/change terms | PASS |
| CMP-002 | Publication fails closed until contract/verification/funding restrictions permit it | PASS |
| CMP-003 | Public campaign is an allowlisted truthful projection | PASS |
| CMP-004 | Locked project exposes real continuation to campaign publishing | PASS at #686 cumulative journey |
| PBK-001 | Public campaign exposes real continuation to pre-book | PASS at #686 cumulative journey |
| PBK-002 | Pre-book is explicitly not a payment/card authorization | PASS |
| PBK-003 | Duplicate pre-book is idempotent and creates one commitment | PASS |

## Slice 10 — Funding dashboard, badges and payment state

| ID | Check | Status |
|---|---|---|
| PAY-001 | Provider-neutral sandbox adapter uses opaque deterministic refs and retains no raw card data | PASS |
| PAY-002 | Legal payment-state transitions and idempotency are enforced | PASS |
| PAY-003 | Webhook/event replay is verified/deduplicated | PASS |
| PAY-004 | Production payment configuration fails closed without approved provider | PASS/PARTIAL |
| FNDG-001 | Signed-in supporter sees only own safe funding projection | PASS |
| FNDG-002 | Processor refs/internal UUIDs/private brief do not leak | PASS |
| FNDG-003 | Active/Successful/Refunded/All states are truthful | PASS |
| FNDG-004 | Badge visibility/privacy persists | PASS |
| FNDG-005 | Material change compares old/new terms and requires explicit acceptance | PASS |
| FNDG-006 | Refund intent/request is explicit and idempotent | PASS |
| FNDG-007 | Sandbox state is labeled non-production | PASS |
| XSL-001 | Full discovery→funding creator-controlled journey passes desktop/mobile | PASS — Gate #686 |

## Security matrix

| ID | Boundary | Status | Scope |
|---|---|---|---|
| SEC-001 | Secret/private-key detection | PASS | permanent |
| SEC-002 | Generated browser evidence excluded from Git | PASS | permanent |
| SEC-003 | Dependency/runtime security | PASS | permanent |
| SEC-004 | Authentication/session security | PASS | Slice 2+ |
| SEC-005 | Role/workspace isolation | PASS | Slice 2+ |
| SEC-006 | Database constraints/RLS | PASS | cumulative through Slice 10 |
| SEC-007 | Profile-media privacy | PASS | Slice 3+ |
| SEC-008 | Adult provider boundary | PASS/PARTIAL | production adapter deferred |
| SEC-009 | Identity/performer evidence boundary | PASS/PARTIAL | synthetic dev/CI; production adapter deferred |
| SEC-010 | Payment/webhook/idempotency | PASS/PARTIAL | sandbox/dev-CI implemented; production processor deferred |
| SEC-011 | Consent/release/payout invariants | PARTIAL | contracts/consent active; release/ledger/payout remain Slices 13–14 |

## Deferred product layers

Only Slices 11–17 remain outside this candidate: production workspace/uploads, delivery/platform review, secure release/fan library, double-entry ledger/revenue splits/payouts, copyright operations, full agency workspace and administration/launch hardening.

## Readiness rule

The Slices 4–10 feature set has a green cumulative feature checkpoint at `be96c14f...` / Gate #686. The repository is **not yet owner-ready** until the Task 5 reconciliation head itself passes the complete Engineering Gate and generates the combined Slice 10 owner handoff. Owner acceptance remains false and PR #6 must remain Draft/unmerged until that handoff is completed.
