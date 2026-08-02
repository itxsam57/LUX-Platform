# LUX Build Sequence

## Rule

LUX is built one independently testable vertical slice at a time. Each slice includes interface, server behavior, database rules, security, audit events, notifications, automated tests, staging deployment, and product-owner acceptance.

No later slice may be used to excuse a broken earlier slice.

## Slice 0 — Repository and quality foundation

Purpose: establish a codebase that can be installed, checked, built, tested, and deployed predictably.

Deliverables:

- monorepo/workspace structure;
- Next.js application shell;
- strict TypeScript;
- environment configuration contract;
- CI checks;
- health endpoint;
- error and not-found states;
- initial design-system preview;
- pull-request and bug templates;
- canonical product, engineering, and testing documents.

Acceptance gate:

- fresh clone installs successfully;
- typecheck, lint, tests, and build run in CI;
- `/`, `/design-system`, `/health`, and unknown routes behave correctly;
- no secret is committed;
- mobile and desktop shell render correctly.

## Slice 1 — Design system and application shell

Purpose: build the shared visual and interaction primitives before dashboards.

Deliverables:

- color, typography, spacing, elevation, radius, and motion tokens;
- Button, IconButton, LinkButton, Input, Select, Checkbox, Radio, Switch, Textarea, FilePicker, Badge, Avatar, Card, Tabs, Table, Pagination, EmptyState, ErrorState, Skeleton, Toast, Dialog, Drawer, Tooltip, Menu, Breadcrumb, Stepper, and Status components;
- desktop sidebar and top bar;
- mobile bottom navigation and contextual header;
- responsive content container;
- route loading and error boundaries;
- accessible keyboard and focus behavior;
- component catalogue with all states.

Acceptance gate:

- every primitive is keyboard usable;
- disabled controls explain unavailability where needed;
- contrast and touch-target checks pass;
- component states are visible in the catalogue;
- no dashboard-specific logic exists in shared primitives.

## Slice 2 — Authentication, age assurance, and workspace isolation

Purpose: establish identity, adult access, sessions, and role-safe workspace routing.

Deliverables:

- account registration and login;
- email verification and password recovery;
- session management and logout-all-devices;
- viewer age-assurance gate;
- role request and approval model;
- active workspace selection;
- protected routes;
- server authorization helper;
- database row-level security baseline;
- audit events for login, logout, role activation, and denied access.

Acceptance gate:

- fan cannot access creator or staff routes;
- creator cannot access staff routes;
- changing a URL does not bypass authorization;
- refresh, direct route, back, forward, and expired session behave correctly;
- role switching changes active context without merging permissions;
- denied actions are logged without exposing private details.

## Slice 3 — Profiles and privacy

Purpose: create public and private account identity without exposing sensitive data.

Deliverables:

- fan profile;
- creator profile shell;
- display name, handle, bio, avatar, banner, links, language, and visibility controls;
- anonymous supporter option;
- follow/unfollow;
- block and mute;
- privacy settings;
- profile preview;
- account export and deletion-request entry points.

Acceptance gate:

- private fields never appear in public responses;
- blocked users cannot interact through alternate routes;
- follow counts update without refresh;
- anonymous supporter choices are respected across campaign and badge views;
- profile edits survive refresh and concurrent sessions.

## Slice 4 — Feed and discovery

Purpose: deliver a fast, clear discovery experience using safe metadata and previews.

Deliverables:

- Home feed;
- Following feed;
- Explore;
- search;
- creator, campaign, release, and demand cards;
- filters and sort;
- saved items;
- pagination or cursor-based infinite loading;
- report and hide actions;
- lightweight recommendation baseline.

Acceptance gate:

- feed order is deterministic for a given cursor;
- no duplicate cards appear after loading more;
- hidden or blocked content disappears consistently;
- filters persist in the URL;
- back navigation restores position;
- media loads progressively and does not autoplay unexpectedly.

## Slice 5 — Creator and depicted-person verification

Purpose: verify adults and establish reusable but privacy-preserving identity records.

Deliverables:

- creator onboarding;
- identity and age-verification adapter;
- depicted-person record;
- verification case states;
- document and selfie evidence references;
- review queue;
- expiry and reverification;
- privacy-limited status display.

Acceptance gate:

