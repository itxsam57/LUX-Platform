import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button, Input, Status, Table } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";
import { parseCopyrightEvidence } from "@/lib/copyright/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ casePublicId: string }>;
  searchParams: Promise<{ reason?: string }>;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function CopyrightEvidencePage({ params, searchParams }: PageProps) {
  const viewer = await requireWorkspace("staff", "staff-copyright-evidence");
  const supabase = await createServerSupabaseClient();
  if (viewer.context.activeRole !== "copyright" && viewer.context.activeRole !== "super_admin") {
    await supabase.rpc("record_access_denied", { denied_route_key: "staff-copyright-evidence", required_role: "copyright", denial_reason: "copyright_role_required" });
    redirect("/access-denied?route=staff-copyright-evidence");
  }
  const { casePublicId } = await params;
  if (!/^cpy[0-9a-f]{24}$/.test(casePublicId)) notFound();
  const query = await searchParams;
  const reason = typeof query.reason === "string" ? query.reason.trim() : "";
  let evidence = null;
  let loadError = false;
  if (reason.length >= 10 && reason.length <= 500) {
    const result = await supabase.rpc("get_copyright_case_evidence", { requested_case_public_id: casePublicId, requested_access_reason: reason });
    evidence = parseCopyrightEvidence(result.data);
    loadError = Boolean(result.error || !evidence);
  }

  return <div className="workspace-stack">
    <header className="workspace-page-header"><div><span className="eyebrow">Audited evidence access</span><h1>Copyright case evidence</h1><p>Opening evidence requires a reason and creates an audit event. Purchaser identity is not included in this projection.</p></div><Link href="/workspace/staff/copyright">Back to copyright queue</Link></header>
    <form method="get" className="workspace-request-panel"><Input id="evidence-reason" name="reason" label="Reason for evidence access" defaultValue={reason} minLength={10} maxLength={500} required/><Button type="submit">Open audited evidence</Button></form>
    {loadError ? <div className="auth-message auth-message--error" role="alert">Evidence could not be loaded safely.</div> : null}
    {evidence ? <>
      <section className="workspace-request-panel"><div><span className="eyebrow">Case evidence</span><h2>{evidence.releaseTitle}</h2><p>{evidence.reportedUrl}</p><p>{evidence.reportNote}</p></div><Status label={evidence.sourceMatchState.replaceAll("_", " ")} tone={evidence.sourceMatchState === "possible_session_match" ? "warning" : "neutral"}/></section>
      <section className="workspace-stack"><h2>Rights and fingerprints</h2><Table caption="Private rights evidence"><tbody><tr><th scope="row">Ownership</th><td>{evidence.ownershipKind ?? "Not registered"}</td></tr><tr><th scope="row">Licence reference</th><td>{evidence.licenceReference ?? "—"}</td></tr><tr><th scope="row">Ownership evidence</th><td>{evidence.ownershipEvidenceReference ?? "—"}</td></tr><tr><th scope="row">Content SHA-256</th><td>{evidence.contentSha256 ?? "—"}</td></tr><tr><th scope="row">Perceptual fingerprint</th><td>{evidence.perceptualFingerprint ?? "—"}</td></tr><tr><th scope="row">Evidence package</th><td>{evidence.evidencePackageReference ?? "Not prepared"}</td></tr></tbody></Table></section>
      <section className="workspace-stack"><h2>Generated notice artifact</h2><Table caption="Generated copyright notice"><tbody><tr><th scope="row">Document reference</th><td>{evidence.noticeDocumentReference ?? "Not drafted"}</td></tr><tr><th scope="row">Document SHA-256</th><td>{evidence.noticeDocumentSha256 ?? "—"}</td></tr><tr><th scope="row">Provider submission reference</th><td>{evidence.noticeReference ?? "Not submitted"}</td></tr></tbody></Table>{evidence.noticeHistory.length ? <Table caption="Immutable notice history"><thead><tr><th scope="col">Event</th><th scope="col">Document</th><th scope="col">SHA-256</th><th scope="col">Submission</th><th scope="col">Time</th></tr></thead><tbody>{evidence.noticeHistory.map((record) => <tr key={record.recordPublicId}><td>{record.eventType.replaceAll("_", " ")}</td><td>{record.documentReference}</td><td>{record.documentSha256}</td><td>{record.submissionReference ?? "—"}</td><td>{formatTime(record.createdAt)}</td></tr>)}</tbody></Table> : <div className="ui-state-card"><p>No notice artifact has been generated for this case.</p></div>}</section>
      <section className="workspace-stack"><h2>Immutable case history</h2>{evidence.history.length ? <Table caption="Copyright case events"><thead><tr><th scope="col">Event</th><th scope="col">Stage after</th><th scope="col">Reason</th><th scope="col">Reference</th><th scope="col">Time</th></tr></thead><tbody>{evidence.history.map((event) => <tr key={event.eventPublicId}><td>{event.eventType.replaceAll("_", " ")}</td><td>{event.stageAfter.replaceAll("_", " ")}</td><td>{event.reason}</td><td>{event.noticeReference ?? event.evidenceReference ?? "—"}</td><td>{formatTime(event.createdAt)}</td></tr>)}</tbody></Table> : <div className="ui-state-card"><p>No case events were returned.</p></div>}</section>
    </> : reason ? null : <div className="ui-state-card"><h3>Evidence remains closed</h3><p>Enter the operational reason for access to open the audited evidence projection.</p></div>}
  </div>;
}
