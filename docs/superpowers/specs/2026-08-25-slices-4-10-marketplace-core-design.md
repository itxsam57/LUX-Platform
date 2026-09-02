# LUX Slices 4–10 Marketplace Core Design

**Status:** Owner-approved design, implementation not yet started  
**Date:** 2026-08-25  
**Baseline:** `main` at `21135e5895390294ba503df3d2dfba1a3dc6795e` (Slices 0–3 accepted)  
**Execution branch:** `feature/slices-4-10-marketplace-core`  
**Canonical sources:** `docs/product/00_CANONICAL_PROJECT_LOCK.md`, accepted Slice 1–3 engineering records, and LUX Blueprint Library v0.1 (30 July 2026)

## 1. Purpose

This design implements the next seven canonical vertical slices as one continuous, stacked engineering run while preserving independent acceptance boundaries after every slice:

4. Feed and discovery
5. Creator and depicted-person verification
6. Crowd Demand Board
7. Project drafts and collaboration invitations
8. Contracts, consent and boundaries
9. Campaign publishing and pre-booking
10. Fan funding dashboard and badges

The branch may advance from one slice to the next only when the current slice has passed its required automated, database, security, build and browser gates. Product-owner visible testing is intentionally batched into one combined handoff after Slice 10, per owner instruction. No owner test is fabricated or substituted by automation.

## 2. Product constitution preserved

All implementation must preserve these non-negotiable rules:

1. Crowd demand signals interest; it never grants control over a creator or performer.
2. Every participant may accept, decline, ignore, counter or leave before contract lock subject to the exact lifecycle rules.
3. An agency may manage communication and negotiation within granted authority but may never provide personal performer consent.
4. Depicted-person consent is specific to an exact project/brief/contract version, role, collaborators, boundaries, compensation and distribution scope.
5. Adult viewer assurance remains separate from stricter creator/depicted-person identity and age verification.
6. Legal identity, identity evidence, payment details and private negotiations remain private by default.
7. No public release or payout is introduced by Slices 4–10. Later release/payout gates remain canonical future work.
8. Visible actions must perform real authorized state changes and persist across navigation/refresh.
9. Payment, identity and other external providers use replaceable adapters. Production configuration fails closed when a required provider is absent.
10. No dark pattern may obscure funding conditions, refund rules, access rights, deadlines or material project changes.

## 3. Engineering-governor contract

This run uses the Engineering Factory governance pattern as an execution discipline:

`DISCOVER → CONTRACTED → BUILDING → INSPECTING → TESTING → GATE_REVIEW → ACCEPTED`

For each slice:

- the accepted prior slice is the immutable baseline;
- code is built only on the isolated feature branch;
- TDD starts with a failing reproduction or failing requirement test;
- security review is mandatory for verification, consent, contracts, payments, privacy and authorization boundaries;
- tests may not be weakened merely to become green;
- failures are classified before code changes as `CODE_DEFECT`, `TEST_DEFECT`, `ENVIRONMENT_DEFECT`, `REQUIREMENT_CONFLICT`, `ARCHITECTURE_DEFECT`, `EXTERNAL_DEPENDENCY_DEFECT` or `UNKNOWN`;
- hidden compatibility fallbacks and duplicate state ownership are forbidden;
- each accepted slice records its exact head SHA and gate evidence;
- three genuine failed root-cause revisions on the same blocking issue require owner escalation rather than patch stacking;
- no merge to `main` occurs until Slice 10 automated acceptance is green and the combined owner handoff is passed.

## 4. Shared architecture

### 4.1 Existing stack

Continue the accepted stack and patterns from Slices 1–3:

- Next.js App Router + React + strict TypeScript;
- Supabase Postgres, RLS, RPC boundaries and private storage where appropriate;
- server-side authorization through the existing authenticated/adult/workspace context helpers;
- database-owned state machines for high-risk or multi-party transitions;
- immutable audit events for material actions;
- Vitest for domain/application policy tests;
- pgTAP/RLS tests for database permissions and state invariants;
- Playwright desktop/mobile for real browser workflows;
- GitHub Actions Engineering Gate for isolated Supabase and complete candidate verification.

### 4.2 Authorization invariant

Every durable write repeats all applicable server-side checks:

1. role capability;
2. resource relationship;
3. resource state;
4. required verification state;
5. risk/policy state.

UI visibility is never accepted as authorization.

### 4.3 Public identifiers

New public-facing marketplace objects use opaque/public IDs or stable slugs. Internal account UUIDs, legal identity IDs, verification evidence IDs and processor IDs must not be exposed in public HTML, public API projections, URLs, media paths, notifications or downloadable owner-facing data unless an explicitly authorized private surface requires them.