- unverified creators cannot publish paid or depicted content;
- evidence is private and accessible only to authorized staff;
- reviewer sees the correct person and evidence;
- applicant sees state changes without refresh;
- rejected and expired cases provide safe next steps;
- one person’s evidence cannot appear in another case.

## Slice 6 — Crowd Demand Board

Purpose: let fans express demand without turning demand into an obligation.

Deliverables:

- create demand request;
- choose category, concept, optional script outline, budget signal, and desired creators;
- safe public summary;
- vote/support;
- comments or structured suggestions;
- creator interest, decline, or ignore;
- demand status and moderation;
- conversion from accepted demand to creator-owned project draft.

Acceptance gate:

- creator decline is quiet and final unless creator reopens it;
- fans cannot repeatedly invite or harass a declining creator;
- votes do not create contracts or payment obligations;
- demand conversion copies only approved information;
- unsafe or illegal requests enter moderation before publication.

## Slice 7 — Project drafts and collaboration invitations

Purpose: allow a creator/producer to define a production and invite collaborators voluntarily.

Deliverables:

- project draft wizard;
- title, synopsis, script version, roles, collaborators, boundaries, budget, schedule, distribution, and rights fields;
- invite performer, writer, producer, editor, or agency;
- accept, decline, negotiate, or expire;
- private negotiation thread;
- versioned offer terms;
- readiness checklist.

Acceptance gate:

- only project owners and authorized team members can edit;
- invitees see exact role and terms;
- decline never exposes a reason publicly;
- edits to material terms invalidate affected acceptances;
- expired or withdrawn invitations cannot be accepted;
- duplicate clicks do not create duplicate invitations.

## Slice 8 — Contracts, consent, and boundaries

Purpose: lock agreed terms and personal consent before production.

Deliverables:

- contract template and version;
- personal consent record per depicted person;
- accepted script hash;
- accepted collaborator list;
- boundaries and prohibited acts;
- compensation and revenue split;
- territory, duration, and distribution scope;
- cancellation, withdrawal, revision, and final-cut terms;
- signature/evidence workflow;
- re-consent after material change.

Acceptance gate:

- agency cannot sign personal consent for a performer;
- unsigned or invalidated consent blocks production readiness;
- every signer sees the exact version signed;
- material change creates a new required approval;
- signed evidence is immutable and auditable;
- withdrawal and dispute rules follow the contract state.

## Slice 9 — Campaign publishing and pre-booking

Purpose: publish a fundable campaign only after legal and collaboration readiness.

Deliverables:

- campaign setup wizard;
- funding target, deadline, tiers, quantities, delivery estimate, refund rule, preview media, and risk notice;
- pre-publication review;
- campaign page;
- pre-book checkout;
- adult-capable payment adapter;
- restricted-funds ledger entries;
- funding progress and supporter privacy.

Acceptance gate:

- campaign cannot publish without required verified people and agreements;
- payment retries are idempotent;
- failed payment does not create entitlement or funding total;
- supporter anonymity is respected;
- campaign success does not release funds;
- cancellation and failed-goal refunds reconcile correctly.

## Slice 10 — Fan funding dashboard and badges

Purpose: give supporters clear ownership of their orders, access promises, badges, and privacy.

Deliverables:

- funded projects;
- order detail;
- receipt and payment state;
- campaign updates;
- refund state;
- supporter badge rules;
- public/private badge choice;
- saved and followed projects;
- notification deep links.

Acceptance gate:

- badge appears only after the qualifying ledger event;
- refunded or reversed orders update badge eligibility;
- private support remains private;
- every notification opens the exact relevant record;
- totals match the ledger, not cached UI values.

## Slice 11 — Production workspace

Purpose: manage delivery after funding without exposing private production assets.

Deliverables:

- production timeline;
- milestones;
- team tasks;
- secure script and media files;
- update posts;
- delay and risk notices;
- collaborator approvals;
- production status;
- controlled supporter updates.

Acceptance gate:

- fans see only approved campaign updates;
- private production assets use signed access;
- task permissions follow project role;
- delayed status and revised estimate are auditable;
- a collaborator removed from the project loses access immediately.

## Slice 12 — Delivery and platform review

Purpose: receive the final production and complete structured legality, consent, copyright, and quality review.

Deliverables:

- final upload with version hash;
- media processing state;
- final-cut approval per required depicted person;
- structured review case;
- reviewer checklist;
- approve, reject, request changes, escalate, and hold;
- decision notes;
- creator response and resubmission;
- release-readiness state.

