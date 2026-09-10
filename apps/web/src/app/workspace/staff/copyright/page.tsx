import Link from "next/link";
import { redirect } from "next/navigation";
import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { Button, Input, Select, Status, Table, Textarea } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";
import { parseCopyrightIntakeList, parseCopyrightStaffCaseList } from "@/lib/copyright/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { advanceCopyrightCaseAction, openCopyrightCaseAction, recordCopyrightSourceMatchAction } from "./actions";

export const dynamic = "force-dynamic";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function CopyrightOperationsPage() {
  const viewer = await requireWorkspace("staff", "staff-copyright");
  const supabase = await createServerSupabaseClient();
  if (viewer.context.activeRole !== "copyright" && viewer.context.activeRole !== "super_admin") {
    await supabase.rpc("record_access_denied", { denied_route_key: "staff-copyright", required_role: "copyright", denial_reason: "copyright_role_required" });
    redirect("/access-denied?route=staff-copyright");
  }
  const [intakeResult, casesResult] = await Promise.all([
    supabase.rpc("list_copyright_intake_queue"),
    supabase.rpc("list_copyright_staff_cases"),
  ]);
  const intake = parseCopyrightIntakeList(intakeResult.data);
  const cases = parseCopyrightStaffCaseList(casesResult.data);
  const loadError = Boolean(intakeResult.error || casesResult.error);

  return <div className="workspace-stack">
    <header className="workspace-page-header"><div><span className="eyebrow">Copyright-only operations</span><h1>Copied-content operations</h1><p>Triage reports, record source matches, prepare evidence, track notices, confirm reported-link removal, and monitor recurrence.</p></div><Status label={loadError ? "Unavailable" : `${cases.length} cases`} tone={loadError ? "danger" : cases.length ? "warning" : "success"}/></header>
    <div className="ui-state-card"><h3>Removal scope</h3><p>A removal confirmation means the reported location was confirmed unavailable. It never claims that every copy was deleted from the internet.</p></div>

    <section className="workspace-stack" aria-labelledby="intake-heading"><div className="workspace-page-header"><div><span className="eyebrow">Intake</span><h2 id="intake-heading">Copied-release reports</h2><p>Reporter identity is excluded from this queue. Open a case only after a staff reason is recorded.</p></div></div>{intake.length ? <Table caption="Copied-release intake"><thead><tr><th scope="col">Release</th><th scope="col">Reported URL</th><th scope="col">Received</th><th scope="col">Case</th></tr></thead><tbody>{intake.map((row) => <tr key={row.reportPublicId}><td>{row.releaseTitle}</td><td>{row.reportedUrl}</td><td>{formatTime(row.reportCreatedAt)}</td><td>{row.casePublicId ? <Link href={`/workspace/staff/copyright/${row.casePublicId}`}>{row.casePublicId}</Link> : <NavigationActionForm action={openCopyrightCaseAction}><input type="hidden" name="report_public_id" value={row.reportPublicId}/><Input id={`open-reason-${row.reportPublicId}`} name="reason" label="Opening reason" minLength={10} maxLength={2000} required/><Button type="submit" size="small">Open case</Button></NavigationActionForm>}</td></tr>)}</tbody></Table> : !loadError ? <div className="ui-state-card"><h3>No copied-release reports</h3><p>New private reports will appear here without exposing reporter identity.</p></div> : null}</section>

    <section className="workspace-stack" aria-labelledby="cases-heading"><div className="workspace-page-header"><div><span className="eyebrow">Case queue</span><h2 id="cases-heading">Open and historical cases</h2><p>False-positive, counter-notice, removal, recurrence, and closure transitions are append-only in the case history.</p></div></div>{cases.length ? cases.map((row) => <article className="workspace-request-panel" key={row.publicId}><div><h3>{row.releaseTitle}</h3><p>{row.reportedUrl}</p><p>Stage: {row.stage.replaceAll("_", " ")} · notice: {row.noticeStatus.replaceAll("_", " ")} · recurrence: {row.recurrenceCount}</p><p>Rights {row.rightsRegistered ? "registered" : "not registered"}{row.repeatInfringerFlag ? " · repeat-infringer policy flagged" : ""}</p><Link href={`/workspace/staff/copyright/${row.publicId}`}>Open audited evidence view</Link></div><div className="workspace-stack">
        <NavigationActionForm action={advanceCopyrightCaseAction} className="workspace-form-grid"><input type="hidden" name="case_public_id" value={row.publicId}/><Select id={`action-${row.publicId}`} name="action" label="Case action" required><option value="begin_matching">Begin matching</option><option value="prepare_evidence">Prepare evidence package</option><option value="draft_notice">Draft notice</option><option value="submit_notice">Record notice submission</option><option value="confirm_removal">Confirm reported-link removal</option><option value="record_recurrence">Record recurrence</option><option value="record_counter_notice">Record counter-notice</option><option value="mark_false_positive">Close as false positive</option><option value="close_case">Close case</option></Select><Textarea id={`reason-${row.publicId}`} name="reason" label="Audited reason" minLength={10} maxLength={2000} required/><Input id={`notice-${row.publicId}`} name="notice_reference" label="Notice reference (required for submission)" maxLength={180}/><Button type="submit" variant="secondary">Apply transition</Button></NavigationActionForm>
        <NavigationActionForm action={recordCopyrightSourceMatchAction} className="workspace-form-grid"><input type="hidden" name="case_public_id" value={row.publicId}/><Select id={`match-${row.publicId}`} name="state" label="Source match" required><option value="no_match">No match</option><option value="possible_session_match">Possible session match</option></Select><Input id={`source-${row.publicId}`} name="source_fingerprint" label="Source fingerprint (required for possible match)" minLength={64} maxLength={64}/><Textarea id={`match-reason-${row.publicId}`} name="reason" label="Match reason" minLength={10} maxLength={2000} required/><Button type="submit" variant="secondary">Record match</Button></NavigationActionForm>
      </div></article>) : !loadError ? <div className="ui-state-card"><h3>No copyright cases</h3><p>Opened copied-content cases will appear here with their current stage.</p></div> : null}</section>
  </div>;
}
