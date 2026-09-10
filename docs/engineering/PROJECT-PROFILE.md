# LUX Platform — Project Profile

## Current candidate

This disposable lab is the cumulative **Milestone 1 candidate through Slice 17 — Administration and Launch Hardening**. The committed baseline is `518716402c09def0f2428ea4bd50398a9020132b`; the active working tree contains the repository-buildable Slices 11–17 implementation, dependency hardening, and Slice 17 build/handoff reconciliation. It is intentionally local-only and must not be pushed from this lab.

Historical Slice 4–10 closure material remains useful historical evidence, but it is not the current completion authority. Canonical Milestone 1 is Slices 0–17 under `.codex-governor/context/`.

## Product identity

LUX is an adult-only, privacy-first, crowd-demanded and crowdfunded creator marketplace. Fans may signal demand and fund opportunities, while creators and depicted people retain control over participation, collaborators, boundaries, compensation, consent, final release, and distribution.

## Current technology

- pnpm 10.15.0 workspace with committed lockfile and frozen-install enforcement.
- Next.js 15.5.24 App Router, React 19.1.1, strict TypeScript 5.9.2.
- ESLint 9.34.0 with zero-warning policy.
- Vitest 3.2.4 with V8 coverage.
- Playwright 1.55.1 with desktop Chromium and Pixel 7 emulation.
- Supabase Postgres/RLS/RPC migrations plus pgTAP database tests.
- Sharp 0.35.4 with an engineering functional PNG probe; production dependency audit is required by the full gate.

## Milestone 1 implementation

Slices 0–10 remain the prerequisite marketplace foundation: repository quality, application shell, authentication/workspace isolation, privacy-safe profiles, discovery, verification, demand, project collaboration, contracts/consent, campaigns/pre-booking, and supporter funding state.

Slices 11–17 add the remaining repository-buildable Milestone 1 layers:

- production workspace, tasks, milestones, private asset boundaries and supporter-safe updates;
- final delivery, depicted-person final-cut approval, structured platform review and durable review history;
- approved releases, entitlement rules, short-lived playback/access boundaries and fan-library surfaces;
- balanced ledger/revenue split policy, reserves, available/pending balances, payout/reconciliation controls and statements;
- rights registry, fingerprint/watermark records, leak/infringement workflow, counter-notice/false-positive handling and scoped evidence;
- performer-accepted agency representation, scoped agency staff authority, revocation and performer-visible activity;
- scoped staff operations, critical-action confirmation/reasons, immutable audit/legal-hold policy, public legal/help pages, release checklist and backup/recovery harness.

The active build identity is Slice 17 across home, `/health`, foundation tests and the handoff generator.

## Verification model

`pnpm verify:full` is the canonical repository gate. It covers repository integrity, tracked secret scan, zero-warning lint, strict typecheck, unit coverage, engineering harness tests, integration/API tests, production dependency audit, runtime compatibility, Supabase database/RLS tests where a runnable environment exists, production build, desktop/mobile browser workflows, and handoff generation.

The governor completion layer additionally requires Graphify/graphify-mission production-path mapping for all `LUX-S00`…`LUX-S17`, real database/RLS and authenticated browser evidence, staging backup restore proof, production-provider acceptance where required, and product-owner end-to-end acceptance. Repository tests or synthetic provider adapters do not substitute for those external gates.

## Provider and privacy policy

- Public projections are explicit allowlists; private negotiation, identity evidence, internal IDs, production assets, processor references and operations evidence must remain scoped.
- Raw card/PAN/CVV data is never stored.
- Development/CI identity and payment adapters are deterministic test boundaries only. Production modes fail closed without approved providers.
- Private production/release evidence requires authorized, time-limited access rather than permanent public object URLs.
- Payout/provider reconciliation must use an approved production boundary before release.

## External acceptance still required

The disposable lab cannot truthfully close these acceptance gates by repository edits alone:

- live Supabase database/RLS pgTAP execution in a runnable Supabase environment;
- authenticated desktop/mobile DB-backed workflows requiring Supabase URL, publishable key and service-role test credentials;
- a real staging database dump → restore → probe using the backup-recovery harness;
- production age/identity/payment/payout and related provider selection/configuration where canonical flows require them;
- product-owner Milestone 1 end-to-end acceptance on the exact candidate.

These are reported as external/owner gates, never converted to local PASS.

## Release rule

The exact candidate may be called repository-complete only when every repository-buildable governor row has concrete evidence and Graphify has no actionable structural row. Production readiness additionally requires every external/provider/owner gate in `docs/engineering/RELEASE-CHECKLIST.md` to be completed on the same candidate.
