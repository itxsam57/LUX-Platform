import Link from "next/link";
import { redirect } from "next/navigation";
import { Status, Table } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";
import { parseDeliveryReviewQueue } from "@/lib/review/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function when(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function DeliveryReviewQueuePage() {
  const viewer = await requireWorkspace("staff", "staff-delivery-review");
  const supabase = await createServerSupabaseClient();
  if (viewer.context.activeRole !== "reviewer" && viewer.context.activeRole !== "super_admin") {
    await supabase.rpc("record_access_denied", {
      denied_route_key: "staff-delivery-review",
      required_role: "reviewer",
      denial_reason: "delivery_reviewer_required",
    });
    redirect("/access-denied?route=staff-delivery-review");
  }
  const { data, error } = await supabase.rpc("list_delivery_review_queue");
  const rows = parseDeliveryReviewQueue(data);
  return <div className="workspace-stack">
    <header className="workspace-page-header"><div><span className="eyebrow">Reviewer-only release boundary</span><h1>Delivery review queue</h1><p>Review immutable final versions, depicted-person approval, processing state, and the release checklist.</p></div><Status label={`${rows.length} open reviews`} tone={error ? "danger" : rows.length ? "warning" : "success"}/></header>
    {error ? <div className="auth-message auth-message--error" role="alert">The delivery review queue could not be loaded safely.</div> : null}
    {rows.length ? <Table caption="Final deliveries awaiting platform resolution"><thead><tr><th scope="col">Project</th><th scope="col">Version</th><th scope="col">State</th><th scope="col">Blockers</th><th scope="col">Submitted</th><th scope="col">Review</th></tr></thead><tbody>{rows.map((row)=><tr key={row.deliveryPublicId}><td>{row.title}</td><td>v{row.version}</td><td>{row.status.replaceAll("_", " ")} · {row.processingState}</td><td>{row.finalCutBlockers} final-cut · {row.checklistBlockers} checklist</td><td>{when(row.submittedAt)}</td><td><Link href={`/workspace/staff/delivery-review/${row.projectPublicId}`}>Open review</Link></td></tr>)}</tbody></Table> : !error ? <div className="ui-state-card"><span className="ui-state-card__icon" aria-hidden="true">✓</span><h2>No open delivery reviews</h2><p>New final deliveries will appear after creators submit a version for platform review.</p></div> : null}
  </div>;
}
