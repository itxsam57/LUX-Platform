# Slice 9 Campaign Publishing and Pre-booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish only eligible contract-locked projects as truthful public campaigns and create exact-version pre-book commitments.

**Architecture:** Campaign eligibility is a constrained database transition over project/verification/contract state. Public campaign counts/amounts derive only from actual eligible commitment/payment states, never display counters. Pre-booking binds the exact campaign-terms version and idempotency key.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9 strict, Supabase Postgres/RLS/RPC, Vitest, pgTAP, Playwright Chromium desktop/mobile.

**Spec:** `docs/superpowers/specs/2026-08-25-slices-4-10-marketplace-core-design.md`

## Global Constraints
- Preserve accepted Slices 0–8.
- Only contract-locked, eligible projects can publish a campaign.
- Current creator/producer verification and every required depicted participant V3 state are rechecked on publish.
- Public backer counts/funded amount are derived from real eligible funding records; no seeded/fake counters.
- Campaign copy clearly distinguishes guaranteed terms from optional/creator-controlled voting choices.
- No fake urgency/countdowns, hidden refund condition or public leakage of private collaborators/legal identity.
- Pre-book records bind the exact campaign-terms version and are idempotent.
- Manual owner acceptance remains deferred to Slice 10.

### Task 1: Campaign eligibility policy and schema
**Files:**
- Create: `apps/web/src/lib/campaigns/policy.ts`
- Create: `apps/web/src/lib/campaigns/policy.test.ts`
- Create: `supabase/migrations/20260825090100_slice_9_campaigns.sql`
- Create: `supabase/tests/0014_slice_9_campaigns.test.sql`

**Interfaces:**
- Tables: `campaigns`, `campaign_term_versions`, `campaign_tiers`, `campaign_choices`.
- States: `draft`, `review_ready`, `published`, `funding_closed`, `cancelled`.
- RPCs: `save_campaign_draft`, `submit_campaign_for_publish`, `publish_campaign`, `get_public_campaign`.

- [ ] Write failing unit + pgTAP for contract-lock/V3/current-verification/restriction/payment-environment eligibility, public-safe projection, deadline/target validation and unauthorized publish denial.
- [ ] Run targeted unit + DB and verify RED.
- [ ] Implement pure eligibility policy plus schema/RLS/RPC/audit transitions.
- [ ] Re-run unit + full DB until GREEN.
- [ ] Commit `feat(campaigns): add campaign eligibility and publishing`.

### Task 2: Pre-book commitment boundary
**Files:**
- Create: `apps/web/src/lib/funding/prebook-policy.ts`
- Create: `apps/web/src/lib/funding/prebook-policy.test.ts`
- Create: `supabase/migrations/20260825090200_slice_9_prebook.sql`
- Create: `supabase/tests/0015_slice_9_prebook.test.sql`

**Interfaces:**
- Table: `funding_commitments`.
- RPC: `create_prebook(campaign_public_id, amount, supporter_visibility, badge_choice, idempotency_key)`.

- [ ] Write RED tests for duplicate idempotency key, exact campaign version binding, supporter privacy, closed/expired campaign denial, amount bounds and derived totals.
- [ ] Implement pure policy + database boundary.
- [ ] Re-run unit/DB GREEN.
- [ ] Commit `feat(funding): add exact-version prebook commitments`.

### Task 3: Campaign editor/public page/pre-book UI
**Files:**
- Create: `apps/web/src/app/studio/projects/[publicId]/campaign/page.tsx`
- Create: `apps/web/src/app/studio/projects/[publicId]/campaign/actions.ts`
- Create: `apps/web/src/app/p/[publicId]/page.tsx`
- Create: `apps/web/src/app/app/funding/[publicId]/page.tsx`
- Create: `apps/web/src/components/campaigns/campaign-editor.tsx`
- Create: `apps/web/src/components/campaigns/campaign-public-card.tsx`
- Create: `apps/web/src/components/funding/prebook-form.tsx`
- Create: `apps/web/src/app/campaigns.css`
- Test: `apps/web/tests/e2e/campaign-prebook.spec.ts`

- [ ] Add failing Playwright for ineligible publish denial, public-safe campaign projection, exact action wording, duplicate click, supporter privacy, refresh/back-forward and mobile overflow.
- [ ] Run affected Playwright and verify RED.
- [ ] Implement routes/components/actions through constrained RPCs.
- [ ] Re-run desktop/mobile until GREEN.
- [ ] Commit `feat(campaigns): add publishing and prebook surfaces`.

### Task 4: Slice 9 gate
- [ ] Reconcile Foundation/test matrix/register/Governor.
- [ ] Run cumulative quick/DB/build/browser/full verification.
- [ ] Require green exact-head Engineering Gate and record checkpoint before Slice 10.