import Link from "next/link";
import { notFound } from "next/navigation";
import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseFinalCutReviewContext } from "@/lib/review/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { issueFinalCutAssetAccessAction, recordFinalCutApprovalAction } from "./actions";

export const dynamic = "force-dynamic";

function when(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Pending";
}

export default async function FinalCutReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ deliveryPublicId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { deliveryPublicId } = await params;
  if (!/^fdv[0-9a-f]{24}$/.test(deliveryPublicId)) notFound();
  const viewer = await requireAdultViewer(`/final-cut/${deliveryPublicId}`);
  const query = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_final_cut_review_context", {
    requested_delivery_public_id: deliveryPublicId,
  });
  const review = parseFinalCutReviewContext(data);
  if (error || !review) notFound();

  return <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}><main className="studio-page">
    <header className="studio-header"><div><span className="eyebrow">Personal depicted-person approval</span><h1>{review.projectTitle}</h1><p>Final delivery v{review.delivery.version} · {review.delivery.reviewStatus.replaceAll("_", " ")}</p></div><div className="studio-actions"><Link className="studio-button" href={`/studio/projects/${review.projectPublicId}/production`}>Production workspace</Link></div></header>
    {query.notice ? <p className="studio-notice" role="status">Your final-cut decision was recorded.</p> : null}
    {query.error ? <p className="studio-error" role="alert">The final-cut action could not be completed safely.</p> : null}
    <section className="studio-card">
      <h2>Approve this exact final</h2>
      <p>This approval belongs only to version {review.delivery.version} and SHA-256 {review.delivery.sha256.slice(0, 16)}…. A changed final creates a new version and requires a fresh decision.</p>
      <div className="studio-meta"><span>Processing {review.delivery.processingState}</span><span>Terms {review.contract.termsHash.slice(0, 12)}…</span><span>Current decision {review.approval.state.replaceAll("_", " ")}</span><span>{when(review.approval.respondedAt)}</span></div>
      {review.approval.note ? <p>{review.approval.note}</p> : null}
      <NavigationActionForm action={issueFinalCutAssetAccessAction}><input type="hidden" name="delivery_public_id" value={deliveryPublicId}/><button className="studio-button" type="submit">Open final securely</button></NavigationActionForm>
      <NavigationActionForm action={recordFinalCutApprovalAction} className="studio-form studio-form--compact">
        <input type="hidden" name="delivery_public_id" value={deliveryPublicId}/>
        <label>Your decision<select name="state" defaultValue="approved"><option value="approved">Approve this exact version</option><option value="changes_requested">Request changes</option></select></label>
        <label>Note<textarea name="note" maxLength={1000} placeholder="Required when requesting changes"/></label>
        <button className="studio-button studio-button--primary" type="submit">Record personal final-cut decision</button>
      </NavigationActionForm>
      <p>Only the depicted person signed into this account can record this decision. Agency or project staff cannot approve on their behalf.</p>
    </section>
  </main></WorkspaceShell>;
}
