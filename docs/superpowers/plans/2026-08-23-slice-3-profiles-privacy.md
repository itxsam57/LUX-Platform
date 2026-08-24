# Slice 3 Profiles and Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver privacy-first public profiles, owner profile/privacy controls, follow/block/mute, supporter anonymity, notifications, safe media, account export, and deletion requests without leaking private account data.

**Architecture:** Extend the existing Supabase Auth + Postgres RLS + Next.js server-action model. Public reads use explicit allowlisted RPC projections; durable writes use constrained RPCs. Profile media stays in a private Supabase Storage bucket and is served through guarded handle-based routes after server-side Sharp sanitization.

**Tech Stack:** Next.js 15.5.21, React 19.1.1, TypeScript 5.9.2, Supabase/Postgres/RLS, Sharp 0.35.0, Vitest, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-23-slice-3-profiles-privacy-design.md`

## Global Constraints

- Never expose email, auth metadata, age evidence, legal identity, payment data, private settings, or internal user UUIDs in public profile payloads/URLs.
- Public media URLs are `/profile-media/[handle]/[kind]`; storage remains private.
- New social/public profile mutations require current adult assurance; export/deletion/supporter privacy and removal of existing block/mute relations require only a current authenticated owner.
- Default `supporter_anonymity_default=true`.
- No service-role key in browser production code.
- TDD: production behavior is implemented only after the corresponding failing unit, pgTAP, or browser test exists.
- Existing Slice 1 and Slice 2 tests remain mandatory regressions.

---

### Task 1: Profile domain policy and Slice 3 contract

**Files:**
- Create: `apps/web/src/lib/profile/policy.ts`
- Create: `apps/web/src/lib/profile/policy.test.ts`
- Modify: `apps/web/src/lib/foundation.ts`
- Modify: `apps/web/src/lib/foundation.test.ts`
- Modify: `apps/web/src/app/health/route.test.ts`
- Modify: `apps/web/vitest.config.ts`

**Interfaces:**
- Produces `normalizeHandle(value): string`, `validateHandle(handle): string | null`, `validateDisplayName(value): string | null`, `validateBio(value): string | null`, `sanitizeProfileLinks(input): { links: ProfileLink[]; error: string | null }`, `normalizeLanguageTag(value): string`, `validateLanguageTag(value): string | null`, `resolveSupporterIdentity(profile, anonymousByDefault): SupporterIdentity`, `canViewProfile(visibility, isOwner): boolean`, and `validateProfileMedia(kind, mime, bytes): string | null`.

- [ ] **Step 1: Write failing unit tests** covering reserved handles, lowercase normalization, display/bio limits, HTTPS-only links, language tags, anonymous identity resolution, visibility, and media size/type policy.

```ts
expect(normalizeHandle("  Creator_Name ")).toBe("creator_name");
expect(validateHandle("admin")).toBe("That handle is reserved.");
expect(sanitizeProfileLinks([{ label: "Site", url: "javascript:alert(1)" }]).error).toContain("HTTPS");
expect(resolveSupporterIdentity({ handle: "sam", displayName: "Sam" }, true)).toEqual({ kind: "anonymous", label: "Anonymous supporter" });
expect(validateProfileMedia("avatar", "image/jpeg", 5 * 1024 * 1024)).toBeNull();
```

- [ ] **Step 2: Run** `pnpm --filter @lux/web exec vitest run src/lib/profile/policy.test.ts` and verify RED because the module is absent.
- [ ] **Step 3: Implement the policy module** with exact spec limits and no network/database behavior.
- [ ] **Step 4: Update foundation contract** to Slice 3 and required routes `/settings/profile`, `/settings/privacy`, `/settings/privacy/export`.
- [ ] **Step 5: Run unit + health tests** and verify GREEN.
- [ ] **Step 6: Commit** `feat(profile): add Slice 3 domain policy contract`.

### Task 2: Database schema, RPC authorization, RLS, storage policies

**Files:**
- Create: `supabase/migrations/20260823000100_slice_3_profiles_privacy.sql`
- Create: `supabase/tests/0003_profiles_privacy_rls.test.sql`
- Modify: `scripts/engineering/check-repository.mjs`

**Interfaces:**
- Produces tables `profiles`, `profile_follows`, `profile_blocks`, `profile_mutes`, `privacy_requests`, `notifications`.
- Produces RPCs `get_public_profile(text)`, `is_profile_discoverable(text)`, `update_profile(...)`, `set_profile_relationship(text,text)`, `set_supporter_privacy(boolean)`, `submit_account_deletion_request()`, `cancel_account_deletion_request()`, `mark_notification_read(uuid)`, `mark_all_notifications_read()`.
- Creates private Storage bucket `profile-media` and storage RLS policies.

- [ ] **Step 1: Write pgTAP RED tests** for anonymous full-table denial, allowlisted public projection, private/unlisted behavior, cross-owner update denial, block/follow atomicity, private mute/block lists, duplicate follow notification idempotency, deletion-request idempotency, recipient-only notifications, adult-gate distinction, and non-forgeable audit events.

```sql
select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  null,
  'anonymous callers cannot select full profile rows'
);

