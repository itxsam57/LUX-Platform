# LUX RDP Browser Lab Design

## Purpose
Provide a persistent, quota-independent browser acceptance path for LUX on the existing Ubuntu Oracle VM/RDP while leaving Email Shield infrastructure and the accepted LUX feature head untouched.

## Isolation
- Browser infrastructure lives only on `infra/lux-browser-lab`.
- Product acceptance checks out an explicit immutable LUX commit SHA; the infrastructure branch never becomes product source of truth.
- The dedicated runner is `lux-browser-rdp-01` with LUX-specific labels and directories.
- Email Shield runner/configuration is not modified.
- Before a LUX browser job starts heavy work, it waits if an Email Shield `Runner.Worker` process is active on the VM.

## Runtime
- Ubuntu 24.04 x64 self-hosted GitHub Actions runner.
- Node 22 / pnpm 10.15.0.
- Real installed Brave launched by Playwright through `executablePath` in headless mode.
- LUX runs on `http://127.0.0.1:30002`.
- Hosted LUX development Supabase credentials are supplied only from GitHub Actions secrets.
- Test-only identity/payment modes require the existing loopback + CI/test environment boundary; production behavior is not changed.

## Acceptance sequence
1. Verify runner/tooling/secrets without printing secret values.
2. Verify the checkout exactly equals the candidate SHA.
3. Install frozen dependencies.
4. Generate an uncommitted Playwright Brave config in the disposable checkout.
5. Run the existing cumulative Slices 4-10 marketplace journey on Brave desktop and mobile.
6. Preserve bounded failure evidence (trace/screenshots/report) only when needed.
7. Extend the infrastructure branch with targeted owner-acceptance scenarios without modifying the candidate product SHA.

## Safety
- Never merge or mark PR #6 ready from this harness.
- Never alter `main` or the feature head as part of browser infrastructure setup.
- Never print Supabase/service-role values.
- Fail closed when required secrets, Brave, exact SHA, or app health are unavailable.
- Browser-test failures are evidence, not permission to weaken RLS/security/provider boundaries.
