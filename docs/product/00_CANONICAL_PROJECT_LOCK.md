# LUX Canonical Project Lock

**Status:** Binding source of truth unless the product owner explicitly changes it.
**Working name:** LUX. This is a code name, not the final public brand.
**Product type:** Adult-only, privacy-first, crowd-demanded and crowdfunded creator marketplace.

## 1. Finished product goal

LUX allows adult fans to signal demand, vote on creator-approved choices, pre-book productions, fund agreed projects, securely access completed releases, follow creators, rate eligible releases, and participate in communities.

Creators, performers, writers, producers, editors, and agencies can discover opportunities, propose projects, negotiate terms, execute project-specific contracts, produce content, submit delivery evidence, receive platform review, release approved work, and receive transparent earnings.

LUX is not a platform where fans buy control over a person. It is a marketplace where audiences fund opportunities and creators voluntarily decide whether to participate.

## 2. Non-negotiable product constitution

1. **Crowd-demanded, never crowd-controlled.** Fan votes show demand but never override creator or performer choice.
2. **Voluntary participation.** Every creator and performer can accept, decline, ignore, counter, or leave an invitation before contract lock.
3. **Personal performer consent.** Agencies may negotiate but cannot consent for a performer.
4. **Project-specific consent.** Consent must cover the exact role, collaborators, boundaries, compensation, distribution, and final-cut approval requirements.
5. **Verified adults only.** Viewers require jurisdiction-appropriate age assurance. Creators and depicted persons require strict identity and age verification.
6. **Privacy by default.** Legal identities, purchases, earnings, private collaboration records, and verification material are hidden unless disclosure is required by law or explicitly chosen.
7. **No payout on upload alone.** Funds remain restricted until delivery and all required legality, consent, copyright, quality, and platform reviews pass.
8. **No unreviewed release.** Content cannot become publicly available or payable merely because a file was uploaded.
9. **Transparent financial records.** Balances come from an immutable double-entry ledger; revenue splits, fees, reserves, refunds, chargebacks, and payouts remain auditable.
10. **No universal deletion promise.** LUX cannot remotely erase every stolen copy from the internet. It uses rights records, fingerprints, controlled delivery, forensic watermarking, leak tracing, monitoring, evidence packages, and takedown workflows.
11. **Replaceable providers.** Payments, age/identity verification, storage, streaming, moderation, and media protection must use adapters so one provider cannot trap the platform.
12. **No visual-only features.** Every visible action must complete a real authorized workflow, persist correctly, update all relevant workspaces, and survive refresh.

## 3. Canonical two-milestone product plan

### Milestone 1 — Safe revenue-ready web platform

Milestone 1 must produce a launchable web product with:

- public discovery and creator profiles;
- fan accounts, privacy controls, follows, voting, pre-booking, purchases, library, badges, ratings, notifications, messages, orders, disputes, and wallet records;
- creator and performer onboarding, identity/age verification, profiles, availability, offers, negotiation, contracts, consent, boundaries, collaboration, project creation, production, upload, delivery review, earnings, and payouts;
- writer, producer, editor, and agency collaboration workflows;
- Crowd Demand Board with creator-controlled response options;
- campaigns, tiers, funding goals, deadlines, restricted project funds, refunds, and chargeback handling;
- project-specific contracts and depicted-person consent records;
- platform legality, identity, consent, copyright, safety, and quality review before release or payout;
- secure streaming and entitlement checks;
- double-entry ledger, revenue splits, platform fees, reserves, monthly payouts, and audit history;
- moderation, reports, appeals, disputes, and staff operations;
- baseline copyright registry, upload hashes, fingerprints, visible/invisible watermark support, infringement reporting, evidence packages, and takedown tracking;
- complete fan, creator, performer, agency, moderator, finance, copyright, support, and super-admin workspaces;
- low-idle-cost deployment architecture.

Milestone 1 is not complete when screens merely look finished. It is complete when the whole critical path works with real persistence, permissions, review, audit, recovery, and tests.

### Milestone 2 — Scale, communities, advanced production, and rights protection