### 4.4 Audit and idempotency

Material writes must create purpose-specific audit events. Multi-party state transitions, invitations, submissions, contract acceptance, campaign submission, pre-booking, payment writes, refunds and webhook handling are idempotent and transactionally safe against duplicate clicks/retries/concurrent calls.

## 5. Slice 4 — Feed and Discovery

### 5.1 Goal

Make LUX discoverable and useful as a marketplace without introducing black-box recommendation infrastructure or leaking private profile information.

### 5.2 Routes

- `/app/feed`
- `/app/explore`
- `/app/search`
- supporting server actions/read models for discovery cards and filters

### 5.3 Feed modes

`Following`:
- content/objects only from followed public or directly eligible unlisted sources;
- all active block/privacy rules applied before ranking;
- deterministic newest/relevance ordering with stable pagination.

`For You`:
- understandable weighted ranking using explicit signals available in M1: followed creators, selected interests/categories, freshness, eligible engagement and creator diversity;
- creator diversity cap prevents one creator from monopolizing a page;
- no paid boost is blended invisibly into organic ranking;
- later ML/recommender systems remain deferred.

### 5.4 Explore/search objects

Search/explore may return only approved projections of:

- public creators/profiles;
- public demands introduced in Slice 6;
- eligible public project/campaign summaries introduced by later slices in this run.

Until those object types exist, Slice 4 infrastructure must gracefully return only currently available types rather than fake records.

### 5.5 Suppression

Before ranking or rendering, suppress:

- blocked creator/account relationships in either relevant direction;
- private profiles and non-discoverable unlisted profiles;
- user-hidden interests/topics where implemented;
- objects not in an externally visible state;
- records restricted by policy/risk state.

### 5.6 Acceptance

Slice 4 must prove deterministic pagination, privacy filtering, block suppression, public projection safety, mobile/desktop usability, no horizontal overflow, no stale navigation and no regression to Slices 1–3.

## 6. Slice 5 — Creator and Depicted-Person Verification

### 6.1 Goal

Introduce a provider-neutral verification engine that can represent V2 identity verification and V3 depicted-performer verification without pretending a development adapter is production verification.

### 6.2 Verification levels

Preserve canonical levels:

- V1: age-assured fan — existing viewer boundary;
- V2: identity-verified account — government identity + liveness/provider result + risk screening where applicable;
- V3: verified depicted performer — V2 plus performer record, current liveness, payout-ownership status and consent-education acknowledgement.

V4/V5 remain later slices except where existing staff/super-admin roles require current boundaries.

### 6.3 Core records

Add versioned/private records for:

- verification subject;
- verification session;
- provider adapter result/reference;
- verification level/status;
- verification expiry/recheck reason;
- performer record;
- consent-education acknowledgement;
- reviewer decision metadata where manual review is needed.

Raw identity documents/evidence must not be placed in public profile tables or returned through public projections.

### 6.4 Adapter contract

A provider-neutral identity adapter must support at minimum:

- create/start verification session;
- retrieve/normalize provider result;
- verify callback/webhook authenticity when used;
- map result to internal verification state;
- expose provider health/configuration state without secrets.

Development/CI may use deterministic synthetic adapters. Production mode must fail closed if a required approved provider is not configured. UI must label sandbox/test mode truthfully.

### 6.5 Security

- no user can self-promote their verification level by direct table writes;
- reviewers cannot verify outside their authorized scope;
- public users see only safe verification badges/state, never legal identity/evidence;
- expired/revoked verification blocks later actions requiring it;
- every depicted person must have their own V3 record before accepting depicted-person consent.

## 7. Slice 6 — Crowd Demand Board

### 7.1 Goal

Create the marketplace demand signal while preserving creator autonomy.

### 7.2 Routes

- `/app/demand`
- `/app/demand/new`
- `/demand/[publicId]`
- creator response/interest surfaces within creator workspace

### 7.3 Demand record

A demand includes:

- public ID;
- creator/fan author relation;
- title;
- short brief;
- category/format;
- optional target/suggested creator profile reference;
- optional budget range;
- safety/boundary labels;
- visibility/state;
- support count derived from unique active supporters;
- expiry where applicable.

A demand is explicitly not a contract or commitment.

### 7.4 Support and visibility

Fans may support a demand once per account with idempotent follow-style semantics. Support may be publicly attributed or anonymous according to the account/support choice, but internal integrity still preserves one-account-one-support.

### 7.5 Named creator rules

When a demand references a creator:

