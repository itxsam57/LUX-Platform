# Slice 10 Fan Funding Dashboard and Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add truthful fan funding lifecycle dashboard, badges/privacy, material-change/refund workflow and provider-neutral payment adapter boundary.

**Architecture:** Funding dashboard reads durable commitment/payment state. CI uses a deterministic sandbox payment adapter; production fails closed without approved configuration. Slice 14 remains owner of double-entry ledger, revenue splits and payouts.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9 strict, Supabase Postgres/RLS/RPC, Vitest, pgTAP, Playwright Chromium desktop/mobile.

**Spec:** `docs/superpowers/specs/2026-08-25-slices-4-10-marketplace-core-design.md`

## Global Constraints

- Preserve accepted Slices 0–9.
- Never store raw card/PAN/CVV data; only opaque sandbox/provider references.
- Sandbox payment mode must be labeled as such and may not be described as real processor revenue.
- Production payment actions fail closed without an approved configured provider.
- Webhook/event writes are authenticated/verified by adapter and idempotent.
- Funding dashboard is owner-only; processor IDs and internal UUIDs never leak to UI/public/downloadable projections.
- Refund/material-change actions are explicit and idempotent.
- Do not introduce Slice 14 ledger/payout semantics here.
- After final automated acceptance generate one combined owner test pack for Slices 4–10 and keep PR unmerged until owner passes it.

---

### Task 1: Payment adapter contract and deterministic sandbox adapter

**Files:**
- Create: `apps/web/src/lib/payments/adapter.ts`
- Create: `apps/web/src/lib/payments/types.ts`
- Create: `apps/web/src/lib/payments/sandbox-adapter.ts`
- Create: `apps/web/src/lib/payments/sandbox-adapter.test.ts`
- Modify: `apps/web/src/lib/supabase/env.ts`

**Interfaces:**
- `createCustomer`
- `tokenizePaymentMethod`
- `authorizeOrCharge`
- `capture`
- `refund`
- `verifyWebhook`
- `getTransaction`

- [ ] Write failing unit tests for idempotent authorization/refund, deterministic opaque references, no raw card retention, signed synthetic webhook replay and production fail-closed configuration.
- [ ] Run targeted unit test and verify RED.
- [ ] Implement typed adapter + sandbox implementation.
- [ ] Re-run targeted + full unit suite until GREEN.
- [ ] Commit `feat(payments): add provider-neutral sandbox payment adapter`.

### Task 2: Funding/payment persistence and transition safety

**Files:**
- Create: `supabase/migrations/20260825100100_slice_10_funding_payments.sql`
- Create: `supabase/tests/0015_slice_10_funding_payments.sql`

**Interfaces:**
- Tables: `payment_transactions`, `payment_webhook_receipts`, `funding_change_requests`, `supporter_badges`.
- RPCs: `record_payment_transition`, `apply_payment_webhook`, `request_funding_refund`, `accept_changed_campaign_terms`, `set_supporter_badge`.

- [ ] Write failing pgTAP for processor-ref privacy, webhook dedupe, legal payment-state transitions, refund idempotency, owner-only funding reads and badge visibility.
- [ ] Run DB suite and verify RED.
- [ ] Implement constrained transition schema/RLS/RPC/audit.
- [ ] Re-run complete DB suite until GREEN.
- [ ] Commit `feat(funding): persist payment and supporter lifecycle`.

### Task 3: Funding dashboard, badges and changed-terms/refund UI

**Files:**
- Create: `apps/web/src/app/app/funding/page.tsx`
- Modify: `apps/web/src/app/app/funding/[publicId]/page.tsx`
- Create: `apps/web/src/components/funding/funding-card.tsx`
- Create: `apps/web/src/components/funding/funding-detail.tsx`
- Create: `apps/web/src/components/funding/supporter-badge.tsx`
- Create: `apps/web/src/components/funding/material-change-panel.tsx`
- Create: `apps/web/src/app/funding.css`
- Test: `apps/web/tests/e2e/funding-dashboard.spec.ts`

- [ ] Add failing Playwright for Active/Successful/Refunded/All, truthful empty future states, badge privacy, changed terms, refund, duplicate retry and processor-ID non-leakage.
- [ ] Run affected Playwright and verify RED.
- [ ] Implement owner-only dashboard/detail actions and components.
- [ ] Re-run desktop/mobile until GREEN.
- [ ] Commit `feat(funding): add fan funding dashboard and badges`.

### Task 4: Cross-slice marketplace journey automation

**Files:**
- Create: `apps/web/tests/e2e/marketplace-4-10-journey.spec.ts`
- Modify test utilities only where required; do not add product-only test shortcuts.

- [ ] Write the full failing journey: discovery → demand → creator interest → synthetic V2/V3 → demand conversion → project version → invitation → negotiation → consent → contract lock → campaign → pre-book → funding dashboard → changed terms/refund.
- [ ] Run desktop journey and verify RED only on missing integration seams.
- [ ] Implement missing real integration seams.
- [ ] Run desktop + mobile journey plus all earlier E2E until GREEN.
- [ ] Commit `test(marketplace): lock Slice 4 to 10 owner journey`.

### Task 5: Final Slice 10 gate and combined owner handoff

**Files:**
- Modify: `apps/web/src/lib/foundation.ts`
- Modify: `apps/web/src/lib/foundation.test.ts`
- Modify: `docs/engineering/PROJECT-PROFILE.md`
- Modify: `docs/engineering/PROJECT-TEST-MATRIX.md`
- Modify: `docs/engineering/REGRESSION-REGISTER.md`
- Create: `docs/engineering/10_SLICES_4_10_CLOSURE.md`
- Modify: `.engineering/CONTINUATION.json`
- Modify: `README.md`
- Modify: `docs/product/00_CANONICAL_PROJECT_LOCK.md` only to reconcile stale current-position wording, not constitution/scope.

- [ ] Reconcile stale accepted Slice 0–3 documentation and current Slice 10 candidate truthfully.
- [ ] Run the complete source gate: repository integrity, secret scan, lint, strict TypeScript, unit/API, dependency/runtime, full pgTAP/RLS, production build, all desktop/mobile Playwright and handoff generation.
- [ ] Push exact head and require green GitHub Engineering Gate.
- [ ] Generate one combined owner handoff only after all automation is green.
- [ ] Keep PR Draft/unmerged until owner completes the combined handoff.