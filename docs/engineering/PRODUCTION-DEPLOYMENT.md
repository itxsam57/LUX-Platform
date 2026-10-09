# Production Deployment Runbook

LUX is deployable as a stateless Next.js application backed by Supabase/Postgres and replaceable external providers. The checked-in container path avoids locking the product to one hosting vendor.

## Required launch dependencies

Before production traffic is enabled:

- run every Supabase migration through the exact deployment SHA;
- run all pgTAP suites against the target schema;
- configure the public Supabase URL/key and server-only service-role key;
- configure production payment, payout, identity, age-assurance, storage, streaming, moderation, and media-protection adapters required by the deployment;
- register provider webhooks and verify their signatures in staging;
- verify object-storage private buckets and tokenized media routes;
- execute backup/restore recovery against an isolated temporary database;
- run the full application, engineering, dependency-security, and browser acceptance gates.

Missing regulated-provider configuration must remain fail-closed. Do not enable production traffic by substituting sandbox payment, synthetic identity, or self-attestation where provider assurance is required.

## Container deployment

Build from repository root with `docker build -t lux-platform:<git-sha> .`. Run with production secrets injected by the host secret manager using `docker run --rm -p 30002:30002 --env-file <secure-runtime-env> lux-platform:<git-sha>`.

Do not bake real credentials into the image or commit runtime environment files. The container exposes port 30002 and checks `/health`. The deployment platform should route external HTTPS traffic to that port and terminate TLS using its managed certificate service.

## Release sequence

1. Create an immutable image tagged with the exact Git SHA.
2. Apply database migrations before routing the new application revision.
3. Execute pgTAP and smoke tests against the migrated staging environment.
4. Exercise payment checkout/capture/refund, payout onboarding/dispatch/final callback, V2/V3 verification, adult assurance, private upload/playback, moderation, and media-protection staging paths.
5. Execute cross-role/privacy and release-entitlement acceptance.
6. Verify `/health`, provider health, audit writes, notification delivery, finance reconciliation queues, and backup recovery.
7. Promote the exact tested image digest to production.
8. Keep the previous known-good image available for application rollback. Database rollback is migration-specific; never destructively reverse financial/audit history.

## Scaling and idle cost

The web container is stateless and may scale horizontally or to zero where the chosen host supports it. Durable state belongs in Postgres/Supabase storage or the configured provider. Do not add in-memory queues or local-disk state that would break horizontal scaling.

Provider callbacks must be retried by the provider/bridge and remain idempotent. Long-running media, moderation, and protection work belongs behind provider adapters rather than inside the request process.

## Rollback

Application rollback means routing traffic to the previous tested image. If a newly applied schema is backward compatible, leave it in place. For an incompatible schema incident, follow an explicitly reviewed forward-fix or migration-specific recovery plan; never delete ledger, consent, provider-event, moderation, copyright, or audit history to make an older build fit.

For data-loss or corruption recovery, use the repository backup-recovery procedure against an isolated database first, validate probes, then follow the production incident process.
