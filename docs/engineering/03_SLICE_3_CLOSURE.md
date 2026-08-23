# Slice 3 Closure Record — Profiles and Privacy

## Scope

Build Slice 3 establishes the privacy-first public identity layer on top of the accepted Slice 1 shell and Slice 2 authentication/workspace boundary.

Implemented surfaces:

- owner profile editing: handle, display name, bio, language, visibility, and up to five HTTPS links;
- metadata-stripped avatar and banner processing to WebP through Sharp;
- private `profile-media` storage with opaque account namespaces and guarded handle-based media routes;
- public, unlisted, and private profile visibility behavior;
- one canonical profile shared by Fan and approved Creator workspaces without implying creator identity verification;
- follow/unfollow, block/unblock, and mute/unmute with database-enforced relationship rules;
- recipient-only follower notifications with mark-read and block suppression;
- supporter-anonymity default with live preview using the shared resolver;
- owner-only account export with UUID-free relationship projections, fail-closed reads, and an audit receipt;
- idempotent deletion request and cancellation;
- privacy rights and existing block/mute removal remain usable with a current authenticated session even when adult assurance is absent or expired.

## Security invariants

- Public profile projection never exposes account UUID, email, auth metadata, age-assurance records, payment data, verification evidence, or private settings.
- Public media URLs are handle-based and storage object paths use an opaque namespace; raw account UUIDs are not used as storage paths.
- Media is decoded, auto-oriented, constrained, metadata-stripped, and re-encoded as WebP before storage.
- Private profile media is not available anonymously.
- Public/unlisted media uses a 60-second revalidation cache contract; private owner media uses `private, no-store`.
- Blocks remove follow edges in both directions and prevent new interaction across an active block.
- Mutes remain private to the muting account.
- Supporter anonymity is privacy-on by default.
- Account export excludes age-assurance records/evidence and internal account UUIDs from portable relationship data.
- Durable relationship/profile/privacy writes use constrained RPC/database boundaries rather than broad direct table mutation.
- All new exposed database tables remain protected by RLS and authenticated users cannot forge audit records directly.

## Automated acceptance matrix

Slice 3 is not accepted unless one exact candidate head passes all of the following in a single clean Engineering Gate:

1. repository integrity;
2. tracked-file secret scan;
3. lint;
4. TypeScript;
5. unit tests and coverage;
6. integration/API tests;
7. production dependency audit;
8. overridden runtime dependency compatibility;
9. complete Supabase pgTAP/RLS suites for Slices 2 and 3;
10. production build;
11. Playwright desktop Chrome;
12. Playwright Pixel 7/mobile regression;
13. Slice 1 design-system and Slice 2 auth/age/workspace regressions.

The browser suites must prove profile persistence and validation, avatar/banner processing and replacement, visibility transitions, UUID-free public/media responses, relationship synchronization, block alternate-route enforcement, supporter-preview persistence, owner-only export behavior, deletion idempotency/cancellation, age-independent privacy rights, and notification privacy/deep links.

## Manual owner acceptance

Only after the automated gate is green, the generated manual-test handoff is used for final owner browser acceptance on LUX port `30002`. The owner's machine is not required to run the Docker/Supabase database suite; GitHub Actions remains the database/RLS enforcement environment.

## Deferred by design

Slice 3 does not implement feeds/discovery, creator or depicted-person identity verification, project consent, campaigns, funding/payments, secure content delivery, payouts, copyright operations, agency operations, or later marketplace workflows. Those remain in their canonical later slices.
