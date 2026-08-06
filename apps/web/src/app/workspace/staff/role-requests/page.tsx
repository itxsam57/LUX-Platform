import { redirect } from "next/navigation";
import { reviewWorkspaceRequestAction } from "../../actions";
import { Button, Status, Table } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function RoleRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireWorkspace("staff", "staff-role-requests");
  if (viewer.context.activeRole !== "super_admin") {
    const supabase = await createServerSupabaseClient();
    await supabase.rpc("record_access_denied", {
      denied_route_key: "staff-role-requests",
      required_role: "super_admin",
      denial_reason: "super_admin_required",
    });
    redirect("/access-denied?route=staff-role-requests");
  }

  const params = await searchParams;
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const supabase = await createServerSupabaseClient();
  const { data, error: queryError } = await supabase
    .from("workspace_memberships")
    .select("id, user_id, role, status, requested_at")
    .eq("status", "requested")
    .in("role", ["creator", "agency"])
    .order("requested_at", { ascending: true });

  const requests = queryError ? [] : data ?? [];

  return (
    <div className="workspace-stack">
      <header className="workspace-page-header">
        <div>
          <span className="eyebrow">Super-admin only</span>
          <h1>Workspace role requests</h1>
          <p>Approve or reject an exact creator or agency membership using its requester and membership IDs.</p>
        </div>
        <Status label={`${requests.length} pending`} tone={requests.length ? "warning" : "success"} />
      </header>

      {notice ? <div className="auth-message auth-message--success" role="status">Request {notice}.</div> : null}
      {error || queryError ? <div className="auth-message auth-message--error" role="alert">The request queue could not be completed safely.</div> : null}

      {requests.length ? (
        <Table caption="Pending creator and agency workspace requests">
          <thead>
            <tr>
              <th scope="col">Requester</th>
              <th scope="col">Membership</th>
              <th scope="col">Requested role</th>
              <th scope="col">Requested</th>
              <th scope="col">Decision</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td><code>{request.user_id.slice(0, 8)}…</code></td>
                <td><code>{request.id.slice(0, 8)}…</code></td>
                <td>{request.role}</td>
                <td>{new Date(request.requested_at).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td>
                  <div className="component-row">
                    <form action={reviewWorkspaceRequestAction}>
                      <input type="hidden" name="membership_id" value={request.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <Button type="submit" size="small">Approve</Button>
                    </form>
                    <form action={reviewWorkspaceRequestAction}>
                      <input type="hidden" name="membership_id" value={request.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <Button type="submit" size="small" variant="danger">Reject</Button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <div className="ui-state-card">
          <span className="ui-state-card__icon" aria-hidden="true">✓</span>
          <h2>No pending requests</h2>
          <p>The queue contains only creator and agency memberships in the requested state.</p>
        </div>
      )}
    </div>
  );
}
