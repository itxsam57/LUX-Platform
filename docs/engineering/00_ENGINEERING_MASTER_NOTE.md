# LUX Engineering Master Note

## Status

Canonical engineering contract for the LUX Platform. This document governs implementation, testing, review, and release unless the product owner explicitly approves a revision.

## Product definition

LUX is an adult-only, crowd-demanded and crowdfunded creator marketplace. Fans may express demand, vote, pre-book, fund, follow, review, and purchase. They never obtain control over a creator or performer.

Every creator and depicted person must independently choose:

- whether to participate;
- which project and role to accept;
- which collaborators are acceptable;
- which acts, scenes, boundaries, and distribution terms are acceptable;
- what compensation and revenue split are acceptable;
- whether a submitted final cut may be released.

An agency may negotiate or administer work but may never replace personal performer consent.

## Non-negotiable engineering invariants

1. Crowd demand never creates a performer obligation.
2. Successful funding never authorizes production, release, or payout by itself.
3. Restricted campaign money remains separated from platform operating revenue until the contractual release conditions are satisfied.
4. A payout requires completed delivery, legality review, identity and age verification, consent verification, copyright review, quality review, contract completion, and no unresolved blocking dispute.
5. Every depicted adult must have a verified identity, verified age, project-specific consent, release terms, and a retained evidence record.
6. Every privileged action requires server-side authorization. Client-side hiding is never security.
7. Every tenant- or role-owned record must be protected at route, service, API, database, storage, and test layers.
8. Financial balances come from an immutable double-entry ledger, not editable total fields.
9. Material actions create immutable audit events.
10. No button may exist as decoration. A visible action must have a documented purpose, permission, command, state transition, feedback state, audit effect, and test.
11. No completed operation may require a manual refresh to become visible.
12. Uploaded evidence must remain linked to the correct project, user, form, version, and review case.
13. Reviewer and submitter views must derive from the same canonical record and state machine.
14. Duplicate submissions, payments, webhooks, approvals, and payouts must be idempotent.
15. Production secrets, identity evidence, consent files, financial details, and unreleased media must never be placed in public source code or public storage.

## Build strategy

The application is built through independently testable vertical slices. Each slice includes the user interface, domain rules, database schema, row-level security, storage policy, server commands, notifications, audit events, automated tests, staging deployment, and product-owner acceptance.

A slice is not complete because its screens look correct. It is complete only when every specified workflow works through the full stack and survives refresh, direct URL entry, retries, slow networks, duplicate clicks, denied permissions, and cross-role attack tests.

The next slice does not begin while the current slice has unresolved critical or high-severity defects.

## Source hierarchy

When requirements conflict, follow this order:

1. Product Constitution.
2. This Engineering Master Note.
3. Trust, safety, legal, consent, and financial invariants.
4. Approved workflow and state-machine documents.
5. Screen and button specification.
6. Current implementation.

Code never silently overrides a higher source. A conflict must be documented and resolved before merge.

## Change-control rule

Every change that affects consent, identity, age assurance, privacy, payments, release rights, moderation, copyright, or security requires:

- a written reason;
- impacted states and workflows;
- migration and rollback analysis;
- updated tests;
- product-owner acceptance.

## Definition of ready

A build slice is ready for coding only when:

- its purpose and user outcome are explicit;
- roles and permissions are enumerated;
- page routes and navigation entry points are defined;
- every action has a stable action ID;
- states, transitions, validation, failure behavior, notifications, and audit events are defined;
- database ownership and retention are defined;
- acceptance tests are written before implementation.

## Definition of done

A slice is done only when:

- strict type checks pass;
- lint and formatting checks pass;
- unit, integration, database, security, browser, accessibility, and regression tests pass;
- all routes work without manual refresh;
- direct URL and back/forward navigation work;
- mobile and desktop states are tested;
- empty, loading, success, failure, denied, expired, and retry states are visible and usable;
- audit records and notifications are verified;
- staging deployment is stable;
- the product owner signs the acceptance checklist.

## Repository rules

- `main` represents the latest accepted baseline.
- Feature work occurs on a dedicated branch named `slice/<number>-<name>` or `fix/<issue>-<name>`.
- Pull requests must reference blueprint sections and include test evidence.
- No direct production hotfix may bypass documentation and regression tests.
- Database migrations are append-only after deployment. Never rewrite an applied migration.
- Generated files, secrets, private evidence, and real personal data are never committed.

## Architecture direction

The initial implementation uses:

- Next.js App Router and TypeScript for the web application;
- PostgreSQL and row-level security through Supabase-compatible infrastructure;
- private object storage through a replaceable storage adapter;
- replaceable adapters for adult-capable payments, age assurance, identity verification, email, notifications, media processing, watermarking, and rights monitoring;
- background jobs for processing tasks that do not belong in an interactive request;
- an outbox pattern for reliable events and notifications;
- signed, short-lived media access rather than public media URLs.

No provider-specific detail may leak through the product domain. Payment, verification, storage, and media providers must be replaceable behind typed interfaces.

## Role isolation

A user may hold multiple approved roles, but every privileged workspace is explicit. Switching workspaces changes the active authorization context; it does not merge permissions.

Examples:

- a fan cannot reach creator Studio routes without an approved creator role;
- a creator cannot reach staff review queues;
- an agency representative cannot approve consent on behalf of a performer;
- a moderator cannot alter ledger balances;
- finance staff cannot view private media unless a separately authorized case requires it;
- super-admin access must be limited, audited, and used only for defined administrative operations.

