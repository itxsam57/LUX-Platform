import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { requireWorkspace } from "@/lib/auth/context";
import { canApprovePlatformReview, parseDeliveryReviewContext } from "@/lib/review/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { decideDeliveryReviewAction, issueReviewerFinalAssetAccessAction, setDeliveryReviewChecklistAction, setFinalDeliveryProcessingAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function DeliveryReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectPublicId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { projectPublicId } = await params;
  if (!/^prj[0-9a-f]{24}$/.test(projectPublicId)) notFound();
  const viewer = await requireWorkspace("staff", "staff-delivery-review");
  const supabase = await createServerSupabaseClient();
  if (viewer.context.activeRole !== "reviewer" && viewer.context.activeRole !== "super_admin") {
    await supabase.rpc("record_access_denied", { denied_route_key: "staff-delivery-review", required_role: "reviewer", denial_reason: "delivery_reviewer_required" });
    redirect("/access-denied?route=staff-delivery-review");
  }
  const query = await searchParams;
  const { data, error } = await supabase.rpc("get_delivery_review_context", { requested_project_public_id: projectPublicId });
  const review = parseDeliveryReviewContext(data);
  if (error || !review || !review.current) notFound();
  const current = review.current;
  const approvalAllowed = canApprovePlatformReview({
    processingState: current.processingState,
    checklist: current.checklist.map((item) => ({ key: item.key, state: item.state })),
    finalCutApprovals: current.finalCutApprovals.map((approval) => ({ required: true, state: approval.state })),
  });

  return <div className="workspace-stack">
    <header className="workspace-page-header"><div><span className="eyebrow">Platform delivery review</span><h1>{review.project.title}</h1><p>Final v{current.version} · {current.status.replaceAll("_", " ")} · SHA-256 {current.sha256.slice(0, 16)}…</p></div><div className="component-row"><Link href="/workspace/staff/delivery-review">Review queue</Link><Link href={`/studio/projects/${projectPublicId}/production`}>Production workspace</Link></div></header>
    {query.notice ? <div className="auth-message auth-message--success" role="status">Delivery review updated.</div> : null}
    {query.error ? <div className="auth-message auth-message--error" role="alert">The delivery review action could not be completed safely.</div> : null}

    <section className="studio-card"><h2>Current final</h2><div className="studio-meta"><span>Processing {current.processingState}</span><span>{current.finalCutApprovals.filter((item)=>item.state!=="approved").length} final-cut blockers</span><span>{current.checklist.filter((item)=>item.required&&item.state!=="pass").length} checklist blockers</span><span>{current.releaseReady ? "Release ready" : "Release blocked"}</span></div><NavigationActionForm action={issueReviewerFinalAssetAccessAction}><input type="hidden" name="project_public_id" value={projectPublicId}/><input type="hidden" name="delivery_public_id" value={current.publicId}/><button className="studio-button" type="submit">Open final securely</button></NavigationActionForm></section>

    <div className="studio-grid studio-grid--two">
      <section className="studio-card"><h2>Processing</h2><NavigationActionForm action={setFinalDeliveryProcessingAction} className="studio-form studio-form--compact"><input type="hidden" name="project_public_id" value={projectPublicId}/><input type="hidden" name="delivery_public_id" value={current.publicId}/><label>Processing state<select name="state" defaultValue={current.processingState}><option value="processing">Processing</option><option value="ready">Ready</option><option value="failed">Failed</option></select></label><label>Reason<textarea name="note" minLength={3} maxLength={1000}/></label><button className="studio-button" type="submit">Update processing</button></NavigationActionForm></section>
      <section className="studio-card"><h2>Depicted-person approvals</h2>{current.finalCutApprovals.length ? current.finalCutApprovals.map((approval)=><article key={approval.handle}><div className="studio-meta"><strong>@{approval.handle}</strong><span>{approval.state.replaceAll("_", " ")}</span></div>{approval.note?<p>{approval.note}</p>:null}</article>) : <p>No depicted-person final-cut approvals are required for this version.</p>}</section>
    </div>

    <section className="studio-card"><h2>Required checklist</h2><div className="studio-grid studio-grid--two">{current.checklist.map((item)=><NavigationActionForm key={item.key} action={setDeliveryReviewChecklistAction} className="studio-form studio-form--compact"><input type="hidden" name="project_public_id" value={projectPublicId}/><input type="hidden" name="delivery_public_id" value={current.publicId}/><input type="hidden" name="item_key" value={item.key}/><strong>{item.label}</strong><span>Current: {item.state}</span>{item.note?<p>{item.note}</p>:null}<label>Result<select name="state" defaultValue={item.state === "pending" ? "pass" : item.state}><option value="pass">Pass</option><option value="fail">Fail</option></select></label><label>Reviewer note<textarea name="note" required minLength={3} maxLength={1000}/></label><button className="studio-button" type="submit">Record check</button></NavigationActionForm>)}</div></section>

    <section className="studio-card"><h2>Platform decision</h2><p>{approvalAllowed ? "All release prerequisites currently pass." : "Approval remains blocked until processing, final-cut approvals, and every required checklist item pass."}</p><NavigationActionForm action={decideDeliveryReviewAction} className="studio-form studio-form--compact"><input type="hidden" name="project_public_id" value={projectPublicId}/><input type="hidden" name="delivery_public_id" value={current.publicId}/><label>Decision<select name="decision" defaultValue={approvalAllowed ? "approve" : "hold"}><option value="approve" disabled={!approvalAllowed}>Approve</option><option value="request_changes">Request changes</option><option value="reject">Reject</option><option value="escalate">Escalate</option><option value="hold">Hold</option></select></label><label>Reason<textarea name="reason" required minLength={3} maxLength={2000}/></label><button className="studio-button studio-button--primary" type="submit">Record platform decision</button></NavigationActionForm></section>

    {review.creatorResponses.length ? <section className="studio-card"><h2>Creator responses</h2>{review.creatorResponses.map((response)=><article key={`${response.deliveryPublicId}-${response.createdAt}`}><strong>v{response.version}</strong><p>{response.body}</p></article>)}</section> : null}
  </div>;
}
