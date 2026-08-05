# LUX Platform — Project Profile

**Audit baseline:** `9a0db2884a04a78a4d92164e965e7a293a9a9e2e`, audited 2026-08-05.  
**Latest verified implementation:** Build Slice 1 at commit `14c0114a43d32064ce4f77fa0213974a2a858b17`, GitHub Actions run `31027041499`.  
**Status:** authoritative for the current repository state. Update when architecture, roles, providers, or verification commands change.

## Product identity

LUX is the working code name for an adult-only, privacy-first, crowd-demanded and crowdfunded creator marketplace. Fans may signal demand and fund opportunities, but creators and performers retain control over participation, collaborators, boundaries, compensation, consent, final release, and distribution.

The repository implements **Build Slice 1: Design System and Application Shell**. It is not yet a production marketplace and must not be described or tested as though authentication, payments, uploads, consent, moderation, creator workspaces, or other marketplace systems already exist.

Canonical product rules live in `docs/product/00_CANONICAL_PROJECT_LOCK.md`.

## Current technology

- pnpm 10.15.0 workspace with committed `pnpm-lock.yaml` and frozen-install enforcement.
- Next.js 15.5.21 App Router.
- React and React DOM 19.1.1.
- TypeScript 5.9.2 with strict checking.
- ESLint 9.34.0 with `eslint-config-next` 15.5.21 and zero-warning policy.
- Vitest 3.2.4 with V8 coverage.
- Playwright 1.55.1 with Chromium desktop and Pixel 7 emulation.
- GitHub Actions on Ubuntu and Node.js 22.

## Implemented surfaces and shared UI

- `/` — public foundation status page identifying Build Slice 1.
- `/design-system` — complete shared-component catalogue and responsive application shell.
- `/health` — public GET health contract reporting `buildSlice: 1`.
- controlled 404 route with recovery link.
- controlled route-level loading and error boundaries.
- desktop shell with sidebar and sticky top bar.
- mobile shell with fixed bottom navigation and protected content spacing.
- design tokens for colour, typography, spacing, radius, elevation, focus, and reduced motion.
- shared primitives for buttons, links, fields, selection controls, file selection, badges, status, avatars, cards, tables, pagination, empty/error/loading states, breadcrumbs, stepper, tabs, tooltip, dialog, drawer, menu, and toast.
- `src/lib/foundation.ts` — active build-slice and required-route contract.

The file picker and catalogue interactions are presentation fixtures only. They do not upload, persist, authorize, pay, or change production data.

## Not implemented

Authentication, authorization, age assurance, tenant isolation, database, RLS, storage, uploads, crowdfunding, payments, contracts, consent, review queues, secure streaming, watermarking, moderation, payouts, provider webhooks, background jobs, and all authenticated dashboards are **BLOCKED future scope**, not passing features.

The empty Supabase variables in `.env.example` are placeholders only. No Supabase dependency, migration, schema, bucket, or policy exists.

## Current roles and access

Only an anonymous public visitor exists in code. The finished product plans fan, creator/performer, writer/producer/editor, agency, reviewer/moderator, finance/copyright/support, and super-admin roles, but none is implemented. Cross-role and cross-tenant automation becomes mandatory in the slice that introduces those boundaries.

## Current critical workflows

| ID | Workflow | Risk | Automated layer |
|---|---|---:|---|
| FND-WF-001 | Load foundation home page and identify active build slice | Medium | Playwright desktop/mobile |
| FND-WF-002 | Navigate home → design system → Back/Forward → refresh | High | Playwright desktop/mobile |
| FND-WF-003 | GET `/health` and validate service/status/build slice/timestamp | Medium | Vitest API contract + Playwright request |
| FND-WF-004 | Request unknown route and recover home | Medium | Playwright desktop/mobile |
| UI-WF-001 | Render every required component family without page or console errors | High | Playwright desktop/mobile |
| UI-WF-002 | Operate tabs by keyboard and close dialog/drawer safely | High | Playwright desktop/mobile |
| UI-WF-003 | Show truthful toast/menu feedback without hidden durable action | Medium | Playwright desktop/mobile |
| UI-WF-004 | Use desktop sidebar or mobile bottom navigation without covered controls | High | Playwright desktop/mobile |
| UI-WF-005 | Prevent horizontal document overflow, including hidden overlay content | High | Playwright desktop/mobile |
| ENG-WF-001 | Clean frozen dependency install | High | committed lockfile + GitHub Actions |
| ENG-WF-002 | Run full engineering gate and generate truthful handoff | High | `pnpm verify:full` |

## Data classification

- Public source, copy, styles, design tokens, and foundation metadata: public.
- Environment variable names: internal; values must never be committed or logged.
- Future identity, age, consent, contracts, private media, messages, payment, and payout data: highly sensitive/restricted and forbidden from CI evidence.
- Tests use deterministic synthetic, non-personal, non-explicit fixtures.

## Environment and secrets

Build Slice 1 requires no runtime secrets. Tracked `.env`, provider tokens, private keys, session data, generated screenshots/traces/videos, and private user content are forbidden. Future destructive tests must use isolated non-production providers and stores.

## Verification commands

- `pnpm verify:quick` — repository/secret/lint/type/unit/API checks.
- `pnpm verify:affected` — safe change-aware verification.
- `pnpm verify:full` — repository, secret, lint, type, unit, API/integration, dependency audit, runtime compatibility, build, browser tests, and handoff.
- `pnpm report:handoff` — regenerate the current manual-test handoff.

## Browser matrix

- Chromium desktop in CI: required for applicable source/config changes.
- Chromium Pixel 7 emulation in CI: required for applicable source/config changes.
- Current Slice 1 evidence: 9 desktop and 9 mobile workflows, 18/18 passing.
- Owner’s local Chrome on Windows: manual only when the generated handoff lists visible tests.
- Firefox/WebKit: not configured yet to control cost; add only when compatibility risk justifies them.

## Definition of done

A change is done only when it preserves the canonical product rules, avoids unrelated redesign, passes repository and secret checks, lint, strict types, applicable tests, dependency audit, runtime compatibility, production build, applicable desktop/mobile workflows, and generates a truthful handoff. The owner performs only the visible tests listed in that handoff.

## Known current limitations

- No deployment preview provider is configured; local browser handoffs use `http://127.0.0.1:3000` only when visible testing is required.
- One moderate production dependency advisory remains disclosed below the high/critical blocking threshold.
- Product-system tests remain blocked until their corresponding build slices exist.
