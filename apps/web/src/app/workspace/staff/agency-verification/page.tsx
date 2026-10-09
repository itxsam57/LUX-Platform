import { redirect } from "next/navigation";
import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { Button, Select, Status, Table, Textarea } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";
import { parseAgencyVerificationQueue } from "@/lib/agency/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reviewAgencyVerificationAction } from "./actions";

export const dynamic = "force-dynamic";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AgencyVerificationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireWorkspace("staff", "staff-agency-verification");
  const supabase = await createServerSupabaseClient();
  if (viewer.context.activeRole !== "reviewer" && viewer.context.activeRole !== "super_admin") {
    await supabase.rpc("record_access_denied", { denied_route_key: "staff-agency-verification", required_role: "reviewer", denial_reason: "agency_verification_reviewer_required" });
    redirect("/access-denied?route=staff-agency-verification");
  }

  const params = await searchParams;
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const actionError = Array.isArray(params.error) ? params.error[0] : params.error;
  const { data, error } = await supabase.rpc("list_agency_verification_queue");
  const rows = parseAgencyVerificationQueue(data);

  return <div className="workspace-stack">
    <header className="workspace-page-header">
      <div><span className="eyebrow">Reviewer-only agency boundary</span><h1>Agency verification queue</h1><p>Review normalized agency metadata. Private verification evidence references are intentionally excluded from this projection.</p></div>
      <Status label={error ? "Unavailable" : `${rows.length} agencies`} tone={error ? "danger" : rows.some((row) => row.verificationStatus === "pending") ? "warning" : "success"} />
    </header>
    {notice ? <div className="auth-message auth-message--success" role="status">Agency verification review completed.</div> : null}
    {actionError ? <div className="auth-message auth-message--error" role="alert">The previous agency verification action could not be completed safely.</div> : null}
    {error ? <div className="auth-message auth-message--error" role="alert">The agency verification queue could not be loaded safely.</div> : null}
    {rows.length ? <Table caption="Agency verification review queue"><thead><tr><th scope="col">Agency</th><th scope="col">Jurisdiction</th><th scope="col">Provider</th><th scope="col">State</th><th scope="col">Previous reason</th><th scope="col">Updated</th><th scope="col">Review</th></tr></thead><tbody>{rows.map((row) => <tr key={row.agencyPublicId}><td><strong>{row.displayName}</strong><br/><small>{row.agencyPublicId}</small></td><td>{row.jurisdictionCode}</td><td>{row.verificationProvider ?? "—"}</td><td>{row.verificationStatus}</td><td>{row.verificationReason ?? "—"}</td><td>{formatTime(row.updatedAt)}</td><td><NavigationActionForm action={reviewAgencyVerificationAction} className="workspace-inline-form"><input type="hidden" name="agency_public_id" value={row.agencyPublicId} /><Select id={`agency-review-decision-${row.agencyPublicId}`} name="decision" label="Decision" required><option value="approved">Approve</option><option value="rejected">Reject</option><option value="revoked">Revoke</option></Select><Textarea id={`agency-review-reason-${row.agencyPublicId}`} name="reason" label="Reason" minLength={3} maxLength={500} required /><Button type="submit" size="small">Record review</Button></NavigationActionForm></td></tr>)}</tbody></Table> : !error ? <div className="ui-state-card"><h2>No agencies to review</h2><p>Agency verification state will appear here after an agency profile is created.</p></div> : null}
  </div>;
}
