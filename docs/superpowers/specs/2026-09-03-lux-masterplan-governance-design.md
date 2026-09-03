# LUX Masterplan Governance Design

**Status:** Owner-approved design for consolidation of the LUX project blueprint and governance sources.
**Date:** 2026-09-03
**Repository:** `itxsam57/LUX-Platform`
**Accepted baseline:** `main` at `518716402c09def0f2428ea4bd50398a9020132b`
**Accepted product position:** Slices 0–10 accepted and merged; Slices 11–17 remain future Milestone 1 work.

## 1. Purpose

Create one durable, project-level blueprint named `Masterplan(LUX-Platform).md` that future engineers and AI agents can use as the continuous construction structure for LUX without losing finalized requirements, following stale status text, or inventing scope.

The Masterplan is a consolidation and governance artifact, not a product redesign. It must preserve the accepted product course and make the existing canonical laws, finalized features, future milestone requirements, and current repository position easier to follow.

## 2. Non-negotiable owner requirements

Two explicit pre-publication reviews are mandatory before the Masterplan or its governance reconciliation may reach `main`:

1. **Engineering Review.** Review the candidate as an engineer against the repository, accepted implementation, tests, security model, data model, accepted specifications, regression protections, milestone sequence, and merge evidence. The review must prove the Masterplan does not weaken, contradict, omit, misstate, or redirect accepted engineering/product requirements.
2. **Owner-Perspective Review.** Review the candidate from the product-owner viewpoint by asking: if future builders follow this Masterplan to completion, will the finished LUX product be the product that was actually planned and accepted? The review must catch missing user experiences, lost business/product rules, accidental scope shrinkage, misleading completion claims, or additions that were never finalized.

Both reviews must be recorded as PASS before the repository's automated engineering gate is treated as sufficient for publication. A failed or ambiguous result blocks merge.

## 3. Authority model

The Masterplan becomes the primary repository navigation/blueprint document for durable LUX product and engineering direction, subject to this authority order:

1. explicit current instruction from the project owner;
2. applicable legal, safety, privacy, security, consent, age/identity, and financial-integrity requirements;
3. `Masterplan(LUX-Platform).md`;
4. detailed canonical product/engineering/testing specifications referenced by the Masterplan;
5. accepted feature designs, plans, closure records, and regression evidence;
6. current implementation and implementation preferences.

The Masterplan must not make historical evidence disappear or overwrite detailed specifications. It acts as the compass; detailed source documents remain the maps and evidence.

## 4. Evidence sources to reconcile

At minimum, the consolidation must reconcile against:

- `docs/product/00_CANONICAL_PROJECT_LOCK.md`;
- `docs/engineering/00_ENGINEERING_MASTER_NOTE.md`;
- `docs/engineering/01_BUILD_SEQUENCE.md`;
- `docs/engineering/01-MASTER-INSTRUCTIONS.md`;
- `docs/engineering/02-ENGINEERING-STANDARD.md`;
- `docs/engineering/02_SLICE_2_AUTH_SECURITY_SPEC.md`;
- `docs/engineering/03-TESTING-STANDARD.md`;
- `docs/engineering/03_SLICE_3_CLOSURE.md`;
- `docs/engineering/04-SECURITY-STANDARD.md`;
- `docs/engineering/05-UI-WORKFLOW-STANDARD.md`;
- `docs/engineering/06-AI-DEVELOPER-WORKFLOW.md`;
- `docs/engineering/07-MANUAL-TEST-HANDOFF-STANDARD.md`;
- `docs/engineering/08-CI-COST-AND-CREDIT-STANDARD.md`;
- `docs/engineering/10_SLICES_4_10_CLOSURE.md`;
- `docs/engineering/PROJECT-PROFILE.md`;
- `docs/engineering/PROJECT-TEST-MATRIX.md`;
- `docs/engineering/REGRESSION-REGISTER.md`;
- `docs/testing/00_HARD_TEST_PROTOCOL.md`;
- `docs/testing/01_ACCEPTANCE_TEMPLATE.md`;
- accepted Superpowers specifications and plans for Slices 3–10;
- accepted PR/merge evidence for Slices 0–10, especially merged PR #7;
- the current application and database implementation and permanent tests;
- `.engineering/CONTINUATION.json` and current runtime build identity.

Historical files may contain stale checkpoint state. Durable rules may be absorbed or referenced; stale branch/PR/pending-state claims must not become current truth.

## 5. Masterplan content contract

`Masterplan(LUX-Platform).md` must contain enough durable information that a new engineer can understand what LUX is, what must never change without owner approval, what has already been accepted, what remains to be built, and how work is accepted.