- public UI says suggested/requested, never committed;
- creator can ignore/decline without public decline reason/status;
- creator may mark interest only through their own authorized workflow;
- fan support cannot convert creator state automatically;
- blocked users/keywords/categories prevent new matching invitations/visibility as defined by policy.

### 7.6 Conversion

An interested eligible creator may convert a demand into a creator-owned project draft. Conversion links provenance but creates a new project with creator ownership; it does not give the original fan edit/control rights.

## 8. Slice 7 — Project Drafts and Collaboration Invitations

### 8.1 Goal

Turn creator interest into a private, versioned project proposal and invite collaborators without granting consent or contract status prematurely.

### 8.2 Routes

- `/studio/projects`
- `/studio/projects/new`
- `/studio/projects/[publicId]`
- `/studio/invitations`
- `/studio/invitations/[publicId]`

### 8.3 Project draft

Project drafts are creator/producer-controlled and versioned. Required fields include:

- public project ID;
- source demand provenance when applicable;
- public synopsis separated from private production brief;
- category/format;
- role/casting requirements;
- boundaries/exclusions;
- expected collaborators;
- compensation proposal model;
- distribution/access scope proposal;
- funding target/deadline draft fields for later campaign preparation;
- draft rights declarations;
- revision number/state.

Autosave uses server-confirmed versioning and optimistic concurrency so stale tabs cannot silently overwrite newer drafts.

### 8.4 Invitation states

Invitation lifecycle includes:

`sent → viewed → interested/considering/negotiating/accepted/declined/expired/withdrawn`

Acceptance here means accepting the invitation to collaborate/continue into contracting. It does not equal legal contract lock or depicted-person final consent.

### 8.5 Invitation content

The invited user sees the exact current proposal version including role, synopsis/brief reference, known collaborators, compensation proposal, rights/distribution proposal, boundaries and schedule expectations. Material proposal changes invalidate stale invitation acceptance where necessary.

### 8.6 Actions

Recipient may:

- express interest;
- consider;
- ask a question;
- propose structured changes;
- accept invitation into the contracting workflow;
- quietly decline;
- let it expire.

Project owner may withdraw an invitation before contract lock.

Agency-managed actions must be clearly marked and cannot replace performer consent.

## 9. Slice 8 — Contracts, Consent and Boundaries

### 9.1 Goal

Create the legally/security-sensitive bridge between a proposed collaboration and a fundable project.

### 9.2 Versioned terms

Project terms are immutable versions once presented for acceptance. A new material change creates a new version and comparison rather than mutating the accepted historical version.

Terms cover at minimum:

- project and brief version;
- participant role;
- named/approved collaborator set or explicit collaborator-approval rule;
- boundaries/exclusions;
- compensation terms;
- revenue/fee model proposal where relevant;
- distribution scope;
- usage/rights scope;
- schedule/delivery expectation;
- cancellation/withdrawal rules;
- final-cut/approval requirements as applicable.

### 9.3 Consent package

For a depicted performer, valid consent is personal to the verified V3 participant and references the exact project/brief/terms version. An agency or project owner can prepare/manage the workflow but cannot execute performer consent.

### 9.4 Material changes

Material changes include at minimum participant role, depicted boundaries/acts, collaborator set where approval is required, compensation, distribution scope, rights scope or other Blueprint-defined sensitive terms. A material change reopens affected consent/acceptance. Non-material presentation metadata may remain editable where explicitly allowed.

### 9.5 Acceptance security

Contract/consent acceptance requires:

- authenticated current session;
- required workspace/resource relationship;
- required V2/V3 verification state;
- no relevant restriction/freeze;
- step-up confirmation suitable to the current app security capability;
- immutable acceptance receipt with accepted version hash/reference, timestamp and actor;
- idempotent write.

### 9.6 Contract lock

A project may enter `contract_locked` only when every required collaborator/performer acceptance and consent obligation for the funding version is satisfied. Direct database editing may not bypass this transition.

## 10. Slice 9 — Campaign Publishing and Pre-booking

### 10.1 Goal

Make a compliant project publicly fundable only after verification/consent/campaign eligibility gates pass.

### 10.2 Routes

- `/studio/projects/[publicId]/campaign`
- `/p/[publicId]`
- `/app/funding/[publicId]` or equivalent campaign checkout route

### 10.3 Campaign eligibility

Before campaign submission/publication, server/database rules verify:

- project ownership and valid state;
- creator/producer verification required for publishing;
- all depicted participants required for this campaign are V3 and current;
- required collaborator terms/consent for the campaign version are accepted;
- project is not frozen/restricted;
- declared content/category is eligible for the configured payment environment;
- campaign terms are complete.

