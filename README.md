# LUX Platform

LUX is the working code name for an adult-only, crowd-demanded and crowdfunded creator platform.

The platform allows audiences to signal demand, vote, pre-book, fund, discover, review, and purchase creator-led productions. It never gives audiences control over a creator or performer. Every creator and depicted person independently chooses whether to participate, which role to accept, which collaborators to work with, which boundaries apply, what compensation is acceptable, and whether the final cut may be released.

## Canonical source of truth

The documentation under `docs/product`, `docs/engineering`, and `docs/testing` is the canonical product and engineering specification. Production code must not silently contradict it.

## Build method

LUX is built as independently testable vertical slices. A slice is not complete until:

1. its design and workflow are documented;
2. its code, database rules, security policies, and audit behavior are implemented;
3. automated tests pass;
4. staging behavior is tested on desktop and mobile;
5. cross-role and refresh/regression tests pass;
6. the product owner completes the acceptance checklist.

The next slice does not begin while the current slice has unresolved critical defects.

## Repository layout

```text
apps/web                  Next.js web application
packages/ui               Shared UI components
packages/config           Shared lint and TypeScript configuration
supabase/migrations       Database migrations and RLS policies
docs/product              LUX Blueprint Library
docs/engineering          Build sequence and engineering contracts
docs/testing              Hard-test and acceptance protocols
.github                   CI and contribution controls
```

## Current status

Build Slice 0: repository and quality foundation.

No production feature should be considered complete yet. The current code establishes the application shell, health route, design-system preview, strict TypeScript settings, CI baseline, and the complete engineering specification needed before feature implementation begins.
