# Production Provider Adapter Contract

This is the connection boundary for real money, payout ownership, adult assurance, and identity verification. LUX owns authorization, immutable campaign/funding terms, verification rules, the double-entry ledger, payout eligibility, consent, audit history, and release gates. External providers own card/bank collection and regulated identity/age evidence.

## Connection rule

A production provider is ready only when LUX has its provider key/label, HTTPS bridge URL, server API credential, webhook verification secret, signature header, and the Supabase server runtime needed to apply normalized callbacks. Missing or invalid configuration fails closed. Production never silently falls back to sandbox payments, synthetic identity, or self-attestation.

The bridge can be a small LUX-owned integration service or a concrete gateway-specific adapter. Replacing a payment, payout/KYC, age, or identity vendor should require changing the bridge implementation and credentials, not LUX product or ledger code.

## Payment bridge

POST /v1/payments/checkout receives the funding commitment public ID, exact minor-unit amount, ISO currency, HTTPS success/cancel URLs, and idempotency key. It returns an opaque checkout reference, HTTPS hosted-checkout URL, and expiry. Raw card numbers, PAN, CVV, or replayable payment credentials must never be returned to LUX.

POST /v1/payments/webhooks/verify receives the raw provider webhook body, incoming signature, and configured webhook-verification secret. It returns the normalized event ID, funding commitment public ID, opaque customer/payment-method/transaction references, state, authorized/captured/refunded amounts, current processing fee, and provider event timestamp. LUX applies its existing payment state machine and double-entry ledger. Stale provider events do not change ledger fees.

## Payout recipient bridge

POST /v1/payouts/recipients/onboarding receives the LUX subject UUID, HTTPS return URL, and idempotency key. It returns an opaque recipient reference, HTTPS onboarding URL, and expiry. Bank account details, KYC documents, and ownership evidence stay with the provider.

POST /v1/payouts/recipients/webhooks/verify returns the normalized event ID, LUX subject UUID, opaque recipient reference, verified/restricted state, ownershipVerified flag, and event timestamp. A verified recipient is required for production payout eligibility.

## Payout dispatch bridge

POST /v1/payouts/dispatch receives the payout public ID, opaque verified recipient reference, exact minor-unit amount, currency, and deterministic idempotency key. It returns an opaque provider payout reference and processing state.

LUX persists a prepared dispatch before contacting the provider, then completes that receipt after provider acceptance. This prevents retries from creating a second transfer.

POST /v1/payouts/webhooks/verify returns event ID, payout public ID, provider payout reference, paid/failed state, reported amount, and event timestamp. A final callback must match a completed LUX dispatch. Amount mismatch opens the existing finance reconciliation path.

## Identity verification bridge

POST /v1/identity/sessions receives subject UUID, target level v2/v3, and HTTPS return URL. It returns a session reference, HTTPS launch URL, and expiry.

POST /v1/identity/results receives a session reference and returns the normalized result.

POST /v1/identity/webhooks/verify returns event ID, session reference, provider event timestamp, provider reference, target level, pending/needs_review/verified/rejected state, liveness result, risk-screen result, and result expiry.

LUX stores no raw document, selfie, biometric, or provider evidence payload. V3 still requires current V2, active performer state, current liveness, provider-verified payout ownership, and consent education.

## Adult assurance bridge

POST /v1/age/sessions receives subject UUID, jurisdiction, HTTPS return URL, and LUX adult-policy version. It returns session reference, HTTPS launch URL, and expiry.

POST /v1/age/webhooks/verify returns event ID, provider reference, subject UUID, jurisdiction, accepted/rejected state, result expiry if accepted, and provider event timestamp. LUX persists only the assurance method/result, jurisdiction, policy version, timestamp, and expiry. DOB and raw age evidence stay with the provider.

## LUX callback URLs

Register these callbacks with the selected bridge/vendors:

- /api/providers/payments/webhook
- /api/providers/payouts/recipient-webhook
- /api/providers/payouts/webhook
- /api/providers/identity/webhook
- /api/providers/age/webhook

Each route reads only its configured signature header, verifies/normalizes through the configured adapter, and then applies state through server-only RPCs.

## Go-live wiring checklist

1. Implement or deploy the provider bridge endpoints above for the selected vendors.
2. Set the corresponding server environment variables from .env.example; never expose API, webhook, or Supabase service credentials to the browser.
3. Register the five LUX callback URLs with the vendors.
4. Confirm the bridge health endpoint reports healthy and credentials belong to the intended production account.
5. Run all database migrations and provider-adapter pgTAP suites.
6. Run real staging flows: checkout -> payment callback -> ledger; payout onboarding -> ownership; payout dispatch -> final callback; V2/V3 identity; adult assurance.
7. Run backup/restore, cross-role/privacy tests, finance reconciliation, and owner acceptance on the exact deployment SHA.
8. Switch provider accounts to production only after staging evidence is green.

No provider is allowed to bypass LUX authorization, campaign terms, consent, release review, ledger, payout holds, or audit history.
