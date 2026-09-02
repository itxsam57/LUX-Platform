# Slice 5 Creator and Depicted-Person Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-neutral V2 identity and V3 depicted-performer verification with private evidence boundaries and production fail-closed behavior.

**Architecture:** Persist normalized verification state in private/RLS-protected tables. Provider adapters live behind a typed server-only interface; CI uses a deterministic synthetic adapter and production requires explicit configuration.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9 strict, Supabase Postgres/RLS/RPC, Vitest, pgTAP, Playwright Chromium desktop/mobile.

**Spec:** `docs/superpowers/specs/2026-08-25-slices-4-10-marketplace-core-design.md`

## Global Constraints

- Preserve `docs/product/00_CANONICAL_PROJECT_LOCK.md` and all accepted Slice 0–4 regressions.
- Development synthetic verification may prove workflow only; it must never be labeled production identity verification.
- Production must fail closed when an approved identity provider is not configured.
- Legal identity/evidence/provider payloads are private and never part of public profile/discovery projections.
- Verification promotion/revocation/expiry is server/database-owned; users cannot self-promote.
- V3 requires V2 plus a performer record, current liveness/result, payout-ownership state and consent-education acknowledgement.
- Product-owner manual acceptance is deferred to the combined Slice 10 handoff.

---

### Task 1: Verification domain and provider adapter contract

**Files:**
- Create: `apps/web/src/lib/verification/types.ts`
- Create: `apps/web/src/lib/verification/policy.ts`
- Create: `apps/web/src/lib/verification/policy.test.ts`
- Create: `apps/web/src/lib/verification/adapter.ts`
- Create: `apps/web/src/lib/verification/synthetic-adapter.ts`
- Modify: `apps/web/src/lib/supabase/env.ts`

**Interfaces:**
- `VerificationLevel = 'v1' | 'v2' | 'v3'`.
- `VerificationStatus = 'not_started' | 'pending' | 'needs_review' | 'verified' | 'rejected' | 'expired' | 'revoked'`.
- Adapter methods: `createSession`, `getResult`, `verifyCallback`, `health`.

- [ ] Write failing unit tests for legal level transitions, expiry/revocation, V3 prerequisites and provider-required production behavior.
- [ ] Run targeted Vitest and verify RED.
- [ ] Implement minimal types, pure policy and deterministic synthetic adapter.
- [ ] Re-run targeted + full unit suite until GREEN.
- [ ] Commit `feat(verification): add provider-neutral verification policy`.

### Task 2: Verification database boundary

**Files:**
- Create: `supabase/migrations/20260825050100_slice_5_verification.sql`
- Create: `supabase/tests/0008_slice_5_verification.sql`

**Interfaces:**
- Tables: `verification_subjects`, `verification_sessions`, `performer_records`, `consent_education_acknowledgements`.
- RPCs: `start_verification`, `apply_verification_result`, `get_my_verification_summary`.
- Reviewer transition RPC restricted to authorized staff/super-admin scope.

- [ ] Write failing pgTAP for direct self-promotion denial, public evidence denial, reviewer scope, expiry blocking and complete V3 requirements.
- [ ] Run DB suite and verify RED.
- [ ] Implement schema, RLS, constrained RPC transitions and audit events.
- [ ] Run full DB suite and require GREEN.
- [ ] Commit `feat(verification): persist V2 V3 verification boundaries`.

### Task 3: Verification user/reviewer surfaces

**Files:**
- Create: `apps/web/src/app/settings/verification/page.tsx`
- Create: `apps/web/src/app/settings/verification/actions.ts`
- Create: `apps/web/src/components/verification/verification-panel.tsx`
- Create: `apps/web/src/app/verification.css`
- Modify: `apps/web/src/components/workspace/workspace-shell.tsx`
- Test: `apps/web/tests/e2e/verification.spec.ts`

- [ ] Add failing Playwright for synthetic V2/V3, public badge privacy, expiry/revocation and unauthorized reviewer denial.
- [ ] Run affected Playwright and verify RED.
- [ ] Implement truthful test-mode UI and server actions through the constrained RPC/adapter boundary.
- [ ] Re-run desktop/mobile and require GREEN.
- [ ] Commit `feat(verification): add identity and performer verification workflow`.

### Task 4: Slice 5 gate

**Files:**
- Modify: `apps/web/src/lib/foundation.ts`
- Modify: `apps/web/src/lib/foundation.test.ts`
- Modify: `docs/engineering/PROJECT-TEST-MATRIX.md`
- Modify: `docs/engineering/REGRESSION-REGISTER.md`
- Modify: `.engineering/CONTINUATION.json`

- [ ] Add permanent V2/V3 privacy, expiry, reviewer-scope and production-provider regressions.
- [ ] Run cumulative quick/DB/build/browser/full verification.
- [ ] Require green Engineering Gate on exact Slice 5 checkpoint.
- [ ] Record exact head/run before Slice 6.