Milestone 2 adds:

- memberships and recurring creator offerings;
- advanced communities, supporter groups, premieres, live events, and deeper fan participation;
- mature creator studio and collaborative production tooling;
- advanced agency team permissions, roster operations, negotiation controls, and reporting;
- per-session or per-viewer forensic watermarking;
- stronger DRM and playback controls;
- scheduled rights monitoring and re-upload detection;
- recommendation and personalization systems;
- mature analytics and conversion intelligence;
- regional payment, tax, compliance, language, and policy scaling;
- stronger fraud, risk, and abuse detection;
- broader creator monetization, licensing, and distribution options.

Milestone 2 must extend Milestone 1 without weakening consent, privacy, payment review, auditability, or provider independence.

## 4. Canonical engineering sequence

Implementation proceeds in independently testable vertical slices:

0. Repository and quality foundation
1. Design system and application shell
2. Authentication, age assurance, and workspace isolation
3. Profiles and privacy
4. Feed and discovery
5. Creator and depicted-person verification
6. Crowd Demand Board
7. Project drafts and collaboration invitations
8. Contracts, consent, and boundaries
9. Campaign publishing and pre-booking
10. Fan funding dashboard and badges
11. Production workspace
12. Delivery and platform review
13. Secure release and fan library
14. Ledger, revenue splits, and payouts
15. Copyright and stolen-content operations
16. Agency workspace
17. Administration and launch hardening

No later slice begins until the current slice passes automated gates, engineering review, and product-owner acceptance.

## 5. Build and testing law

Every slice must include, where applicable:

- strict TypeScript;
- lint with zero warnings;
- unit tests for domain logic;
- API and schema contract tests;
- database constraints and migration tests;
- Row Level Security allow-and-deny tests;
- integration tests across workspaces;
- browser end-to-end tests on desktop and mobile;
- refresh, back/forward, reload, and network-recovery tests;
- duplicate-click and idempotency tests;
- cross-role and cross-tenant attack tests;
- storage ownership and evidence-visibility tests;
- notification deep-link tests;
- audit-event verification;
- accessibility checks;
- manual acceptance by the product owner using the local CMD workflow.

The team does not hide failures by lowering thresholds, disabling rules, mocking away critical behavior, or excluding genuine application logic. Test tools must measure the layer they are intended to measure: unit coverage for domain/application logic, browser tests for routes and UI behavior, integration tests for persistence and workflows, and security tests for authorization boundaries.

## 6. Permanent regression list

The following failures are forbidden and must remain covered throughout development:

- URL changes while the visible page remains stale;
- manual refresh required to complete navigation or synchronize state;
- one role reaching another role's workspace;
- a button changing labels or headings without completing the backend operation;
- uploaded evidence visible to one side but missing from the reviewer;
- reviewer completion not updating the submitter;
- files or form values leaking between unrelated records;
- text or uploads disappearing after navigation or refresh;
- broken notification links;
- Back buttons routing into the wrong workspace;
- white screens, silent errors, and uncontrolled crashes;
- duplicate clicks creating duplicate records, contracts, orders, or payments;
- records disappearing from one queue while remaining permanently pending elsewhere;
- payout release without all contractual and review gates;
- agency action replacing personal performer consent;
- public release without verified entitlement and approved final delivery.

## 7. Current position

The current cumulative candidate is **Build Slice 10 — Fan Funding Dashboard and Badges** on Draft PR #6 (`feature/slices-4-10-marketplace-core`). Slices 0–3 remain the accepted `main` baseline at `21135e5895390294ba503df3d2dfba1a3dc6795e`. The Slices 4–10 feature journey is green at branch head `be96c14fccc49ecae0987ccb5a908c71c32a3762`, Engineering Gate #686; Task 5 build-identity/documentation reconciliation and its own exact-head gate are still pending. Combined owner browser acceptance is also pending, so PR #6 must remain Draft and unmerged. Slices 11–17 must not begin as accepted work until this combined Slices 4–10 handoff is completed by the product owner.