Every access test must include allowed and denied cases.

## State-machine rule

Material objects use explicit state machines. A state cannot be changed by arbitrary database updates or local UI state.

Examples include:

- creator verification;
- invitations and negotiations;
- consent;
- project readiness;
- campaigns;
- orders and payment attempts;
- production delivery;
- release review;
- entitlements;
- disputes;
- infringement cases;
- payout batches.

Every transition records actor, time, prior state, next state, reason, request ID, and relevant evidence.

## UI action rule

Every interactive control must be documented with:

- stable action ID;
- exact location;
- visible label and icon;
- purpose;
- allowed roles;
- prerequisites;
- confirmation requirements;
- command or navigation target;
- optimistic or pessimistic behavior;
- loading, success, failure, denied, and retry states;
- database and event effects;
- notification and audit effects;
- test cases.

A disabled button must explain why it is unavailable. Hidden actions are used only when exposing the action itself would create confusion or security risk.

## Data ownership

Every record has one or more explicit owners:

- account owner;
- creator or performer owner;
- project owner;
- agency organization;
- campaign;
- order purchaser;
- moderation case;
- financial account;
- staff scope.

Ownership columns and authorization policies must be introduced with the table, not added later.

## File and evidence handling

Files are never trusted because of their extension or browser-provided MIME type. Uploads require:

- allow-listed type and size;
- server-side inspection;
- checksum;
- isolated object path;
- malware scanning where applicable;
- ownership and purpose metadata;
- version linkage;
- immutable evidence references for signed consent and review decisions;
- signed access with short expiry;
- complete deletion or legal-hold workflow.

Selecting a file in one form must never populate another form. The form owns its local selection until a successful upload returns a persistent file ID.

## Financial integrity

Money movement is modeled through journal entries. Campaign totals, creator earnings, platform revenue, refunds, reserves, chargebacks, agency shares, and payouts are derived from balanced entries.

Required controls include:

- idempotency key per charge, webhook, refund, split, and payout;
- provider-event signature verification;
- immutable provider-event storage;
- reconciliation jobs;
- restricted and available balance separation;
- payout holds for disputes, chargebacks, and verification problems;
- clear gross, fees, refunds, reserves, tax withholding, and net values.

The UI must never display money as available before the ledger says it is available.

## Consent and final-cut approval

Consent is versioned and project-specific. A performer must see the accepted script version, collaborator list, boundaries, compensation, distribution scope, and withdrawal/cancellation terms before signing.

A material project change invalidates affected approvals and blocks production or release until new approval is recorded.

Where final-cut approval is contractually required, release remains blocked until every required depicted person approves the exact media version hash.

## Moderation and release review

Release review is a structured case, not a single approve button. Reviewers must inspect:

- project and contract readiness;
- depicted-person records;
- identity and age evidence status;
- consent and final-cut approvals;
- copyright ownership and licences;
- prohibited or illegal content indicators;
- technical quality requirements;
- metadata and release territories;
- unresolved reports or disputes.

Reviewer decisions require a reason and create an audit event. A reviewer may approve, reject, request changes, escalate, or place a temporary hold according to permission.

## Copyright and stolen-content response

LUX cannot promise universal remote deletion of stolen copies. The product must accurately provide:

- timestamped rights records;
- file and perceptual fingerprints;
- controlled streaming;
- visible and invisible watermarking;
- purchaser- or session-specific forensic marks where feasible;
- leak reports;
- evidence packages;
- takedown workflows;
- repeat-infringer handling;
- re-upload monitoring on supported sources.

The system must distinguish detection, evidence, notice submission, host response, removal confirmation, and recurrence monitoring.

## Performance and cost discipline

The platform must remain usable on ordinary mobile devices and slow networks.

Rules:

- server-render the shell and public metadata where appropriate;
- load media only when needed;
- generate responsive images and posters;
- avoid autoplay unless explicitly permitted and visible;
- virtualize or paginate long lists;
- use skeletons without hiding failures;
- keep client JavaScript small;
- process expensive media and scanning asynchronously;
- avoid always-on infrastructure until measured usage requires it;
- record cost-driving operations.

## Observability

Every request and background job carries a correlation ID. Logs must be structured and must not contain secrets, raw identity evidence, private messages, full payment details, or unreleased media URLs.

Required operational signals include:

- error rate and latency;
- failed auth and denied access;
- upload and processing failures;
- payment and webhook failures;
- unbalanced journal detection;
- release-review backlog;
- moderation and urgent safety backlog;
- payout reconciliation failures;
- storage and media-processing cost.

## Incident rule

Security, consent, identity, illegal-content, financial, or privacy incidents override the normal roadmap. The incident is contained, logged, investigated, repaired, and covered by a permanent regression test before normal feature work resumes.

## Historical regression checkpoint

The following failure classes are permanently prohibited because they occurred in earlier projects:

- URL changes while the displayed page remains stale;
- manual refresh required after navigation or approval;
- cross-role dashboard access;
- visual buttons that do not complete backend work;
- evidence uploaded by one user but absent for the reviewer;
- reviewer completion not reflected to the submitter;
- files leaking between forms;
- PDFs or valid media failing silently;
- text lost after route changes or refresh;
- notification items that do not open the relevant record;
- back buttons entering another role workspace;
- duplicate records from repeated clicks;
- one side showing pending forever after the other side completed the case;
- disappearing review records;
- white screens or swallowed errors.

Every vertical slice must explicitly test relevant items from this list.
