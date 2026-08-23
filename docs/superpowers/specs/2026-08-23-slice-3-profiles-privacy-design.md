# Slice 3 — Profiles and Privacy Design

## Status
Approved architectural direction for the next independently testable LUX vertical slice. Implementation must not begin until Slice 2 remains green in automation and its hosted development age-assurance path is owner-accepted.

## Goal
Build a privacy-first identity layer for fans and creators that exposes only intentionally public profile data, keeps private preferences server-only, supports follow/block/mute safely, provides durable supporter-anonymity defaults, and gives the account owner usable export/deletion entry points.

## Non-negotiable product rules

- Public profile data and private account data are stored and queried through separate access paths.
- No email address, authentication metadata, age-assurance record, verification evidence, legal identity, payment data, or private account setting may appear in public profile responses.
- A creator profile shell must not imply creator identity verification; verified-person status remains Slice 5.
- Blocking prevents authenticated LUX interaction through direct routes, alternate UI paths, and RPC calls. It does not claim to make already-public profile metadata invisible to anonymous internet users.
- Muting is private to the muting user and never disclosed to the muted person.
- Supporter anonymity is a durable privacy preference consumed later by campaigns, badges, and funding views. Slice 3 provides a preview using the same resolver so downstream slices do not reinvent the rule.
- Profile media is sanitized before storage. Raw EXIF/location metadata is never retained.
- Deletion is a request, not immediate destructive erasure, because later financial, consent, fraud, and legal-retention records may require controlled retention.
- Account export, deletion-request, and existing block/mute management remain available to a current authenticated owner even when adult assurance is not currently satisfied. Privacy rights must not be trapped behind the adult gate.
- No service-role key is required in the browser application for ordinary profile operations.

## Architecture

Slice 3 extends the existing Supabase Auth + Next.js server-action + Postgres RLS model established in Slice 2. Durable profile writes happen through constrained RPC functions. Public reads use a security-definer projection function that returns an explicit allowlist rather than granting broad table select access.

Profile media is stored in a private Supabase Storage bucket. Server-side media access uses the current session or anonymous Supabase role plus storage/RLS policy checks. Owner uploads are normalized with Sharp to metadata-free WebP before storage. Private-profile media is therefore not exposed by a permanent public bucket URL.

The UI uses the existing Slice 1 shell and primitives. The route family is split into public profile display, owner profile settings, privacy settings, and a privacy export endpoint. Social controls use server actions and return updated state so follow counts and relationship status change without a manual browser refresh.

## Routes

Public:

- `/u/[handle]` — public or unlisted profile projection; private/blocked states return controlled not-found/denied behavior.
- `/profile-media/[handle]/[kind]` — guarded media proxy for `avatar` or `banner`; never exposes the internal account UUID or permanent storage object URL.

Authenticated owner settings:

- `/settings/profile` — display name, handle, bio, avatar, banner, links, language, visibility, live public preview.
- `/settings/privacy` — supporter anonymity default, relationship privacy summary, block/mute management, deletion request.
- `/settings/privacy/export` — authenticated JSON export generated from the owner’s allowed account/profile/social data.

Existing `/workspace/fan` and `/workspace/creator` surfaces link to the same canonical profile identity rather than storing duplicate profile records.

## Data model

### `profiles`

One row per account.

- `user_id uuid primary key` → `auth.users(id)`
- `handle text unique not null`
- `display_name text not null`
- `bio text not null default ''`
- `avatar_path text null`
- `banner_path text null`
- `links jsonb not null default '[]'`
- `language_code text not null default 'en'`
- `visibility profile_visibility not null default 'public'`
- `supporter_anonymity_default boolean not null default true`
- `profile_revision bigint not null default 1`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`profile_visibility` values: `public`, `unlisted`, `private`.

Existing accounts are backfilled. New auth users receive a non-email-derived handle computed as `lux-` plus the first 10 lowercase hexadecimal characters of `sha256(user_id::text)`, with a collision fallback that extends the digest suffix. The default display name is `LUX member`. Email-derived handles are forbidden.