### 10.4 Campaign terms

Public campaign projection includes:

- project title/synopsis using public-safe fields;
- creator stage name;
- funding target and currency;
- current eligible funded/authorized amount based on actual payment state;
- supporter count based on actual eligible records;
- deadline;
- tier/access promise where used;
- expected delivery window;
- what is guaranteed vs optional;
- collaborator/public participation projection only where permitted;
- refund/failure/material-change rules;
- buyer visibility/badge choice;
- creator-approved voting choices only.

No fake countdown, fake backers, invented amount or hidden condition is permitted.

### 10.5 Pre-book model

A pre-book creates a durable funding commitment record tied to an idempotency key and the exact campaign terms version. The checkout action must say what it actually does (for example `Confirm pre-book`, `Authorize X`, or `Pay X`) based on the configured adapter behavior.

## 11. Slice 10 — Fan Funding Dashboard and Badges

### 11.1 Goal

Give fans a truthful, private dashboard for their pre-book/funding state while establishing the payment adapter boundary required for later full financial infrastructure.

### 11.2 Routes

- `/app/funding`
- `/app/funding/[publicId]`
- existing account/privacy surfaces extended only where required for supporter visibility/badge settings

### 11.3 Dashboard states

Tabs/filters include:

- Active;
- Successful;
- In production (state projection may be empty until Slice 11 exists);
- Delivered (state projection may be empty until Slice 13 exists);
- Refunded;
- All.

No future state is fabricated. Empty states explain which later lifecycle stage has not yet occurred.

### 11.4 Funding commitment record

Each funding/pre-book record contains internal relationships plus a safe public-facing identifier and references:

- fan;
- campaign;
- exact campaign terms version;
- payment adapter transaction reference stored privately;
- requested/authorized/captured/refunded amount state as applicable;
- currency;
- supporter visibility choice;
- badge choice/state;
- current refund/material-change state;
- timestamps and idempotency keys.

### 11.5 Payment adapter

The application-level payment adapter exposes:

- `createCustomer`
- `tokenizePaymentMethod`
- `authorizeOrCharge`
- `capture`
- `refund`
- `verifyWebhook`
- `getTransaction`

A deterministic sandbox adapter is used for CI/development. Production funding fails closed unless a reviewed provider configuration is enabled. No raw card data is stored by LUX.

### 11.6 Payment safety

- every payment write has an idempotency key;
- provider callbacks/webhooks are authenticated before state changes;
- duplicate/reordered callbacks cannot duplicate commitment state;
- refunds are idempotent;
- staff/user boundaries remain separate;
- private processor IDs are not exposed publicly;
- this slice does not claim the complete immutable double-entry ledger/revenue-split/payout system, which remains Slice 14.

### 11.7 Material change/refund UX

If campaign terms materially change after a fan commitment where policy permits revision:

- dashboard shows old vs new relevant terms;
- user can accept the revised terms or request the permitted refund path;
- no silent acceptance;
- badge/supporter visibility consequences are shown before refund confirmation;
- cancellation/refund reasons and resulting state are auditable.

## 12. Cross-slice state model

The marketplace lifecycle implemented by this run is:

`Demand → Creator interest → Project draft → Collaboration invitation → Terms/consent → Contract lock → Campaign review → Funding open → Fan pre-book/funding commitment`

Future states remain blocked placeholders only in state vocabulary/read models:

`Production → Delivery review → Release → Library delivery → Ledger settlement/payout → Rights operations`

No UI may imply those future workflows are implemented.

## 13. Notification model

Extend the accepted notification system with recipient-only, block-aware deep-link events where another actor must respond, including eligible examples:

- creator demand interest/response where privacy permits;
- invitation received/updated;
- terms changed/acceptance required;
- consent action required;
- campaign review/state change visible to owner;
- funding commitment/refund/material-change action.

Blocked actor suppression and recipient-only RLS remain permanent invariants.

## 14. Data/privacy boundaries

The run introduces several data sensitivity classes:

**Public:** safe creator stage profile projection, public demand fields, public project/campaign projection, aggregate counts derived from eligible records.

**Private account:** follows/interests, funding history, supporter visibility settings, invitation messages, private project brief.

**Restricted identity/consent:** legal identity, verification evidence/provider references, performer record, consent/contract acceptance evidence.

**Restricted financial:** processor/customer/transaction references, payment method tokens, refund records.

Restricted records require purpose-limited server/database access and must never appear in CI screenshots/logs or public projections.

## 15. Failure and concurrency behavior

