# Slice 3 Closure Record — Profiles and Privacy

## Current closure status

**AUTOMATED-READY / OWNER BROWSER ACCEPTANCE PENDING.**

Slice 3 must remain unmerged until the current PR head has a green required Engineering Gate and the owner completes the generated manual browser handoff. Automated evidence must never be converted into a fabricated owner acceptance.

The pre-reconciliation full baseline is Engineering Gate run `32680016367` (run #306), generated from PR #4 head `42bdb059e7cd6e89e77ee43b34d789c7240a41a3` against unchanged `main` base `e09d6fe20bcbc9f6753b136021b707d8392a73ee`; GitHub tested integration commit `1b2f996dc3e94e77cad8a8f3a01049ef6db61f25`. Every required automated category passed. After this evidence reconciliation or any later head change, the latest required Engineering Gate on that current head becomes authoritative.

## Scope

Build Slice 3 establishes the privacy-first public identity layer on top of the Slice 1 shell and the Slice 2 authentication/workspace boundary carried by the same candidate.

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
- Requested roles do not grant permission; approved roles remain separate until explicit workspace activation.
- Provider-required adult access fails closed; development self-attestation does not imply production provider integration.

## Automated acceptance matrix

Slice 3 is not automated-ready unless the active PR candidate passes all applicable items below in one clean Engineering Gate against the current `main` base:

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
12. Playwright mobile regression;
13. Slice 1 design-system and Slice 2 auth/age/workspace regressions.

The browser suites must prove profile persistence and validation, avatar/banner processing and replacement, visibility transitions, UUID-free public/media responses, relationship synchronization, block alternate-route enforcement, supporter-preview persistence, owner-only export behavior, deletion idempotency/cancellation, age-independent privacy rights, and notification privacy/deep links.

## Automated evidence

Pre-reconciliation full baseline run `32680016367` proved:

- repository integrity: PASS;
- tracked-file secret scan: PASS;
- lint: PASS;
- TypeScript: PASS;
- unit tests: **39/39 PASS** with 97.51% statements/lines, 85.95% branches and 100% functions in scoped domain coverage;
- integration/API: **1/1 PASS**;
- production dependency audit: PASS, no known vulnerabilities reported by the gate;
- runtime compatibility: PASS for nanoid 3.3.18, postcss 8.5.23 and sharp 0.35.3;
- Supabase pgTAP/RLS: **6 files, 166 assertions, all PASS**;
- optimized Next.js production build: PASS;
- browser regression: **48/48 PASS**, split across desktop Chromium and mobile Chromium;
- manual-test handoff generation: PASS and emitted the exact Slice 3 browser checks.

The permanent project test matrix and regression register are reconciled to this implemented candidate in the same evidence-only closure change. Because PR verification compares the cumulative candidate to `main`, that reconciliation remains browser-impacting for this PR and must receive a fresh full gate before owner handoff.

## Implementation-plan reconciliation

The approved plan at `docs/superpowers/plans/2026-08-23-slice-3-profiles-privacy.md` has been executed through its automated implementation and evidence phases:

- Tasks 1–6: implemented and covered by unit, database/RLS, build and browser evidence;
- Task 7: permanent profile/privacy regressions, handoff mappings, project test matrix and regression register are installed/reconciled;
- Task 8 steps 1–4: full-gate/root-cause cycle and verification evidence completed on the baseline, with a fresh gate required after this reconciliation head change;
- Task 8 step 5: PR #4 is open to `main`; **merge remains intentionally blocked only by current-head green verification plus owner browser acceptance**.

Historical RED/GREEN steps in the implementation plan remain an execution recipe and are not rewritten as retroactive checkmarks; durable proof is the commit history plus the automated regression suites above.

## Manual owner acceptance

Only after the current-head automated gate is green, the generated manual-test handoff is used for final owner browser acceptance on LUX port `30002`. The owner's machine is not required to run the Docker/Supabase database suite; GitHub Actions remains the database/RLS enforcement environment.

The required owner journey covers:

1. desktop/mobile root presentation and overflow;
2. sign-up validation and generic verification response;
3. email verification, sign-in/out and password recovery;
4. adult gate persistence in approved development mode;
5. fan-to-creator/staff direct-route denial;
6. pending creator request grants no permission;
7. approved Creator activation remains isolated from Staff across Back/Forward/refresh/direct navigation;
8. sign-out-all-devices invalidates a second active window and leaves sanitized history;
9. owner profile persistence plus guarded avatar/banner routes;
10. public/unlisted/private visibility plus follow/mute/block/unblock behavior across two accounts;
11. supporter privacy, UUID-free export, deletion idempotency/cancel and privacy-right removal after age assurance expires;
12. recipient-only notification read/deep-link/block suppression behavior.

## Deferred by design

Slice 3 does not implement feeds/discovery, creator or depicted-person identity verification, project consent, campaigns, funding/payments, production uploads, delivery review, secure content delivery, payouts, copyright operations, later agency workflows, moderation, or later administration. Those remain in their canonical later slices and must not be inferred from Slice 3 acceptance.