Required sections:

- project identity and finished-product goal;
- product constitution and creator/performer autonomy;
- adult assurance, identity verification, personal performer consent, privacy, release, payment, ledger, rights/copyright, moderation, and provider-independence invariants;
- Milestone 1 and Milestone 2 definitions;
- full Slice 0–17 sequence with accepted/future state clearly separated;
- finalized behavior through accepted Slices 0–10;
- required future behavior for Slices 11–17 without falsely claiming implementation;
- architecture and data-ownership direction;
- role/workspace isolation and authorization rules;
- state-machine, idempotency, audit, storage/evidence, and concurrency rules;
- UI/workflow and navigation rules;
- build, testing, security, incident, definition-of-ready, definition-of-done, owner-acceptance, and merge laws;
- permanent regression constitution;
- current accepted baseline and current consumer-readiness statement;
- exact next permitted development boundary;
- source/evidence index distinguishing durable specifications from historical closure/checkpoint records;
- change-control rule for future Masterplan revisions.

## 6. Finalized accepted product position

The consolidation must state the current truth:

- `main` accepted baseline is `518716402c09def0f2428ea4bd50398a9020132b` after owner-authorized merge of PR #7 on 2026-09-02;
- Slices 0–10 are accepted and merged;
- the merged `main` exact SHA passed Engineering Gate #726;
- accepted runtime build identity is Slice 10 — Fan Funding Dashboard and Badges;
- Slices 11–17 remain required to complete Milestone 1;
- synthetic identity and sandbox payment adapters are development/CI boundaries only;
- production verification/payment modes remain fail-closed until approved real providers are configured;
- current Slice 10 funding/payment state is not the Slice 14 double-entry ledger or payout system;
- LUX is therefore not yet complete or production/consumer launch-ready as a full Milestone 1 platform.

## 7. Finalized behavior that must not be lost

The Masterplan must preserve, at minimum, the accepted detailed semantics already established through Slice 10, including:

- default fan membership, separately requested/approved creator and agency roles, non-self-requestable staff roles, and explicit active-workspace isolation;
- viewer age assurance being distinct from creator/depicted-person identity verification;
- role requests granting no permission before approval and approved roles not becoming active until explicit activation;
- privacy-first profile projection, public/unlisted/private visibility, guarded media, follow/block/mute semantics, privacy-right access, supporter anonymity default, export/deletion-request behavior, and recipient-only notifications;
- discovery privacy/block filtering, deterministic/explainable ranking baseline, and public allowlisted projections;
- V1/V2/V3 verification separation, restricted evidence, revocation/expiry behavior, and fail-closed production provider policy;
- Crowd Demand Board rules that demand/support never creates creator commitment, private decline semantics, explicit creator interest, and creator-owned conversion provenance;
- versioned project drafts, stale-write rejection, collaborator invitation/negotiation states, and agency communication not equaling legal consent;
- immutable exact terms, personal verified depicted-person consent, material-change reopening, agency inability to consent for performers, and contract-lock prerequisites;
- campaign publication gates, truthful public campaign projection, explicit funding/refund/material-change terms, and pre-book being an idempotent commitment rather than a hidden payment;
- provider-neutral payment boundary, no raw PAN/CVV retention, authenticated/deduplicated webhook behavior, owner-only funding projections, badges/privacy, material-change comparison/acceptance, and idempotent refund intent;
- permanent desktop/mobile/history/refresh/cross-role/privacy/stale-write/consent/navigation regression locks accepted during Slices 0–10.

## 8. Future Milestone 1 protection

The Masterplan must retain the already-finalized future requirements for Slices 11–17 instead of allowing the unfinished half of Milestone 1 to disappear from future planning:

11. Production Workspace.
12. Delivery and Platform Review.
13. Secure Release and Fan Library.
14. Double-Entry Ledger, Revenue Splits, and Payouts.
15. Copyright and Stolen-Content Operations.
16. Agency Workspace.
17. Administration and Launch Hardening.

The future finished product must still include secure production assets, structured release review, final-cut gates where required, entitlement-controlled playback, auditable double-entry accounting, revenue splits/payout controls, rights evidence/takedown workflows, agency operations without replacing performer autonomy, moderation/staff operations, backup/recovery, abuse controls, legal/help surfaces, and launch hardening.

## 9. Reconciliation scope

Implementation should create the Masterplan and minimally reconcile living governance/status pointers so future work starts from current truth.

Expected reconciliation targets:

