# Slice 7 Project Drafts and Collaboration Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned project drafts, atomic demand conversion and collaboration invitation workflows without prematurely granting legal consent.

**Architecture:** Project drafts use optimistic concurrency with revision numbers and separate public synopsis/private production brief projections. Invitation acceptance means willingness to enter contracting, never final legal consent; material proposal changes invalidate stale acceptance.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9 strict, Supabase Postgres/RLS/RPC, Vitest, pgTAP, Playwright Chromium desktop/mobile.

**Spec:** `docs/superpowers/specs/2026-08-25-slices-4-10-marketplace-core-design.md`

## Global Constraints

- Preserve Slices 0–6 and existing privacy/role boundaries.
- Only authorized creator/producer resource owners may edit project drafts.
- Public synopsis is a separate allowlisted projection; private briefs/negotiation fields never leak to public surfaces.
- Stale revision updates fail with an explicit conflict; no silent overwrite.
- Invitation acceptance cannot be interpreted as contract lock or depicted-person consent.
- Agencies may act only within managed communication authority and must be visibly attributed.
- Manual owner acceptance remains deferred to Slice 10.

---

### Task 1: Project draft schema and optimistic versioning

**Files:**
- Create: `apps/web/src/lib/projects/policy.ts`
- Create: `apps/web/src/lib/projects/policy.test.ts`
- Create: `supabase/migrations/20260825070100_slice_7_projects.sql`
- Create: `supabase/tests/0010_slice_7_projects.sql`

**Interfaces:**
- Tables: `projects`, `project_versions`, `project_participant_requirements`.
- RPCs: `create_project_draft`, `update_project_draft(expected_revision)`, `convert_demand_to_project`.

- [ ] Write failing unit + pgTAP for ownership, stale-revision rejection, public/private field separation, demand provenance, one-time conversion and creator-only conversion.
- [ ] Run targeted unit + DB; verify RED.
- [ ] Implement pure validation and database versioning/RLS/RPC/audit transitions.
- [ ] Re-run unit + complete DB suite until GREEN.
- [ ] Commit `feat(projects): add versioned project drafts`.

### Task 2: Collaboration invitation state machine

**Files:**
- Create: `apps/web/src/lib/invitations/policy.ts`
- Create: `apps/web/src/lib/invitations/policy.test.ts`
- Create: `supabase/migrations/20260825070200_slice_7_invitations.sql`
- Create: `supabase/tests/0011_slice_7_invitations.sql`

**Interfaces:**
- States: `sent`, `viewed`, `interested`, `considering`, `negotiating`, `accepted`, `declined`, `expired`, `withdrawn`.
- RPCs: `send_project_invitation`, `respond_project_invitation`, `propose_invitation_change`, `withdraw_project_invitation`.

- [ ] Write RED tests for recipient-only private details, quiet decline, agency attribution, stale proposal invalidation, withdrawal and no invitation-acceptance→contract-consent shortcut.
- [ ] Implement state machine with audit/idempotency.
- [ ] Run full unit/DB GREEN.
- [ ] Commit `feat(invitations): add collaboration invitation workflow`.

### Task 3: Studio project and invitation UI

**Files:**
- Create: `apps/web/src/app/studio/projects/page.tsx`
- Create: `apps/web/src/app/studio/projects/new/page.tsx`
- Create: `apps/web/src/app/studio/projects/[publicId]/page.tsx`
- Create: `apps/web/src/app/studio/invitations/page.tsx`
- Create: `apps/web/src/app/studio/invitations/[publicId]/page.tsx`
- Create: `apps/web/src/components/projects/project-editor.tsx`
- Create: `apps/web/src/components/invitations/invitation-panel.tsx`
- Create: `apps/web/src/app/studio.css`
- Test: `apps/web/tests/e2e/projects-invitations.spec.ts`

- [ ] Add failing Playwright for draft creation/edit persistence, stale-tab conflict, demand conversion, invitation lifecycle, quiet decline, Back/Forward/refresh and mobile overflow.
- [ ] Run affected Playwright and verify RED.
- [ ] Implement real persisted pages/actions with server-confirmed revisions.
- [ ] Re-run desktop/mobile until GREEN.
- [ ] Commit `feat(studio): add project and invitation surfaces`.

### Task 4: Slice 7 gate

- [ ] Reconcile Foundation/test matrix/regression register/Governor for Slice 7.
- [ ] Run cumulative quick/DB/build/browser/full verification.
- [ ] Require green exact-head Engineering Gate.
- [ ] Record exact checkpoint before Slice 8.