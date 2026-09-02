# Slice 4 Feed and Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated feed, explore and search surfaces backed by deterministic, privacy-safe discovery read models.

**Architecture:** Keep discovery as read-heavy database RPCs plus small pure ranking/filter helpers. Slice 4 initially indexes only profiles; the same read model expands to demands/projects/campaigns when later slices create externally visible objects.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9 strict, Supabase Postgres/RLS/RPC, Vitest, pgTAP, Playwright Chromium desktop/mobile.

**Spec:** `docs/superpowers/specs/2026-08-25-slices-4-10-marketplace-core-design.md`

## Global Constraints

- Preserve `docs/product/00_CANONICAL_PROJECT_LOCK.md`.
- Use only `feature/slices-4-10-marketplace-core`; never write feature code directly to `main`.
- Write a failing unit/pgTAP/Playwright test before production behavior.
- Durable multi-party/high-risk state changes use constrained RPC/database transitions, not direct client table mutation.
- Every public projection excludes internal UUIDs, legal identity/evidence, provider transaction identifiers, and private negotiation fields.
- Every durable write rechecks role, relationship, state, required verification and risk/policy server-side.
- Existing Slice 0–3 tests remain green.
- After implementation run `pnpm verify:quick`, `pnpm test:database`, `pnpm build`, affected desktop/mobile Playwright, then the full Engineering Gate.
- Do not begin Slice 5 until the exact Slice 4 checkpoint gate is green.
- Product-owner manual acceptance is intentionally deferred until the combined Slice 10 handoff.

---

### Task 1: Discovery schema and privacy-safe read model

**Files:**
- Create: `supabase/migrations/20260825040100_slice_4_discovery.sql`
- Create: `supabase/tests/0007_slice_4_discovery.sql`

**Interfaces:**
- Produces RPC `public.get_discovery_feed(feed_mode text, page_size integer, page_cursor timestamptz)`.
- Produces RPC `public.search_discovery(search_query text, page_size integer)`.
- Produces `discovery_interests`, `account_interests`, `hidden_topics`.

- [ ] **Step 1: Write failing pgTAP assertions** for RLS, block/private/unlisted suppression, no UUID/email projection, cursor stability and invalid page-size rejection.
- [ ] **Step 2: Run** `pnpm test:database` and confirm RED because the Slice 4 objects do not exist.
- [ ] **Step 3: Implement the migration** with constrained grants, RLS and security-definer RPCs using existing `profiles`, `profile_follows`, `profile_blocks` and current-session/adult checks.
- [ ] **Step 4: Run** `pnpm test:database`; require all Slice 0–4 database assertions green.
- [ ] **Step 5: Commit** migration + pgTAP as `feat(discovery): add privacy-safe feed read model`.

### Task 2: Deterministic ranking policy

**Files:**
- Create: `apps/web/src/lib/discovery/ranking.ts`
- Create: `apps/web/src/lib/discovery/ranking.test.ts`
- Create: `apps/web/src/lib/discovery/types.ts`

**Interfaces:**
- `rankDiscoveryCandidates(candidates, context): DiscoveryCandidate[]`.
- `applyCreatorDiversityCap(candidates, maxPerCreator): DiscoveryCandidate[]`.

- [ ] Write failing Vitest tests proving freshness/followed/interest weights are deterministic, blocked/hidden candidates are absent before scoring, ties are stable, and diversity cap works.
- [ ] Run the targeted unit test and verify RED.
- [ ] Implement minimal pure ranking helpers with named constants and no ML dependency.
- [ ] Re-run targeted + full unit suite until GREEN.
- [ ] Commit as `feat(discovery): add deterministic ranking policy`.

### Task 3: Feed/explore/search UI

**Files:**
- Create: `apps/web/src/app/app/feed/page.tsx`
- Create: `apps/web/src/app/app/explore/page.tsx`
- Create: `apps/web/src/app/app/search/page.tsx`
- Create: `apps/web/src/components/discovery/discovery-card.tsx`
- Create: `apps/web/src/components/discovery/feed-tabs.tsx`
- Create: `apps/web/src/app/discovery.css`
- Modify: `apps/web/src/components/workspace/workspace-shell.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Test: `apps/web/tests/e2e/discovery.spec.ts`

- [ ] Add failing Playwright cases for Following/For You, explore, search, block suppression, Back/Forward/refresh and mobile overflow.
- [ ] Run affected Playwright and verify RED because routes are absent.
- [ ] Implement pages/components/server reads using existing Supabase server client and shared shell/primitives.
- [ ] Re-run desktop/mobile discovery tests and fix product defects only.
- [ ] Commit as `feat(discovery): add feed explore and search surfaces`.

### Task 4: Slice 4 gate and evidence

**Files:**
- Modify: `apps/web/src/lib/foundation.ts`
- Modify: `apps/web/src/lib/foundation.test.ts`
- Modify: `docs/engineering/PROJECT-TEST-MATRIX.md`
- Modify: `docs/engineering/REGRESSION-REGISTER.md`
- Modify: `.engineering/CONTINUATION.json`

- [ ] Update active build slice to 4 and add permanent discovery regressions.
- [ ] Run `pnpm verify:quick`, `pnpm test:database`, `pnpm build`, desktop/mobile discovery tests.
- [ ] Push branch and require a green GitHub Engineering Gate on the exact Slice 4 checkpoint head.
- [ ] Record exact SHA/run ID in Governor state before Slice 5.