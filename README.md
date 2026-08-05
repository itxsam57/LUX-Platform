# LUX Platform

LUX is the working code name for an adult-only, crowd-demanded and crowdfunded creator platform.

The platform allows audiences to signal demand, vote, pre-book, fund, discover, review, and purchase creator-led productions. It never gives audiences control over a creator or performer. Every creator and depicted person independently chooses whether to participate, which role to accept, which collaborators to work with, which boundaries apply, what compensation is acceptable, and whether the final cut may be released.

## Canonical source of truth

The documentation under `docs/product`, `docs/engineering`, and `docs/testing` is the canonical product and engineering specification. Production code must not silently contradict it.

Read these repository-specific files before implementation:

- `docs/engineering/PROJECT-PROFILE.md`
- `docs/engineering/PROJECT-TEST-MATRIX.md`
- `docs/engineering/REGRESSION-REGISTER.md`

## Build method

LUX is built as independently testable vertical slices. A slice is not complete until its design and workflow are documented, applicable code/security/persistence behavior is implemented, the full automated engineering gate passes, and the product owner completes only the visible browser tests listed in the generated handoff.

The next slice does not begin while the current slice has unresolved critical defects.

## Current repository layout

```text
apps/web                  Next.js web application
docs/product              Canonical product lock
docs/engineering          Engineering standards, project profile, matrix and register
docs/testing              Hard-test and acceptance protocols
scripts/engineering       Repository gate, security, impact and handoff automation
.github/workflows         GitHub Actions engineering gate
```

Future `packages/*` and `supabase/migrations` directories are not implemented yet and must not be treated as existing architecture.

## Engineering commands

```bash
pnpm install --frozen-lockfile
pnpm verify:quick
pnpm verify:affected
pnpm verify:full
pnpm report:handoff
```

`verify:full` runs every applicable required check and exits non-zero on a required failure. The generated handoff is written under `.engineering/reports/` and is intentionally not committed.

## Current status

Build Slice 0: repository and quality foundation.

No marketplace production feature should be considered complete yet. The current code establishes the public application shell, health route, design-system preview, strict engineering gate, and canonical specifications required before feature implementation begins.
