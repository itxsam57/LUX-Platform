import Link from "next/link";
import { redirect } from "next/navigation";
import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { Button, Input, LinkButton, Select, Status, Table, Textarea } from "@/components/ui/primitives";
import {
  ADMIN_QUEUE_KEYS,
  isAdminQueueKey,
  parseAdminOverview,
  parseAdminQueueRows,
  parseAuditExplorerRows,
  parseOperationalIncidents,
  parseOperationalRateLimits,
  parseOperationalSearch,
  parseOperationalSearchResults,
  staffCanAccessAdminQueue,
  type AdminQueueKey,
  type AdminQueueRow,
} from "@/lib/admin/policy";
import { requireWorkspace } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  performCriticalAdminAction,
  resolveAdminCaseAction,
  reviewAppealAction,
  reviewConsumerDisputeAction,
  updateOperationalRateLimitAction,
} from "./actions";

export const dynamic = "force-dynamic";

const OPERATIONS_PATH = "/workspace/staff/operations";

const QUEUE_LABELS: Record<AdminQueueKey, string> = {
  users: "Users",
  roles: "Roles",
  verification: "Verification",
  projects: "Projects",
  campaigns: "Campaigns",
  moderation: "Moderation",
  review: "Review",
  copyright: "Copyright",
  finance: "Finance",
  payouts: "Payouts",
  support: "Support",
  disputes: "Disputes",
  appeals: "Appeals",
  configuration: "Configuration",
  audit: "Audit",
  incidents: "Incidents",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatValue(value: string | number | boolean | null) {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function rowIdentity(row: AdminQueueRow, index: number) {
  return String(row.publicId ?? row.handle ?? row.key ?? `${row.kind}-${index}`);
}

function rowSummary(row: AdminQueueRow) {
  const hidden = new Set(["kind", "publicId", "handle", "key"]);
  return Object.entries(row)
    .filter(([key]) => !hidden.has(key))
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(" · ");
}

export default async function StaffOperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireWorkspace("staff", "workspace-staff-admin");
  const supabase = await createServerSupabaseClient();
  const params = await searchParams;
  const accessibleQueues = ADMIN_QUEUE_KEYS.filter((queue) => staffCanAccessAdminQueue(viewer.context.activeRole, queue));
  if (!accessibleQueues.length) redirect("/access-denied?route=workspace-staff-admin");

  const requestedQueue = first(params.queue);
  if (requestedQueue && (!isAdminQueueKey(requestedQueue) || !accessibleQueues.includes(requestedQueue))) {
    await supabase.rpc("record_access_denied", {
      denied_route_key: "workspace-staff-admin",
      required_role: viewer.context.activeRole,
      denial_reason: "unauthorized_admin_queue",
    });
    redirect("/access-denied?route=workspace-staff-admin");
  }
  const queue = (requestedQueue as AdminQueueKey | undefined) ?? accessibleQueues[0];
  const rawSearch = first(params.q) ?? "";
  const searchQuery = rawSearch ? parseOperationalSearch(rawSearch) : null;
  const searchInvalid = Boolean(rawSearch && !searchQuery);

  const queuePromise = queue === "audit"
    ? supabase.rpc("list_audit_explorer", { limit_count: 100 })
    : queue === "incidents"
      ? supabase.rpc("list_operational_incidents")
      : queue === "disputes" || queue === "appeals"
        ? supabase.rpc("list_trust_staff_queue", { queue_key: queue })
        : supabase.rpc("list_admin_queue", { queue_key: queue });
  const overviewPromise = viewer.context.activeRole === "super_admin"
    ? supabase.rpc("get_admin_overview")
    : Promise.resolve({ data: null, error: null });
  const searchPromise = searchQuery
    ? supabase.rpc("search_operations", { search_query: searchQuery })
    : Promise.resolve({ data: null, error: null });
  const rateLimitsPromise = staffCanAccessAdminQueue(viewer.context.activeRole, "configuration")
    ? supabase.rpc("list_operational_rate_limits")
    : Promise.resolve({ data: null, error: null });

  const [queueResult, overviewResult, searchResult, rateLimitResult] = await Promise.all([
    queuePromise,
    overviewPromise,
    searchPromise,
    rateLimitsPromise,
  ]);

  const overview = parseAdminOverview(overviewResult.data);
  const queueRows = queue === "audit" || queue === "incidents" ? [] : parseAdminQueueRows(queueResult.data);
  const auditRows = queue === "audit" ? parseAuditExplorerRows(queueResult.data) : [];
  const incidents = queue === "incidents" ? parseOperationalIncidents(queueResult.data) : null;
  const searchRows = searchQuery ? parseOperationalSearchResults(searchResult.data) : [];
  const rateLimits = parseOperationalRateLimits(rateLimitResult.data);
  const loadError = Boolean(queueResult.error
    || (queue === "incidents" && !incidents)
    || (searchQuery && searchResult.error)
    || (viewer.context.activeRole === "super_admin" && (overviewResult.error || !overview)));
  const notice = first(params.notice);
  const error = first(params.error);

  return <div className="workspace-stack">
    <header className="workspace-page-header">
      <div><span className="eyebrow">Scoped staff operations</span><h1>Administration and launch operations</h1><p>Queues, search, audit, incident controls, holds, and rate limits are projected through role-scoped server RPCs.</p></div>
      <Status label={loadError ? "Unavailable" : `${accessibleQueues.length} queues allowed`} tone={loadError ? "danger" : "success"}/>
    </header>

    {notice ? <div className="auth-message auth-message--success" role="status">Operation completed.</div> : null}
    {error || loadError ? <div className="auth-message auth-message--error" role="alert">The requested operation could not be completed safely.</div> : null}

    {overview ? <section className="workspace-request-panel" aria-labelledby="overview-heading"><div><span className="eyebrow">Super-admin overview</span><h2 id="overview-heading">Open operational load</h2><p>{Object.entries(overview).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p></div></section> : null}

    <section className="workspace-request-panel" aria-labelledby="search-heading">
      <div><span className="eyebrow">Operational search</span><h2 id="search-heading">Search only the queues this role may access</h2><p>Search projects, campaigns, users, cases, payouts, and reviews without exposing private briefs, evidence references, or provider identifiers.</p></div>
      <form method="get" className="workspace-form-grid">
        <input type="hidden" name="queue" value={queue}/>
        <Input id="operations-search" name="q" label="Search" defaultValue={rawSearch} minLength={1} maxLength={120} required/>
        <Button type="submit">Search operations</Button>
      </form>
    </section>
    {searchInvalid ? <div className="auth-message auth-message--error" role="alert">Search must contain 1–120 safe characters.</div> : null}
    {searchQuery ? <section className="workspace-stack" aria-labelledby="search-results-heading"><h2 id="search-results-heading">Search results</h2>{searchRows.length ? <Table caption="Scoped operational search results"><thead><tr><th scope="col">Type</th><th scope="col">Result</th><th scope="col">State</th><th scope="col">Open</th></tr></thead><tbody>{searchRows.map((row, index) => <tr key={`${row.kind}-${row.publicId ?? row.handle ?? index}`}><td>{row.kind}</td><td>{row.label}</td><td>{row.state ?? "—"}</td><td>{row.path ? <Link href={row.path}>Open</Link> : "Queue only"}</td></tr>)}</tbody></Table> : <div className="ui-state-card"><h3>No results</h3><p>No authorized operational records matched this search.</p></div>}</section> : null}

    <nav className="funding-tabs" aria-label="Operational queues">
      {accessibleQueues.map((item) => <Link className={`funding-tab${item === queue ? " funding-tab--active" : ""}`} href={`${OPERATIONS_PATH}?queue=${item}`} key={item}>{QUEUE_LABELS[item]}</Link>)}
    </nav>

    <section className="workspace-stack" aria-labelledby="queue-heading">
      <header className="workspace-page-header"><div><span className="eyebrow">Authorized queue</span><h2 id="queue-heading">{QUEUE_LABELS[queue]}</h2></div></header>
      {queue === "audit" ? (auditRows.length ? <Table caption="Immutable audit explorer"><thead><tr><th scope="col">Event</th><th scope="col">Outcome</th><th scope="col">Route</th><th scope="col">Role</th><th scope="col">Actor</th><th scope="col">Time</th></tr></thead><tbody>{auditRows.map((row, index) => <tr key={`${row.createdAt}-${row.eventType}-${index}`}><td>{row.eventType}</td><td>{row.outcome}</td><td>{row.routeKey ?? "—"}</td><td>{row.targetRole ?? "—"}</td><td>{row.actorHandle ? `@${row.actorHandle}` : "system"}</td><td>{new Date(row.createdAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</td></tr>)}</tbody></Table> : <div className="ui-state-card"><h3>No audit events</h3><p>No projected audit entries are available.</p></div>) : null}

      {queue === "incidents" && incidents ? <>
        <Table caption="Operational incidents"><thead><tr><th scope="col">Incident</th><th scope="col">Scope</th><th scope="col">Severity</th><th scope="col">State</th><th scope="col">Summary</th></tr></thead><tbody>{incidents.incidents.map((row) => <tr key={row.publicId}><td>{row.publicId}</td><td>{row.scopeKey}</td><td>{row.severity}</td><td>{row.state}</td><td>{row.summary}</td></tr>)}</tbody></Table>
        <Table caption="Legal holds"><thead><tr><th scope="col">Hold</th><th scope="col">Target</th><th scope="col">State</th><th scope="col">Reason</th></tr></thead><tbody>{incidents.legalHolds.map((row) => <tr key={row.publicId}><td>{row.publicId}</td><td>{row.targetPublicId}</td><td>{row.state}</td><td>{row.reason}</td></tr>)}</tbody></Table>
        <Table caption="Abuse holds"><thead><tr><th scope="col">Hold</th><th scope="col">Target</th><th scope="col">State</th><th scope="col">Reason</th></tr></thead><tbody>{incidents.abuseHolds.map((row) => <tr key={row.publicId}><td>{row.publicId}</td><td>{row.targetPublicId}</td><td>{row.state}</td><td>{row.reason}</td></tr>)}</tbody></Table>
      </> : null}

      {queue !== "audit" && queue !== "incidents" ? (queueRows.length ? <Table caption={`${QUEUE_LABELS[queue]} operational queue`}><thead><tr><th scope="col">Item</th><th scope="col">Details</th><th scope="col">Action</th></tr></thead><tbody>{queueRows.map((row, index) => <tr key={rowIdentity(row, index)}><td>{String(row.publicId ?? row.handle ?? row.key ?? row.kind)}</td><td>{rowSummary(row)}</td><td>
          {(queue === "moderation" || queue === "support") && row.state !== "resolved" && typeof row.publicId === "string"
            ? <NavigationActionForm action={resolveAdminCaseAction} className="workspace-form-grid"><input type="hidden" name="queue" value={queue}/><input type="hidden" name="case_public_id" value={row.publicId}/><Textarea id={`resolve-${row.publicId}`} name="reason" label="Resolution reason" minLength={8} maxLength={1000} required/><Input id={`confirm-${row.publicId}`} name="confirmation" label="Type CONFIRM" pattern="CONFIRM" required/><Button type="submit" size="small" variant="secondary">Resolve</Button></NavigationActionForm>
            : queue === "disputes" && (row.state === "open" || row.state === "in_review") && typeof row.publicId === "string"
              ? <NavigationActionForm action={reviewConsumerDisputeAction} className="workspace-form-grid"><input type="hidden" name="case_public_id" value={row.publicId}/><Select id={`dispute-decision-${row.publicId}`} name="decision" label="Decision" required><option value="start_review">Start review</option><option value="resolve">Resolve</option><option value="reject">Reject</option></Select><Textarea id={`dispute-reason-${row.publicId}`} name="reason" label="Consumer-visible decision/review note" minLength={8} maxLength={2000} required/><Button type="submit" size="small" variant="secondary">Record dispute review</Button></NavigationActionForm>
              : queue === "appeals" && (row.state === "open" || row.state === "in_review") && typeof row.publicId === "string"
                ? <NavigationActionForm action={reviewAppealAction} className="workspace-form-grid"><input type="hidden" name="case_public_id" value={row.publicId}/><Select id={`appeal-decision-${row.publicId}`} name="decision" label="Decision" required><option value="start_review">Start review</option><option value="uphold">Uphold prior decision</option><option value="overturn">Overturn and reopen source</option><option value="close">Close appeal</option></Select><Textarea id={`appeal-reason-${row.publicId}`} name="reason" label="Consumer-visible appeal note" minLength={8} maxLength={2000} required/><Button type="submit" size="small" variant="secondary">Record appeal review</Button></NavigationActionForm>
                : "View only"}
        </td></tr>)}</tbody></Table> : <div className="ui-state-card"><h3>No queue items</h3><p>This authorized queue is currently empty.</p></div>) : null}
    </section>

    {staffCanAccessAdminQueue(viewer.context.activeRole, "incidents") ? <section className="workspace-request-panel" aria-labelledby="critical-heading"><div><span className="eyebrow">Confirmed critical action</span><h2 id="critical-heading">Incident and legal-hold controls</h2><p>Every mutation requires an explicit target, a meaningful reason, and the exact confirmation word.</p></div><NavigationActionForm action={performCriticalAdminAction} className="workspace-form-grid"><Select id="critical-action" name="action" label="Action" required><option value="open_incident">Open incident</option><option value="resolve_incident">Resolve incident</option><option value="place_legal_hold">Place legal hold</option><option value="release_legal_hold">Release legal hold</option></Select><Input id="critical-target" name="target_public_id" label="Scope, target, incident, or hold public ID" minLength={8} maxLength={120} required/><Textarea id="critical-reason" name="reason" label="Reason" minLength={8} maxLength={1000} required/><Input id="critical-confirm" name="confirmation" label="Type CONFIRM" pattern="CONFIRM" required/><Button type="submit" variant="danger">Record critical action</Button></NavigationActionForm></section> : null}

    {staffCanAccessAdminQueue(viewer.context.activeRole, "moderation") ? <section className="workspace-request-panel" aria-labelledby="abuse-heading"><div><span className="eyebrow">Abuse control</span><h2 id="abuse-heading">Apply or release an abuse hold</h2><p>Moderation holds are audited and can be released only through the same scoped control path.</p></div><NavigationActionForm action={performCriticalAdminAction} className="workspace-form-grid"><Select id="abuse-action" name="action" label="Action" required><option value="apply_abuse_hold">Apply abuse hold</option><option value="release_abuse_hold">Release abuse hold</option></Select><Input id="abuse-target" name="target_public_id" label="Target or abuse-hold public ID" minLength={8} maxLength={120} required/><Textarea id="abuse-reason" name="reason" label="Reason" minLength={8} maxLength={1000} required/><Input id="abuse-confirm" name="confirmation" label="Type CONFIRM" pattern="CONFIRM" required/><Button type="submit" variant="danger">Record abuse control</Button></NavigationActionForm></section> : null}

    {staffCanAccessAdminQueue(viewer.context.activeRole, "configuration") ? <section className="workspace-stack" aria-labelledby="rate-limits-heading"><header className="workspace-page-header"><div><span className="eyebrow">Launch hardening</span><h2 id="rate-limits-heading">Operational rate limits</h2><p>Changes are bounded, confirmed, revisioned, and written to immutable history.</p></div></header>{rateLimits.map((limit) => <section className="workspace-request-panel" key={limit.key}><div><h3>{limit.key}</h3><p>Revision {limit.revision} · {limit.maxRequests} requests / {limit.windowSeconds}s · {limit.enabled ? "enabled" : "disabled"}</p></div><NavigationActionForm action={updateOperationalRateLimitAction} className="workspace-form-grid"><input type="hidden" name="key" value={limit.key}/><Input id={`count-${limit.key}`} name="max_requests" label="Max requests" type="number" min={1} max={10000} defaultValue={limit.maxRequests} required/><Input id={`window-${limit.key}`} name="window_seconds" label="Window seconds" type="number" min={1} max={86400} defaultValue={limit.windowSeconds} required/><Select id={`enabled-${limit.key}`} name="enabled" label="Enabled" defaultValue={String(limit.enabled)} required><option value="true">Enabled</option><option value="false">Disabled</option></Select><Textarea id={`reason-${limit.key}`} name="reason" label="Change reason" minLength={8} maxLength={1000} required/><Input id={`confirm-rate-${limit.key}`} name="confirmation" label="Type CONFIRM" pattern="CONFIRM" required/><Button type="submit" variant="secondary">Update rate limit</Button></NavigationActionForm></section>)}</section> : null}

    <div className="studio-actions"><LinkButton href="/workspace/staff" variant="secondary">Back to staff workspace</LinkButton></div>
  </div>;
}
