# LUX Hard Test Protocol

## Purpose

This protocol prevents visually convincing but functionally incomplete work. Every accepted build slice must prove that interface, routing, database state, security, files, notifications, audit records, and role-specific views agree.

## Test ownership

The engineer performs automated and structured staging tests first. The product owner then performs an independent acceptance pass. A feature is not complete until both passes succeed.

## Required test layers

### 1. Domain unit tests

Test pure rules and state transitions, including invalid transitions, expiry, cancellation, consent invalidation, revenue splits, badge eligibility, and payout availability.

### 2. Schema and contract tests

Test request validation, response shape, typed provider interfaces, backward compatibility, error codes, and redaction of private fields.

### 3. Database tests

Test constraints, foreign keys, uniqueness, ownership columns, immutable records, balanced journals, transition functions, and transaction rollback.

### 4. Row-level security tests

For every protected table, write explicit allow and deny cases for owners, collaborators, fans, agencies, reviewers, moderators, finance staff, and unauthenticated users.

### 5. Storage tests

Test allowed file types, rejected types, size limits, ownership, path isolation, signed access, expiry, malware/inspection state, deletion, legal hold, and prevention of cross-form file leakage.

### 6. Integration tests

Test complete commands through database and event effects. Every important command must prove idempotency and rollback behavior.

### 7. Provider tests

Use adapters and controlled fakes for payments, verification, email, storage, media processing, and watermarking. Test success, delay, retry, duplicate webhook, invalid signature, timeout, partial failure, and provider outage.

### 8. Browser end-to-end tests

Test the real browser workflow from the correct role. Verify URL, visible screen, network response, persistent state, notification, audit effect, refresh behavior, direct route behavior, and back/forward navigation.

### 9. Cross-role attack tests

Attempt to access every protected route and record using another role, another tenant, guessed IDs, copied signed URLs, changed query parameters, and direct API calls.

### 10. Accessibility tests

Test keyboard navigation, focus order, focus trapping, labels, error descriptions, reduced motion, contrast, touch targets, semantic headings, screen-reader announcements, and zoom.

### 11. Performance tests

Measure initial page load, route transition, feed pagination, upload initiation, media poster loading, and slow-network states on mobile-class conditions.

### 12. Recovery tests

Interrupt requests, refresh during operations, retry after timeout, submit twice, lose connection, reopen another tab, expire a session, and return after provider delay.

## Permanent regression suite

Every relevant slice must test these failures:

1. URL changes but the visible page does not.
2. Manual refresh is required after navigation.
3. A role reaches another role’s dashboard.
4. A button changes text or heading without completing real work.
5. Uploaded evidence is missing for the reviewer.
6. Reviewer completion does not update the submitter.
7. A selected file appears in another form.
8. An allowed PDF, image, or video fails silently.
9. Entered text disappears after route change, refresh, or reopening a draft.
10. A notification opens the wrong area or nothing at all.
11. A back button opens another workspace.
12. Duplicate clicks create duplicate records or charges.
13. A record disappears from review while remaining pending for its owner.
14. An approval is visible on one dashboard but not another.
15. A failed request leaves the UI pretending success.
16. A white screen or swallowed exception appears.
17. Stale cache exposes data after access is revoked.
18. Direct object URL bypasses entitlement or permission.
19. Expired session continues a privileged command.
20. Replayed webhook repeats a payment, refund, split, or payout.

## Standard workflow test matrix

For every material action, test:

- allowed actor;
- denied actor;
- missing prerequisite;
- valid first submission;
- duplicate submission;
- refresh immediately before submission;
- refresh immediately after submission;
- back/forward after completion;
- direct URL entry;
- second browser tab;
- slow network;
- request timeout;
- server validation failure;
- database failure rollback;
- notification delivery and deep link;
- audit-event creation;
- mobile layout;
- desktop layout.

## Money workflow additions

Test:

- exact amount and currency;
- provider fee representation;
- restricted versus available balance;
- duplicate provider event;
- invalid provider signature;
- partial refund;
- full refund;
- chargeback;
- reserve hold;
- campaign failure;
- campaign cancellation;
- split rounding;
- balanced journal;
- payout cap;
- payout failure and retry;
- reconciliation mismatch.

No test may mutate totals directly to make expected balances pass.

## Consent workflow additions

Test:

- performer accepts;
- performer declines;
- invitation expires;
- agency attempts to consent;
- script version changes;
- collaborator list changes;
- boundary changes;
- compensation changes;
- distribution scope changes;
- consent invalidation;
- re-consent;
- final media version changes;
- final-cut approval invalidation;
- release attempted with one missing approval.

## File workflow additions

Test:

- correct owner and project linkage;
- checksum and version;
- wrong extension with disguised content;
- oversized file;
- interrupted upload;
- duplicate upload;
- unsupported codec;
- inspection failure;
- staff preview permissions;
- expired signed link;
- copied signed link after expiry;
- deletion request;
- legal hold;
- reviewer and submitter see the same persistent file reference.

## Defect severity

### Critical

Unauthorized private-data access, underage-access failure, missing consent enforcement, illegal-content release, unauthorized payout, unbalanced ledger, permanent evidence loss, or production-wide outage.

A critical defect stops all roadmap work.

### High

Cross-role route access without data exposure, incorrect payment state, missing review evidence, wrong entitlement, unrecoverable workflow, or material privacy failure.

A high defect blocks acceptance and the next slice.

### Medium

A workflow has a usable workaround but violates the approved design or causes meaningful confusion.

### Low

Cosmetic or minor copy defect with no workflow, security, privacy, consent, or financial effect.

## Evidence required for acceptance

- commit or pull-request reference;
- CI result;
- staging URL;
- tested roles and accounts;
- desktop and mobile screenshots or recordings;
- test output;
- known limitations;
- completed acceptance checklist;
- explicit product-owner result: accepted, rejected, or accepted with listed low-severity follow-up.

## No-waiver rule

A test does not pass because the defect is unlikely to be noticed. A skipped check must have a written reason, owner, expiry date, and product-owner approval. Consent, age, identity, permissions, financial integrity, and private-data checks cannot be waived for release.