Acceptance gate:

- reviewer sees correct project, people, contracts, files, and evidence;
- creator sees the same canonical status;
- no review disappears from either side;
- a changed final file invalidates prior final-cut approvals;
- review cannot approve while blocking items remain;
- every decision is reasoned and audited.

## Slice 13 — Secure release and fan library

Purpose: release approved media to entitled viewers through controlled playback.

Deliverables:

- release record;
- entitlement generation;
- fan library;
- secure player;
- signed playback sessions;
- device/session limits;
- poster and preview assets;
- rating and review eligibility;
- report stolen copy;
- release page on creator and collaborator profiles.

Acceptance gate:

- non-entitled user cannot play media through UI or direct URL;
- expired tokens fail safely;
- revoked or refunded entitlement is enforced;
- playback does not expose permanent object URLs;
- release metadata matches approved version;
- ratings require valid entitlement and release state.

## Slice 14 — Ledger, revenue splits, and payouts

Purpose: convert approved release value into transparent earnings and controlled payouts.

Deliverables:

- chart of accounts;
- balanced journal entries;
- revenue split engine;
- platform fee;
- processing fee;
- agency share;
- creator and collaborator earnings;
- reserves, refunds, and chargebacks;
- available versus pending balance;
- monthly payout batch;
- payout adapter and reconciliation;
- downloadable statements.

Acceptance gate:

- every journal balances;
- payout cannot exceed available balance;
- duplicate webhook or payout request has no duplicate effect;
- participant views match the same journal;
- disputes and reserves hold affected amounts;
- provider reconciliation differences create an operations case.

## Slice 15 — Copyright and stolen-content operations

Purpose: preserve rights evidence and operate a realistic detection and takedown workflow.

Deliverables:

- rights registry;
- ownership and licence evidence;
- cryptographic and perceptual fingerprints;
- watermark job records;
- leak report;
- suspected source/session matching;
- infringement case;
- evidence package;
- notice generation and submission tracking;
- removal confirmation;
- recurrence monitoring;
- repeat-infringer policy.

Acceptance gate:

- product never claims universal deletion;
- rights owner can see each case stage;
- staff access to evidence is scoped and audited;
- false-positive and counter-notice paths exist;
- deleted or removed links remain historically recorded without being publicly exposed;
- purchaser identity is not disclosed to creators without authorized process.

## Slice 16 — Agency workspace

Purpose: allow approved agencies to manage representation without replacing performer autonomy.

Deliverables:

- agency verification;
- staff and roles;
- performer representation invitation;
- scope and commission agreement;
- opportunities and negotiations;
- project and contract administration;
- earnings and statements;
- access revocation;
- performer-visible activity log.

Acceptance gate:

- performer personally accepts representation;
- agency permissions match agreed scope;
- agency cannot consent or final-cut approve for performer;
- performer can revoke representation according to contract;
- agency commission comes from explicit ledger rules;
- cross-agency tenant isolation passes.

## Slice 17 — Administration and launch hardening

Purpose: complete operational control and prove the entire platform works safely as one system.

Deliverables:

- super-admin overview;
- user, role, verification, project, campaign, moderation, review, copyright, finance, payout, support, and configuration queues;
- scoped staff permissions;
- operational search;
- audit explorer;
- incident and legal-hold controls;
- rate limits and abuse controls;
- backup and recovery test;
- full browser regression suite;
- staging-to-production release checklist;
- public legal and help pages.

Acceptance gate:

- all earlier slice acceptance suites remain green;
- staff roles cannot cross into unauthorized queues;
- critical actions require confirmation and reasons;
- audit history cannot be edited;
- backup restoration is demonstrated;
- release candidate passes product-owner end-to-end testing;
- no unresolved critical or high-severity issue remains.

## Milestone mapping

Milestone 1 consists of Slices 0–17 and produces a safe, revenue-ready web platform with core crowdfunding, collaboration, production, review, release, ledger, payout, moderation, and baseline copyright protection.

Milestone 2 begins only after real Milestone 1 usage validates the core model. It adds memberships, richer communities, live experiences, advanced production tools, per-session forensic watermarking, DRM integrations, scheduled rights monitoring, mature recommendations, regional expansion, mobile apps where distribution rules permit, and advanced agency capabilities.
