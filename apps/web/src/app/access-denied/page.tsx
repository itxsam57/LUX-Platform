import { LinkButton, Status } from "@/components/ui/primitives";

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const route = Array.isArray(params.route) ? params.route[0] : params.route;

  return (
    <main className="gate-shell">
      <section className="gate-card gate-card--denied" aria-labelledby="denied-title">
        <div className="gate-card__header">
          <div>
            <span className="eyebrow">Authorization boundary</span>
            <h1 id="denied-title">Access denied</h1>
          </div>
          <Status label="Denied safely" tone="danger" />
        </div>
        <p className="muted-copy">
          The active workspace does not have permission for this route. Editing the URL cannot add or merge roles.
        </p>
        {route ? <p className="access-route-key">Route key: <code>{route.slice(0, 120)}</code></p> : null}
        <div className="auth-card__actions">
          <LinkButton href="/workspace">Choose an approved workspace</LinkButton>
          <LinkButton href="/settings/security" variant="secondary">Review account security</LinkButton>
        </div>
      </section>
    </main>
  );
}