### `profile_follows`

- `follower_user_id uuid`
- `followed_user_id uuid`
- `created_at timestamptz`
- primary key `(follower_user_id, followed_user_id)`
- self-follow prohibited

### `profile_blocks`

- `blocker_user_id uuid`
- `blocked_user_id uuid`
- `created_at timestamptz`
- primary key `(blocker_user_id, blocked_user_id)`
- self-block prohibited

Creating a block removes follow edges in both directions in the same transaction and prevents either account from creating a new follow edge while the block exists.

### `profile_mutes`

- `muter_user_id uuid`
- `muted_user_id uuid`
- `created_at timestamptz`
- primary key `(muter_user_id, muted_user_id)`
- self-mute prohibited

### `privacy_requests`

- `id uuid primary key`
- `user_id uuid not null`
- `request_type privacy_request_type not null`
- `status privacy_request_status not null`
- `requested_at timestamptz not null`
- `updated_at timestamptz not null`

`privacy_request_type`: `deletion`.

`privacy_request_status`: `submitted`, `cancelled`, `processing`, `completed`, `rejected`.

Only one active deletion request per account is allowed. Processing/completion remains an admin/legal workflow for Slice 17.

### `notifications`

Slice 3 establishes the minimal in-app notification baseline needed by social actions.

- `id uuid primary key`
- `recipient_user_id uuid not null`
- `actor_user_id uuid null`
- `type notification_type not null`
- `target_path text null`
- `read_at timestamptz null`
- `created_at timestamptz not null`

Slice 3 notification type: `new_follower`.

Notifications are recipient-only. Notifications from an actor currently blocked by the recipient are filtered from reads. Follow creation is idempotent and cannot generate duplicate notifications for duplicate clicks.

## Public profile projection

A single RPC, `get_public_profile(profile_handle text)`, returns only:

- handle
- display name
- bio
- handle-based avatar media route
- handle-based banner media route
- sanitized links
- language code
- visibility
- follower count
- following count
- viewer relationship state (`following`, `blocked_by_me`, `muted_by_me`) only when the caller is authenticated
- approved creator-workspace presence as a neutral capability flag, never as identity-verification proof

It never returns `user_id` to anonymous viewers. Private profiles are visible only to the owner. Unlisted profiles are directly addressable but `is_profile_discoverable(handle)` returns false for them so Slice 4 can consume the same rule without redefining visibility.

## Validation rules

### Handle

- lowercase only
- 3–30 characters
- regex `^[a-z0-9_]{3,30}$`
- unique after lowercase normalization
- reserved handles are exactly: `about`, `account`, `admin`, `administrator`, `agency`, `api`, `auth`, `callback`, `creator`, `design-system`, `explore`, `feed`, `health`, `help`, `login`, `logout`, `lux`, `moderator`, `notifications`, `privacy`, `settings`, `signup`, `staff`, `support`, `terms`, `u`, `workspace`

Handle changes increment `profile_revision` and immediately invalidate the old public profile route.

### Display name

- trimmed
- 1–80 Unicode characters
- control characters rejected

### Bio

- maximum 500 Unicode characters
- stored as plain text; no raw HTML accepted

### Links

- maximum 5 entries
- each entry has `label` and HTTPS `url`
- URLs are normalized and rendered with safe external-link attributes
- `javascript:`, `data:`, credentials-in-URL, and non-HTTPS schemes are rejected

### Language

- normalized tag matching `^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$`
- maximum 16 characters
- no automatic inference from private device/account metadata

## Profile media

Bucket: `profile-media`, private.

Accepted upload input:

- JPEG
- PNG
- WebP

Limits:

- avatar source ≤ 5 MiB
- banner source ≤ 10 MiB

Server processing with Sharp:

- decode with fail-on-error
- auto-orient
- strip metadata
- avatar → maximum 1024×1024, WebP
- banner → maximum 2400×900, WebP
- upload only the processed buffer

