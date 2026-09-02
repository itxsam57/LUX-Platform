import Link from "next/link";
import { DemandCard, parseDemand } from "@/components/demand/demand-card";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DemandDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { publicId } = await params;
  const viewer = await requireAdultViewer(`/demand/${publicId}`);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_demand", { requested_public_id: publicId });
  const demand = parseDemand(data);
  const query = await searchParams;

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack demand-page demand-page--narrow">
        <Link className="workspace-inline-link" href="/app/demand">← Crowd Demand Board</Link>
        {query.error ? <div className="demand-error" role="alert">The support change could not be recorded safely.</div> : null}
        {error || !demand ? (
          <section className="demand-empty">
            <h1>Demand unavailable</h1>
            <p>This demand does not exist or is unavailable because of privacy, blocking, or policy state. LUX does not reveal which condition applies.</p>
          </section>
        ) : (
          <DemandCard demand={demand} detail />
        )}
      </div>
    </WorkspaceShell>
  );
}
