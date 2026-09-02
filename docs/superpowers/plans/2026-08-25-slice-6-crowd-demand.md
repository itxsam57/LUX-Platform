# Slice 6 Crowd Demand Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public-safe, creator-autonomy-preserving crowd demand creation, support, creator response and project-conversion provenance.

**Architecture:** Demand is a distinct state machine and never implies creator commitment. Support is unique/idempotent; creator decline stays private; only an eligible creator may convert an interested demand into a creator-owned project draft.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9 strict, Supabase Postgres/RLS/RPC, Vitest, pgTAP, Playwright Chromium desktop/mobile.

**Spec:** `docs/superpowers/specs/2026-08-25-slices-4-10-marketplace-core-design.md`

## Global Constraints

- Preserve accepted Slices 0–5 and all creator-autonomy/privacy rules.
- Public wording for referenced creators is suggested/requested until the creator explicitly marks interest.
- Fan support cannot cause creator interest, project conversion or contract state.
- Creator decline/ignore reason/status is not exposed publicly.
- One account gets at most one active support edge per demand; public attribution may be anonymous while integrity remains account-bound internally.
- Block/privacy/policy suppression applies to list/detail/support/creator response.
- Manual owner acceptance stays deferred until Slice 10.

---

### Task 1: Demand domain and database state machine

**Files:**
- Create: `apps/web/src/lib/demand/policy.ts`
- Create: `apps/web/src/lib/demand/policy.test.ts`
- Create: `supabase/migrations/20260825060100_slice_6_demand.sql`
- Create: `supabase/tests/0009_slice_6_demand.sql`

**Interfaces:**
- Demand states: `open`, `creator_interested`, `converted`, `expired`, `closed`.
- RPCs: `create_demand`, `set_demand_support`, `respond_to_demand`, `get_demand`, `list_demands`.

- [ ] Write failing unit + pgTAP tests for field validation, public IDs, one-support-per-account, anonymous/public support projection, suggested-creator behavior, quiet decline privacy, block suppression and no fan-controlled conversion.
- [ ] Run targeted unit and DB suite; verify RED.
- [ ] Implement pure demand validation plus schema/RLS/RPC/audit transitions.
- [ ] Re-run unit + complete DB suite until GREEN.
- [ ] Commit `feat(demand): add crowd demand state machine`.

### Task 2: Demand Board and creator response UI

**Files:**
- Create: `apps/web/src/app/app/demand/page.tsx`
- Create: `apps/web/src/app/app/demand/new/page.tsx`
- Create: `apps/web/src/app/demand/[publicId]/page.tsx`
- Create: `apps/web/src/app/workspace/creator/demand/page.tsx`
- Create: `apps/web/src/components/demand/demand-card.tsx`
- Create: `apps/web/src/components/demand/demand-form.tsx`
- Create: `apps/web/src/app/demand.css`
- Test: `apps/web/tests/e2e/demand.spec.ts`

- [ ] Add failing Playwright for create/support/support-idempotency/suggested creator/private decline/creator interest/refresh/mobile overflow.
- [ ] Run affected Playwright and verify RED.
- [ ] Implement routes/components/actions using constrained RPCs only.
- [ ] Re-run desktop/mobile and require GREEN.
- [ ] Commit `feat(demand): add demand board and creator response UI`.

### Task 3: Demand-to-project conversion seam

**Files:**
- Create: `apps/web/src/lib/demand/conversion.ts`
- Create: `apps/web/src/lib/demand/conversion.test.ts`
- Create: `supabase/migrations/20260825060200_slice_6_demand_conversion_boundary.sql`

**Interfaces:**
- `canConvertDemandToProject` pure policy.
- Database precursor verifies creator interest and ownership; Slice 7 adds the atomic project creation using the same validated demand provenance.

- [ ] Write RED tests proving only the interested eligible creator may convert and the original fan gains no edit/control rights.
- [ ] Implement the conversion eligibility boundary without fabricating a project before Slice 7 tables exist.
- [ ] Verify unit + DB GREEN.
- [ ] Commit `feat(demand): harden project conversion eligibility`.

### Task 4: Slice 6 gate

**Files:**
- Modify Foundation, test matrix, regression register and Governor state.

- [ ] Add permanent demand/autonomy/idempotency/privacy regressions.
- [ ] Run cumulative quick/DB/build/browser/full gate.
- [ ] Require green exact-head Engineering Gate.
- [ ] Record checkpoint and only then begin Slice 7.