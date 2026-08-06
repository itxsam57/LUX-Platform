# Slice 2 — Authentication, Age Assurance, and Workspace Isolation

**Status:** binding implementation specification for Build Slice 2.

## Purpose

Establish real account identity, verified-email sessions, adult-access gating, role requests, approved workspaces, strict server authorization, Postgres Row Level Security, and security audit events before any product dashboard is built.

## Security model

1. Supabase Auth owns passwords, verification tokens, recovery tokens, access tokens, refresh tokens, and provider sessions.
2. Next.js server components/actions call `auth.getUser()` and the repository data-access layer before returning protected data or performing a mutation.
3. Route middleware only refreshes cookies and performs fast unauthenticated redirects. It is never the final authorization boundary.
4. Postgres RLS and security-definer functions are the final data boundary.
5. Every new account receives one approved `fan` membership. It receives no creator, agency, or staff permission automatically.
6. `creator` and `agency` memberships are requested by the account and approved separately.
7. Staff memberships cannot be self-requested. The initial `super_admin` is bootstrapped only through the service-role-only database function.
8. Active workspace is a separate durable record. Possessing several approved memberships does not merge their permissions.
9. A protected workspace route requires the active membership to exactly match the route family.
10. Viewer age assurance stores only a decision record: method, status, jurisdiction code, policy version, timestamps, and expiry. It does not store date of birth in Slice 2.
11. Self-attestation is allowed only when `AGE_ASSURANCE_MODE=self_attestation`, which is intended for local/CI and jurisdictions where the final legal policy permits it. In `provider_required` mode, no self-attestation bypass is accepted.
12. Creator and depicted-person identity/age verification remains Slice 5 and is never implied by the viewer gate.
13. Audit events contain stable event identifiers, actor, session identifier, outcome, route key, target role, and sanitized metadata. They must not contain passwords, tokens, email bodies, IP addresses, private evidence, or explicit content.
14. Logout-all-devices records a server-side revocation epoch before invoking Supabase global sign-out, so existing LUX sessions are rejected by the data-access layer even while a short-lived JWT has not yet expired.

## Roles

- `fan`
- `creator`
- `agency`
- `reviewer`
- `moderator`
- `finance`
- `copyright`
- `support`
- `super_admin`

Only `creator` and `agency` are self-requestable in Slice 2. Staff roles are service/admin provisioned.

## Routes

Public account routes:

- `/auth/sign-up`
- `/auth/login`
- `/auth/check-email`
- `/auth/forgot-password`
- `/auth/update-password`
- `/auth/callback`

Authenticated gates and settings:

- `/age-assurance`
- `/workspace`
- `/settings/security`
- `/access-denied`

Strict workspace routes:

- `/workspace/fan`
- `/workspace/creator`
- `/workspace/agency`
- `/workspace/staff`
- `/workspace/staff/role-requests`

## Required database objects

- `accounts`
- `workspace_memberships`
- `active_workspaces`
- `account_security_state`
- `age_assurance_records`
- `audit_events`

All exposed tables have RLS enabled. Authenticated users receive read access only where an explicit policy allows it. Durable writes occur through constrained RPC functions.

## Required workflows

### Registration and verification

1. User submits email and password.
2. Supabase creates an unverified account and sends a verification message.
3. Generic success copy prevents account enumeration.
4. Callback verifies the token and creates a cookie session.
5. The database trigger creates account, approved fan membership, active fan workspace, and security state.
6. Unverified accounts cannot enter the adult gate or workspace.

### Login

1. User submits credentials.
2. Supabase verifies them.
3. Server records a sanitized login audit event.
4. Verified user is sent to the adult gate or intended safe internal route.
5. Failed login uses generic copy and never reveals whether an email exists.

### Adult access

1. Verified user opens `/age-assurance`.
2. In self-attestation mode, the user confirms adult status and jurisdiction eligibility.
3. Server validates the jurisdiction code and policy version and calls the constrained RPC.
4. In provider-required mode, access remains blocked until a provider record exists.

### Role request and approval

1. User requests creator or agency membership.
2. Membership remains `requested` and grants no route or data access.
3. Active super-admin reviews the request.
4. Approval changes only that membership to `approved`.
5. User explicitly activates the approved workspace before entering its route.

### Workspace isolation

1. Server reads the authenticated user and viewer context.
2. Email, session epoch, age assurance, membership status, and active role are checked.
3. The active role must exactly match the route family.
4. Denial is audited using a stable route key and safe reason.
5. Direct URL, refresh, Back, Forward, and stale sessions receive the same result.

### Logout

- Current-device logout uses Supabase local sign-out.
- Logout-all-devices first advances the LUX revocation epoch, then uses Supabase global sign-out.
- Protected routes re-check the server context on every request.

## Acceptance matrix

The slice cannot pass until automation proves:

- unverified user cannot enter protected routes;
- verified but unassured user is sent to the adult gate;
- fan cannot access creator, agency, or staff routes;
- requested creator/agency membership grants no access;
- approved membership still grants no access until activated;
- active creator cannot access staff routes;
- URL editing, refresh, Back, and Forward do not bypass checks;
- second browser session is rejected after logout-all-devices;
- password recovery changes the password and invalid tokens fail safely;
- role activation and denied access create audit events;
- one user cannot read another user’s account, age, active workspace, membership, or audit rows;
- authenticated users cannot directly approve roles or insert audit events;
- all RLS and browser tests run against an isolated local Supabase stack in CI.

## Local-machine limitation

The owner’s Windows machine does not support Docker. Database/RLS automation therefore runs in GitHub Actions using the official Supabase local stack. Local visible testing uses a hosted Supabase project configured from the committed migrations and environment contract. No database security check is skipped because of the local hardware limitation.