- create `Masterplan(LUX-Platform).md`;
- update `README.md` to point first to the Masterplan and show the accepted Slices 0–10 state;
- update `docs/engineering/01-MASTER-INSTRUCTIONS.md` so the Masterplan is read before mutable project-status documents;
- reconcile stale current-position/status text in `docs/product/00_CANONICAL_PROJECT_LOCK.md` without weakening its constitution;
- reconcile `docs/engineering/PROJECT-PROFILE.md` current state;
- reconcile `docs/engineering/PROJECT-TEST-MATRIX.md` candidate/acceptance state while preserving the permanent matrix;
- reconcile `docs/engineering/REGRESSION-REGISTER.md` evidence baseline while preserving stable IDs and protections;
- reconcile `.engineering/CONTINUATION.json` away from the obsolete PR #6/Task 5 state to the accepted Slices 0–10 baseline and next permitted Slice 11 planning boundary.

Historical closure/spec/plan documents are evidence records and should not be rewritten merely to erase the historical context in which they were created.

## 10. Anti-junk and anti-drift rules

Do not add:

- abandoned ideas that were never owner-finalized;
- speculative features presented as requirements;
- temporary branch instructions as timeless law;
- obsolete PR/pending-test state as current truth;
- duplicated detailed prose when a stable source reference is clearer;
- implementation minutiae that do not influence future architecture, behavior, safety, scope, acceptance, or roadmap;
- claims that Slices 11–17 or real production providers already exist.

Do not remove or weaken a finalized product rule, accepted feature contract, future Milestone 1 requirement, regression protection, owner acceptance boundary, consent/privacy/security rule, or financial-integrity rule merely to shorten the document.

## 11. Engineering Review gate

Before publication to `main`, perform and record an engineering review that checks:

- every Masterplan section has source/evidence support;
- no accepted Slice 0–10 behavior is contradicted or silently broadened/narrowed;
- Slices 11–17 still match the canonical Build Sequence and product goal;
- source hierarchy is coherent and does not make code silently outrank product law;
- legal/safety/privacy/consent/identity/security/financial invariants are intact;
- current status and baseline SHA/merge state are accurate;
- stale historical facts are clearly historical rather than current;
- no provider sandbox is mislabeled production;
- no future system is marked implemented;
- regression IDs/protections are preserved;
- reconciliation does not change runtime product behavior;
- the next permissible work remains Slice 11 design/planning rather than accidental implementation or roadmap skipping.

Result must be explicitly recorded as `ENGINEERING REVIEW: PASS` before merge eligibility.

## 12. Owner-Perspective Review gate

After the engineering review, perform and record a separate owner-perspective review that checks the finished-product outcome rather than only technical consistency.

Ask and answer:

- Does following this Masterplan still produce a crowd-demanded, not crowd-controlled creator marketplace?
- Do creators and depicted people retain voluntary participation and personal consent?
- Are fan discovery, demand, funding, privacy, purchases/library/release experiences still present in the finished plan?
- Are creator/performer/writer/producer/editor/agency collaboration and earnings paths still present?
- Are production, delivery review, secure release, ledger/payout, rights protection, moderation, administration, and launch hardening still mandatory?
- Are Milestone 2 communities, memberships, richer production/agency tools, advanced rights protection, recommendations/analytics, and regional scaling retained without being confused with Milestone 1?
- Has any accepted rule been converted into optional language?
- Has any unapproved idea been promoted to a requirement?
- Would a competent future team following this document build what the owner intended, rather than merely what is easiest from the current codebase?

Result must be explicitly recorded as `OWNER-PERSPECTIVE REVIEW: PASS` before merge eligibility.

## 13. Automated verification and publication gate

After both human-perspective review passes are recorded:

- run the repository's applicable full engineering gate on the exact candidate head;
- do not weaken, skip, or relabel a required failing check;
- documentation-only changes still require repository integrity, secret, lint/type/build and applicable contract/handoff checks according to the repository gate;
- any failed required gate blocks publication;
- any subsequent candidate change invalidates the prior exact-head review/gate evidence and requires re-review/reverification as applicable.

Only a candidate with:

1. `ENGINEERING REVIEW: PASS`;
2. `OWNER-PERSPECTIVE REVIEW: PASS`; and
3. exact-head automated gate PASS

may be proposed for merge to `main`.

## 14. Success condition

This work succeeds when the repository has one clear Masterplan backbone that is complete enough to preserve the intended finished LUX product, current enough to continue from accepted Slice 10 without confusion, strict enough to protect safety/consent/privacy/financial integrity, and restrained enough not to pollute the project with speculative or stale material.

Following the Masterplan through Slices 11–17 and later Milestone 2 must continue the same product course already accepted through Slices 0–10 rather than resetting or redefining LUX.
