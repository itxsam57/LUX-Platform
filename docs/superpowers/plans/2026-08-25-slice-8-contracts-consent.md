# Slice 8 Contracts Consent and Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable versioned project terms, personal depicted-performer consent and contract lock that cannot be bypassed.

**Architecture:** Terms and consent are database-owned immutable versioned records. Material changes create new versions and invalidate affected acceptances. Acceptance receipts bind the actor, exact version/hash and timestamp under current session/verification constraints.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9 strict, Supabase Postgres/RLS/RPC, Vitest, pgTAP, Playwright Chromium desktop/mobile.

**Spec:** `docs/superpowers/specs/2026-08-25-slices-4-10-marketplace-core-design.md`

## Global Constraints

- Preserve all accepted Slice 0–7 behavior.
- Depicted-person consent is personal to the verified performer; an agency/project owner can prepare/manage but cannot execute it.
- Material changes never mutate an accepted historical version; they create a new immutable version and reopen affected acceptance.
- Acceptance requires current auth/session, resource relationship, required V2/V3 verification, risk/policy eligibility and step-up confirmation.
- Contract lock is a constrained database transition requiring every mandatory acceptance/consent obligation for the funding version.
- Direct table mutation cannot create valid acceptance, consent or contract lock.
- Manual owner acceptance remains deferred to Slice 10.

---

### Task 1: Contract/consent policy and canonical version hash

**Files:**
- Create: `apps/web/src/lib/contracts/policy.ts`
- Create: `apps/web/src/lib/contracts/policy.test.ts`
- Create: `apps/web/src/lib/contracts/version-hash.ts`
- Create: `apps/web/src/lib/contracts/version-hash.test.ts`

**Interfaces:**
- `classifyProjectTermChange(previous, next): 'none' | 'non_material' | 'material'`.
- `hashContractVersion(canonicalTerms): string` with deterministic field ordering.
- `canAcceptTerms` and `canLockContract` pure guards.

- [ ] Write failing unit tests for role/boundary/collaborator/compensation/distribution/rights materiality, stable hashing, V2/V3 requirements, agency-not-performer rule and lock eligibility.
- [ ] Run targeted unit tests and verify RED.
- [ ] Implement minimal pure policy/hash helpers.
- [ ] Re-run targeted + full unit suite until GREEN.
- [ ] Commit `feat(contracts): add immutable terms and consent policy`.

### Task 2: Immutable contract/consent database state machine

**Files:**
- Create: `supabase/migrations/20260825080100_slice_8_contracts_consent.sql`
- Create: `supabase/tests/0012_slice_8_contracts_consent.sql`

**Interfaces:**
- Tables: `project_term_versions`, `participant_acceptances`, `depicted_person_consents`, `contract_lock_receipts`.
- RPCs: `publish_project_terms`, `accept_project_terms`, `record_depicted_consent`, `lock_project_contract`.

- [ ] Write failing pgTAP for direct-write denial, immutable versions, personal performer auth, agency denial, verification expiry/revocation, duplicate acceptance idempotency, material-change reopening and lock preconditions.
- [ ] Run DB and verify RED.
- [ ] Implement transaction-safe schema/RLS/RPC/audit transitions.
- [ ] Re-run complete DB suite until GREEN.
- [ ] Commit `feat(contracts): persist project terms consent and lock receipts`.

### Task 3: Terms comparison, consent and lock UI

**Files:**
- Create: `apps/web/src/app/studio/projects/[publicId]/terms/page.tsx`
- Create: `apps/web/src/app/studio/projects/[publicId]/terms/actions.ts`
- Create: `apps/web/src/components/contracts/terms-diff.tsx`
- Create: `apps/web/src/components/contracts/consent-panel.tsx`
- Create: `apps/web/src/app/contracts.css`
- Test: `apps/web/tests/e2e/contracts-consent.spec.ts`

- [ ] Add failing Playwright for exact version presentation, material diff, agency denial, performer own consent, expired verification denial, duplicate click and contract lock.
- [ ] Run affected Playwright and verify RED.
- [ ] Implement server actions/UI through constrained RPCs only.
- [ ] Re-run desktop/mobile until GREEN.
- [ ] Commit `feat(contracts): add negotiation consent and contract lock UI`.

### Task 4: Slice 8 gate

- [ ] Add permanent consent/contract attacks and material-change regressions to matrix/register.
- [ ] Run cumulative quick/DB/build/browser/full verification.
- [ ] Require green exact-head Engineering Gate and record checkpoint before Slice 9.