Every user-facing durable action must have:

- validation state;
- disabled/loading duplicate-click protection;
- transaction/idempotency enforcement beneath the UI;
- safe failure message that preserves user input when possible;
- refresh-safe resulting state;
- audit event for material changes;
- correlation-safe diagnostics without secrets/private evidence.

Concurrency tests must include stale project edits, duplicate support, duplicate invitations, simultaneous invitation transitions, repeated contract acceptance, simultaneous campaign submission, repeated pre-book calls, duplicate/reflected webhooks and repeated refunds.

## 16. Testing strategy

### 16.1 Per-slice gate

Each slice must add all applicable layers before the next slice starts:

1. failing domain/unit tests;
2. minimal implementation;
3. unit regression green;
4. database schema/RLS/state-machine tests;
5. server/action/API tests where applicable;
6. desktop Playwright journey;
7. mobile Playwright journey;
8. adversarial cross-role/direct-RPC/direct-URL tests;
9. full `verify:full` Engineering Gate against the cumulative branch;
10. evidence checkpoint with exact branch head.

### 16.2 Permanent regressions added by this run

At minimum protect against:

- blocked/private content appearing in feed/search;
- recommendation pagination duplicates or unstable ordering;
- users self-awarding verification;
- identity/verification evidence leakage;
- fan support implying creator commitment;
- public creator decline leakage;
- stale project draft overwrite;
- agency acceptance being treated as performer consent;
- consent surviving a material terms change without renewal;
- contract lock with missing required acceptance;
- campaign publication with missing verification/consent;
- duplicate pre-book/funding record;
- forged/duplicate webhook changing money state twice;
- raw card/private processor data exposure;
- silent campaign-term acceptance;
- refund duplication;
- Slices 1–3 auth/privacy/notification regressions.

## 17. Owner handoff after Slice 10

Only after Slice 10 cumulative automated acceptance is green, generate one combined visible handoff proving the natural owner journey:

1. Feed/explore/search privacy and mobile/desktop behavior.
2. Creator/performer verification test mode and fail-closed production mode labels.
3. Fan creates/supports demand; named creator remains uncommitted.
4. Creator expresses interest and converts demand to project draft.
5. Project draft persists/autosaves and handles stale-tab conflict safely.
6. Invite collaborator; recipient asks question/counters/accepts or declines quietly.
7. V3 performer personally accepts exact consent/terms; agency cannot do it for them.
8. Material terms change visibly reopens consent.
9. Contract locks only after all required acceptances.
10. Campaign cannot publish while a gate is incomplete; eligible campaign publishes with truthful target/deadline/refund/access terms.
11. Fan pre-books through sandbox payment flow with explicit action text and no duplicate charge/commitment on double-click.
12. Funding dashboard shows exact state, supporter anonymity/badge behavior, material-change comparison and idempotent refund.
13. Cross-role/direct-route attempts remain denied and no restricted identity/payment data appears in public views.

The handoff is owner-facing only; automated evidence never marks these checks as owner-passed.

## 18. Documentation reconciliation

Before or during Slice 4, reconcile stale repository status text so accepted `main` truth is Slices 0–3 complete and Slice 4 active. As each slice is accepted on the branch, update:

- `docs/engineering/PROJECT-PROFILE.md`;
- `docs/engineering/PROJECT-TEST-MATRIX.md`;
- `docs/engineering/REGRESSION-REGISTER.md`;
- slice-specific closure/evidence records;
- `README.md` current status;
- `docs/product/00_CANONICAL_PROJECT_LOCK.md` current-position text only where it is stale, without changing the binding product constitution.

## 19. Explicit deferrals

This run does not implement or claim completion of:

- production/live streaming;
- production content uploads and production workspace (Slice 11);
- delivery/platform final review (Slice 12);
- secure release/fan media library (Slice 13);
- full double-entry ledger, revenue splits and payouts (Slice 14);
- copyright/stolen-content operations (Slice 15);
- full agency workspace (Slice 16);
- complete moderation/admin/launch hardening (Slice 17);
- mature recommendations/ML, memberships, communities or other Milestone 2 systems.

## 20. Completion rule

Slices 4–10 are complete only when:

- every slice-specific cumulative Engineering Gate is green on its exact accepted branch head;
- the final Slice 10 head preserves all prior accepted regressions;
- production-required external providers that are unavailable are truthfully fail-closed rather than mocked as production;
- the combined owner handoff is completed successfully;
- the final PR is merged with expected-head protection;
- merged `main` is verified to contain the tested accepted tree or receives an equivalent required post-merge gate.
