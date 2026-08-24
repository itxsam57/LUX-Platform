import {
  logoutAllDevicesAction,
  logoutCurrentDeviceAction,
} from "@/app/auth/actions";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Button, Card, Status, Table } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireAdultViewer("/settings/security");
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const supabase = await createServerSupabaseClient();
  const { data: events } = await supabase
    .from("audit_events")
    .select("id, event_type, outcome, route_key, created_at")
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Account security</span>
            <h1>Sessions and audit history</h1>
            <p>End only this browser session or revoke every LUX session attached to the account.</p>
          </div>
          <Status label="Server verified" tone="success" />
        </header>

        {error ? <div className="auth-message auth-message--error" role="alert">The global sign-out could not be completed safely.</div> : null}

        <div className="catalogue-grid catalogue-grid--two">
          <Card className="security-action-card">
            <span className="eyebrow">This browser</span>
            <h2>Sign out current device</h2>
            <p>Ends only the current Supabase session and clears this browser’s authentication cookies.</p>
            <form action={logoutCurrentDeviceAction}>
              <Button type="submit" variant="secondary">Sign out this device</Button>
            </form>
          </Card>
          <Card className="security-action-card security-action-card--danger">
            <span className="eyebrow">All sessions</span>
            <h2>Sign out every device</h2>
            <p>Advances the LUX revocation epoch first, then terminates all Supabase sessions for the account.</p>
            <form action={logoutAllDevicesAction}>
              <Button type="submit" variant="danger">Sign out all devices</Button>
            </form>
          </Card>
        </div>

        <section className="security-audit" aria-labelledby="audit-title">
          <div>
            <span className="eyebrow">Private account record</span>
            <h2 id="audit-title">Recent security events</h2>
          </div>
          {events?.length ? (
            <Table caption="Recent security audit events for this account">
              <thead>
                <tr><th scope="col">Event</th><th scope="col">Outcome</th><th scope="col">Route</th><th scope="col">Time</th></tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{event.event_type.replaceAll("_", " ")}</td>
                    <td>{event.outcome}</td>
                    <td>{event.route_key ?? "—"}</td>
                    <td>{new Date(event.created_at).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="muted-copy">No readable account audit events are available yet.</p>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
