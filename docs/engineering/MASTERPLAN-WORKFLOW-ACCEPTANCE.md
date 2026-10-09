# Milestone 1 Masterplan Workflow Acceptance

This document maps the binding LUX Masterplan to executable acceptance evidence. It separates product/database/browser proof that must pass before provider integration from proof that inherently requires real external vendors or a production-like deployment.

## Gate rule

A Milestone 1 candidate is not workflow-accepted until:

- repository, secret, lint, type, unit, integration, dependency, and production-build gates pass;
- all Supabase pgTAP/database/RLS suites pass on an isolated stack;
- all Playwright journeys pass on desktop and mobile;
- the product owner completes the manual acceptance handoff on the exact tested SHA.

Real payment, payout, identity/age, storage/streaming, moderation, and media-protection vendors are intentionally excluded from this pre-integration acceptance. Their adapters, fail-closed boundaries, and normalized callback contracts are tested now; live vendor behavior is a later staging gate.

## Slice evidence

| Slice | Masterplan workflow | Database / contract evidence | Browser evidence |
| --- | --- | --- | --- |
| 0 | Repository and quality foundation | engineering harness, repository/secret/runtime/dependency gates | foundation.spec.ts, launch-hardening.spec.ts |
| 1 | Design system and application shell | foundation contracts | design-system.spec.ts, foundation.spec.ts |
| 2 | Auth, adult assurance, workspace isolation | auth/session/workspace pgTAP suites | auth-isolation.spec.ts, verification.spec.ts |
| 3 | Profiles and privacy | profile/privacy/RLS suites | profile-privacy.spec.ts, profile-hardening.spec.ts, privacy-export.spec.ts, privacy-rights.spec.ts |
| 4 | Feed and discovery | discovery preference/search/hide/block pgTAP | discovery.spec.ts, consumer-completion.spec.ts |
| 5 | Creator/depicted-person verification | verification + provider-adapter pgTAP | verification.spec.ts |
| 6 | Crowd Demand | demand lifecycle + discussion pgTAP | demand.spec.ts |
| 7 | Project drafts/collaboration invitations | project/invitation/readiness pgTAP | projects-invitations.spec.ts, marketplace-4-10-journey.spec.ts |
| 8 | Contracts, consent, boundaries | exact-terms/consent/expanded-contract pgTAP | contracts-consent.spec.ts |
| 9 | Campaign publishing/pre-booking | campaign/tiers/prebook pgTAP | campaign-prebook.spec.ts, marketplace-4-10-journey.spec.ts |
| 10 | Fan funding/badges/orders/wallet | funding/payment/order/wallet pgTAP | funding-dashboard.spec.ts |
| 11 | Production workspace/private assets | production/storage authorization pgTAP | earnings-payouts.spec.ts and production journey coverage |
| 12 | Delivery/platform review including safety | review/checklist/safety pgTAP | earnings-payouts.spec.ts staff-review journey |
| 13 | Secure release/fan library | release/entitlement/playback pgTAP | earnings-payouts.spec.ts release/library journey |
| 14 | Ledger, splits, holds, payouts | finance/ledger/provider-dispatch pgTAP | earnings-payouts.spec.ts, funding-dashboard.spec.ts |
| 15 | Copyright/stolen-content operations | copyright/media-protection pgTAP | staff-operations.spec.ts plus manual acceptance handoff |
| 16 | Agency workspace | agency/performer-scope pgTAP | agency-workflow.spec.ts |
| 17 | Admin/launch hardening | admin/trust/rate-limit/incident/audit pgTAP | trust-operations.spec.ts, staff-operations.spec.ts, launch-hardening.spec.ts |

## Cross-cutting permanent regressions

The automated gate must retain direct evidence for:

- URL and visible route synchronization, refresh, Back, and Forward recovery;
- role/workspace isolation and cross-tenant denial;
- public projections excluding internal UUIDs, processor identifiers, verification evidence, private negotiations, and financial internals;
- duplicate/idempotent action behavior for demand support, pre-booking, payments, wallet/order derivation, contracts, and payouts;
- reviewer/submitter synchronization for verification and delivery review;
- notification ownership and deep links;
- block/privacy boundaries across discovery, messaging, profiles, and saved content;
- immutable audit, ledger, consent, moderation, copyright, provider-event, and payout histories;
- no payout before contract/review/hold gates;
- no agency replacement of performer acceptance, consent, or final-cut authority;
- no public release/playback without approved final delivery and entitlement;
- mobile layout and overflow checks on relevant routes.

## External staging proof after this gate

The following are not simulated into a false green status. After this pre-integration workflow gate passes, staging must prove:

1. production payment checkout, authorization/capture, refund/chargeback, signed callbacks, and ledger reconciliation;
2. payout-recipient/KYC onboarding, ownership verification, dispatch, paid/failed callbacks, and reconciliation;
3. real adult assurance and V2/V3 identity/liveness, including rejection, manual review, expiry, and reverification;
4. production storage upload, private delivery, token expiry, streaming/range behavior, and media-protection callbacks;
5. production moderation provider decisions and normalized receipt persistence;
6. backup/restore against an isolated production-like database;
7. exact-SHA deployment, TLS/domain/webhooks/health, then owner launch acceptance.

A provider integration is never allowed to bypass LUX authorization, exact terms, personal consent, delivery review, entitlement, ledger, payout holds, privacy, or audit history.