Object paths use the authenticated owner UUID plus fixed kind/version naming; that UUID is never placed in the public media URL. The database stores only the object path. Private owner-only responses use `Cache-Control: private, no-store`. Public/unlisted media responses use `Cache-Control: public, max-age=60, must-revalidate`, so a visibility change has a defined maximum browser cache window of 60 seconds.

## Social graph behavior

### Follow

- authenticated adult-assured viewer only
- cannot follow self
- cannot follow across an active block in either direction
- duplicate follow is idempotent
- successful follow updates count/state in the current UI without page reload
- one privacy-safe `new_follower` notification is created for the followed user

### Unfollow

- authenticated adult-assured viewer only
- idempotent
- count/state updates without page reload

### Block

- creation from a public profile requires an authenticated adult-assured viewer
- existing blocks can still be managed from `/settings/privacy` by a current authenticated owner without requiring adult assurance
- atomic transaction removes follows both directions
- later follow attempts fail at RPC/database boundary
- blocked caller cannot use authenticated profile interaction RPCs against the blocker
- block list is visible only to the blocker

### Mute

- creation from a public profile requires an authenticated adult-assured viewer
- existing mutes can still be managed from `/settings/privacy` by a current authenticated owner without requiring adult assurance
- does not imply or create a block
- mute list is visible only to the muter
- future feed/discovery Slice 4 must consume the same mute relation

## Supporter anonymity

`supporter_anonymity_default=true` by default.

The privacy settings page provides two explicit options:

- `Anonymous by default`
- `Show my profile by default`

A shared resolver returns either the public profile projection or an anonymous-safe identity object. The settings page includes a “How supporters will see you” preview using this resolver. Slices 9 and 10 must use the same resolver for campaign supporter lists and badges. Changing this owner privacy preference requires a current authenticated session but does not require adult assurance.

## Export and deletion

### Export

`GET /settings/privacy/export` requires a current authenticated owner session but does not require adult assurance. It streams UTF-8 JSON with:

- profile fields owned by the account
- approved/requested workspace role names and statuses, excluding internal reviewer metadata
- privacy settings
- follows/following
- blocks
- mutes
- age-assurance decision metadata but not auth tokens or evidence
- audit-event records already readable by the account
- privacy-request history

No password hashes, refresh/access tokens, provider secrets, other users’ private fields, staff-only notes, or service data are exported.

### Deletion request

The owner must have a current authenticated session but does not need current adult assurance. The owner must confirm a destructive-action dialog and type the exact phrase `DELETE MY LUX ACCOUNT` before submission. The request is idempotent and auditable. The account remains usable until a future controlled retention/deletion workflow processes the request.

## Notifications UI

The existing shell notification control becomes functional for authenticated adult-assured users:

- unread count
- latest follower notifications
- exact deep link to the follower’s profile when still viewable
- mark one or all read
- blocked actors suppressed from the result

No email/push notification provider is introduced in Slice 3.

## Error handling

- Profile not found, private, or blocked-from-view states do not leak whether hidden private data exists.
- Handle conflict returns a field-level validation error without database exception text.
- Media decoding errors return a safe file-validation message.
- Storage failure never updates the profile row to a missing object path.
- Social-action failures leave UI counts unchanged and return an accessible error state.
- Export failures do not leave generated files on disk or in storage.
- Deletion-request failures do not partially change account state.

## RLS and authorization

All new public tables have RLS enabled.

- `profiles`: owner may read/write own full row through constrained interfaces; direct anonymous/public table select is not granted.
- public profile reads occur only through the allowlisted projection function.
- `profile_follows`: caller can read rows where they are follower or followed as needed for own state; durable writes are RPC-only.
- `profile_blocks`: blocker-only read; writes RPC-only.
- `profile_mutes`: muter-only read; writes RPC-only.
- `privacy_requests`: owner-only read; submission/cancellation RPC-only.
- `notifications`: recipient-only read and mark-read; creation is server/database controlled.
- storage object access is owner-or-viewable-profile only.

