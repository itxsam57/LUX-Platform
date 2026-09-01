# LUX RDP Browser Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the accepted Slice 10 candidate in real installed Brave on the dedicated Ubuntu RDP runner without modifying the candidate SHA.

**Architecture:** Keep browser infrastructure on `infra/lux-browser-lab`. A self-hosted workflow checks out the immutable candidate SHA, injects development-only secrets from GitHub Actions, generates a disposable Brave Playwright config, and runs the existing cumulative marketplace journey on desktop and mobile.

**Tech Stack:** GitHub Actions self-hosted Ubuntu runner, Node 22, pnpm 10.15.0, Next.js 15, Playwright 1.55.1, Brave, hosted development Supabase.

**Spec:** `docs/superpowers/specs/2026-09-01-lux-rdp-browser-lab-design.md`

## Global Constraints
- Candidate product SHA is `3c78889cf2545cdc6c9586fe621a5e12014d0594`.
- Accepted `main` baseline remains `21135e5895390294ba503df3d2dfba1a3dc6795e`.
- PR #6 remains Draft/unmerged.
- Do not modify Email Shield infrastructure.
- Do not print secrets.
- Use real installed Brave, not bundled Chromium.
- Production verification/payment fail-closed behavior must not change.

---

### Task 1: Runner health and exact-SHA smoke

**Files:**
- Create: `.github/workflows/lux-browser-lab.yml`

**Interfaces:**
- Consumes: runner labels `self-hosted`, `Linux`, `X64`, `lux-browser`, `brave`, `headless`, `rdp`; repository secrets `LUX_DEV_SUPABASE_URL`, `LUX_DEV_SUPABASE_PUBLISHABLE_KEY`, `LUX_DEV_SUPABASE_SERVICE_ROLE_KEY`.
- Produces: a GitHub Actions run proving the dedicated runner is online and the exact candidate SHA can be checked out.

- [ ] **Step 1:** Add workflow with an explicit immutable `TARGET_SHA` and LUX runner labels.
- [ ] **Step 2:** Add non-secret health checks for OS, Node, pnpm, Brave, and secret presence.
- [ ] **Step 3:** Add a bounded wait while an Email Shield `Runner.Worker` is active so heavy browser jobs do not compete on the VM.
- [ ] **Step 4:** Checkout `TARGET_SHA` and fail if `git rev-parse HEAD` differs.
- [ ] **Step 5:** Push the workflow on the infrastructure branch and inspect the resulting run.

### Task 2: Real Brave cumulative journey

**Files:**
- Modify: `.github/workflows/lux-browser-lab.yml`

**Interfaces:**
- Consumes: exact candidate checkout and hosted development Supabase secrets.
- Produces: desktop/mobile Brave evidence for `apps/web/tests/e2e/marketplace-4-10-journey.spec.ts`.

- [ ] **Step 1:** Install dependencies with `pnpm install --frozen-lockfile`.
- [ ] **Step 2:** Generate an uncommitted `apps/web/playwright.browser-lab.config.ts` using real Brave `executablePath`, localhost port 30002, failure traces/screenshots, desktop Chrome viewport, and Pixel 7 viewport.
- [ ] **Step 3:** Export existing test-only runtime flags: `AGE_ASSURANCE_MODE=self_attestation`, identity environment/test + synthetic mode, payment environment/test + sandbox mode, and loopback app URL.
- [ ] **Step 4:** Run the existing cumulative Slices 4-10 journey on both Brave projects.
- [ ] **Step 5:** Upload bounded Playwright failure evidence only on failure.
- [ ] **Step 6:** Inspect the run; classify any failure as runner/harness/environment/product before changing product code.

### Task 3: Owner-acceptance expansion

**Files:**
- Create or modify only on `infra/lux-browser-lab`: browser-lab acceptance test assets/workflow orchestration.

**Interfaces:**
- Consumes: proven Task 2 browser runtime.
- Produces: automated coverage of the combined owner handoff while product code remains at exact SHA.

- [ ] **Step 1:** Map each of the 14 owner scenarios to existing E2E coverage and identify only genuine gaps.
- [ ] **Step 2:** Add targeted browser-lab-only Playwright scenarios for uncovered behaviors using unique disposable users/data and service-role cleanup.
- [ ] **Step 3:** Run all owner scenarios in real Brave desktop/mobile where applicable.
- [ ] **Step 4:** Record failures and fix only verified product defects on the feature branch, followed by a fresh full Engineering Gate and affected browser retest.
- [ ] **Step 5:** If all acceptance scenarios pass, record browser acceptance evidence without merging or marking PR #6 ready unless the owner explicitly authorizes that transition.