select is(
  (select count(*) from public.profile_follows where follower_user_id = :'blocked_user'::uuid and followed_user_id = :'blocker_user'::uuid),
  0::bigint,
  'blocking removes reverse follow edge atomically'
);
```

- [ ] **Step 2: Run** `supabase test db supabase/tests/0003_profiles_privacy_rls.test.sql` and verify RED.
- [ ] **Step 3: Implement enums/tables/indexes/default profile backfill/new-user profile trigger** using non-email-derived SHA-256 handle generation.
- [ ] **Step 4: Implement constrained security-definer RPCs** with explicit `search_path`, `auth.uid()` checks, age/session checks where required, idempotency, and audit writes.
- [ ] **Step 5: Implement storage bucket/policies** so owner writes are private and reads are mediated by profile visibility/ownership.
- [ ] **Step 6: Run all database tests** `pnpm test:database` and verify every Slice 2 + Slice 3 assertion passes.
- [ ] **Step 7: Commit** `feat(profile): add privacy-first profile database boundary`.

### Task 3: Owner profile editing and safe media upload

**Files:**
- Create: `apps/web/src/app/settings/profile/page.tsx`
- Create: `apps/web/src/app/settings/profile/actions.ts`
- Create: `apps/web/src/lib/profile/media.ts`
- Create: `apps/web/src/lib/profile/media.test.ts`
- Create: `apps/web/src/components/profile/profile-editor.tsx`
- Modify: `apps/web/src/components/workspace/workspace-shell.tsx`
- Modify: `apps/web/src/app/auth-workspace.css`

**Interfaces:**
- `saveProfileAction(state, formData)` calls only `update_profile` RPC.
- `uploadProfileMediaAction(state, formData)` validates owner/session/adult assurance, decodes with Sharp, auto-orients, strips metadata, converts to WebP, uploads processed bytes, and then atomically updates profile media path.
- `processProfileMedia(kind, buffer): Promise<{ buffer: Buffer; width: number; height: number }>`.

- [ ] **Step 1: Write media RED tests** proving invalid formats reject, avatar/banner limits differ, output is WebP, output dimensions obey 1024×1024 / 2400×900, and metadata is stripped.
- [ ] **Step 2: Run targeted unit tests** and verify RED.
- [ ] **Step 3: Implement media processing** with existing Sharp runtime only.
- [ ] **Step 4: Implement profile settings page/actions** with field-level validation and no raw DB errors.
- [ ] **Step 5: Add Profile/Privacy navigation links** without changing existing workspace isolation.
- [ ] **Step 6: Run lint/type/unit/build** and verify GREEN.
- [ ] **Step 7: Commit** `feat(profile): add owner profile editor and safe media uploads`.

### Task 4: Public profile, guarded media route, and social actions

**Files:**
- Create: `apps/web/src/app/u/[handle]/page.tsx`
- Create: `apps/web/src/app/u/[handle]/actions.ts`
- Create: `apps/web/src/app/profile-media/[handle]/[kind]/route.ts`
- Create: `apps/web/src/components/profile/public-profile.tsx`
- Create: `apps/web/src/components/profile/profile-social-actions.tsx`
- Modify: `apps/web/src/app/auth-workspace.css`

**Interfaces:**
- Page reads exclusively through `get_public_profile(handle)`.
- Media route resolves the handle through an allowlisted RPC and downloads from the private bucket; anonymous/public-unlisted response cache ≤60 seconds, private owner response `private, no-store`.
- Social action uses `set_profile_relationship(target_handle, action)` where action is `follow|unfollow|block|unblock|mute|unmute`.

- [ ] **Step 1: Add browser RED tests** for public/unlisted/private visibility, no UUID in public markup/media URLs, follow/unfollow without manual refresh, block removing follow and preventing refollow, unblock restoring follow ability, and mute privacy.
- [ ] **Step 2: Run only the new profile browser file** and verify RED.
- [ ] **Step 3: Implement public page/media route/social controls** against existing RPC contracts.
- [ ] **Step 4: Re-run new browser tests** and verify GREEN desktop + Pixel 7.
- [ ] **Step 5: Commit** `feat(profile): add public profiles and social privacy controls`.

### Task 5: Privacy settings, export, deletion requests, notifications

**Files:**
- Create: `apps/web/src/app/settings/privacy/page.tsx`
- Create: `apps/web/src/app/settings/privacy/actions.ts`
- Create: `apps/web/src/app/settings/privacy/export/route.ts`
- Create: `apps/web/src/app/notifications/page.tsx`
- Create: `apps/web/src/app/notifications/actions.ts`
- Create: `apps/web/src/components/profile/privacy-settings.tsx`
- Modify: `apps/web/src/components/workspace/workspace-shell.tsx`

**Interfaces:**
- Privacy settings require `requireAuthenticatedViewer`, not `requireAdultViewer`, for supporter privacy, export/deletion, and removal of existing blocks/mutes.
- Export route returns `application/json; charset=utf-8` + `Content-Disposition: attachment` and explicitly selects permitted owner fields only.
- Deletion confirmation requires exact `DELETE MY LUX ACCOUNT` phrase before RPC.

- [ ] **Step 1: Add browser RED tests** for supporter-anonymity preview/persistence, export content allowlist, expired-age privacy-right access, deletion submit/idempotency/cancel, unread/read notification behavior and blocked-actor suppression.
- [ ] **Step 2: Verify RED** with targeted Playwright execution.
- [ ] **Step 3: Implement privacy/notification/export surfaces** using constrained RPCs and explicit field selection.
- [ ] **Step 4: Verify GREEN** desktop + Pixel 7.
- [ ] **Step 5: Commit** `feat(privacy): add owner privacy rights and notifications`.

### Task 6: Workspace integration and visual regression

**Files:**
- Modify: `apps/web/src/app/workspace/fan/page.tsx`
- Modify: `apps/web/src/app/workspace/creator/page.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/auth-workspace.css`
- Modify: `apps/web/src/components/workspace/workspace-role-view.tsx`

**Interfaces:**
- Fan and Creator surfaces link to one canonical profile row; no duplicate identity tables.
- Creator profile presence is not labeled identity verified.

- [ ] **Step 1: Add browser RED assertions** for canonical profile links and absence of false verification claims.
- [ ] **Step 2: Implement workspace/home copy/navigation**.
- [ ] **Step 3: Run design-system and foundation browser suites** to guard Slice 1 alignment/navigation and Slice 2 auth/workspace behavior.
- [ ] **Step 4: Commit** `feat(profile): integrate profiles into existing workspaces`.

### Task 7: Engineering evidence and permanent regressions

**Files:**
- Create: `apps/web/tests/e2e/profile-privacy.spec.ts`
- Modify: `docs/engineering/PROJECT-TEST-MATRIX.md`
- Modify: `docs/engineering/REGRESSION-REGISTER.md`
- Modify: `scripts/engineering/handoff.mjs`

**Interfaces:**
- New permanent regressions cover public/private data leakage, UUID leakage, follow/block state, metadata stripping, owner privacy-right access without age assurance, and notification deep links.

- [ ] **Step 1: Ensure profile tests execute independently** and do not use serial mode.
- [ ] **Step 2: Update handoff feature mapping** for `/u`, profile media, settings/profile, settings/privacy, export, and notifications.
- [ ] **Step 3: Update test matrix/regression register** with real PASS only after automated evidence exists; otherwise leave BLOCKED/FAIL.
- [ ] **Step 4: Run `pnpm verify:quick`** and verify GREEN.
- [ ] **Step 5: Commit** `test(profile): lock Slice 3 privacy regressions`.

### Task 8: Full gate, root-cause fixes, and merge readiness

**Files:**
- No planned production changes; any failure creates a targeted RED regression before the root-cause fix.

- [ ] **Step 1: Run GitHub full gate** with fresh isolated Supabase stack.
- [ ] **Step 2: For each failure, inspect complete job logs/evidence; add or strengthen a test that reproduces the root cause before changing production code.**
- [ ] **Step 3: Repeat the complete gate until repository, secrets, lint, type, unit coverage, integration, dependency audit, runtime compatibility, database/RLS, production build, and all desktop/mobile workflows pass with zero required failures.**
- [ ] **Step 4: Run the verification-before-completion skill and inspect the final gate evidence.**
- [ ] **Step 5: Open PR to `main`; do not merge until automated gate is green and owner browser acceptance is complete.**