Profile edits, new social interactions, media upload, and public notification interactions require the existing current-session plus adult-access checks. Export, deletion-request, supporter-anonymity preference, and management/removal of already-existing block/mute relationships require a current authenticated owner session but deliberately do not require adult assurance.

## Audit events

Add stable events:

- `profile_updated`
- `profile_visibility_changed`
- `profile_media_updated`
- `profile_followed`
- `profile_unfollowed`
- `profile_blocked`
- `profile_unblocked`
- `profile_muted`
- `profile_unmuted`
- `supporter_privacy_changed`
- `account_export_generated`
- `account_deletion_requested`
- `account_deletion_request_cancelled`

Audit metadata may contain target account UUID internally, field-name sets, relationship type, or media kind. It must never contain bio text, raw links, image bytes, email, passwords, tokens, IP addresses, or storage secrets.

## Testing

### Unit

Test validation and projection policy independently:

- handle normalization/reserved names
- display-name/bio limits
- link sanitizer
- language validation
- supporter anonymity resolver
- profile visibility decisions
- safe relationship-state derivation
- media type/size policy

### Database/pgTAP

Prove:

- anonymous caller cannot select full profile rows
- public RPC returns only allowlisted fields and never the internal user UUID
- private profile is owner-only
- unlisted profile is direct-readable while `is_profile_discoverable` returns false
- one account cannot update another profile
- follow cannot cross a block
- block removes both follow directions atomically
- mute is private
- requester cannot read another user’s block/mute lists
- duplicate follow does not duplicate relationship or notification
- deletion request is idempotent
- notification reads are recipient-only
- storage owner write and viewability policies enforce profile visibility
- audit inserts cannot be forged directly by authenticated users
- export/deletion/supporter-privacy and existing block/mute management remain callable by an authenticated owner when adult assurance is absent/expired, while new social/profile-publication actions remain denied

### Browser desktop + Pixel 7

Prove:

- edit profile and refresh persistence
- handle conflict and invalid link errors
- avatar/banner upload, sanitize, render, replace, and visibility transition
- public/unlisted/private profile behavior
- media routes never expose internal user UUIDs
- private-profile media becomes inaccessible after the 60-second defined cache window
- follow/unfollow count changes without manual refresh
- block removes follow and prevents alternate-route refollow
- unblock allows a fresh follow
- mute/unmute persists privately
- supporter-anonymity preview changes immediately and persists
- export downloads correct JSON without another user’s private data
- export/deletion controls remain usable when the test account’s age assurance is deliberately removed/expired
- deletion request confirmation, submission, duplicate submission, and cancellation
- notification unread/read behavior and deep link
- existing Slice 1 design-system regression
- complete Slice 2 auth/age/workspace regression

Tests execute independently rather than serially so one failure cannot conceal later cases.

## Acceptance gate

Slice 3 is not complete until:

- private fields never appear in public API/page responses;
- internal user UUIDs are absent from anonymous profile/media URLs and payloads;
- profile edits survive refresh and concurrent sessions;
- follow counts/state update without manual refresh;
- block is enforced through UI, direct URL/RPC alternate paths, and database rules;
- mute remains private and durable;
- supporter-anonymity resolver produces the same identity decision used by its preview and future downstream contract tests;
- media is metadata-stripped and private-profile media becomes inaccessible after visibility changes within 60 seconds;
- export contains only the owner’s permitted data;
- export, deletion request, supporter privacy, and existing block/mute management cannot be locked out by an absent/expired adult-assurance record;
- deletion request is explicit, idempotent, and audited;
- no new production dependency vulnerability remains;
- full unit, database/RLS, build, desktop, mobile, Slice 1 regression, and Slice 2 regression gates are green;
- Slice 2 hosted age assurance has owner acceptance before Slice 3 is merged.

## Out of scope

- legal/identity verification for creators or depicted people — Slice 5
- discovery/search ranking — Slice 4
- campaign supporter lists — Slice 9
- supporter badges — Slice 10
- full account erasure/retention processing — Slice 17
- email/push notification providers
- direct messaging
- follower approval/private-follow system
- creator monetization or payouts
