import Link from "next/link";
import { DemandCard, parseDemand } from "@/components/demand/demand-card";
import { ErrorState } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DemandBoardPage() {
  const viewer = await requireAdultViewer("/app/demand");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_demands", { page_size: 20, page_cursor: null });
  const demands = Array.isArray(data) ? data.flatMap((item) => {
    const parsed = parseDemand(item);
    return parsed ? [parsed] : [];
  }) : [];

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack demand-page">
        <header className="workspace-page-header demand-page__header">
          <div>
            <span className="eyebrow">Crowd ideas, creator control</span>
            <h1>Crowd Demand Board</h1>
            <p>Request ideas, support existing demand, and keep creator participation voluntary until a creator explicitly marks interest.</p>
          </div>
          <Link className="demand-button demand-button--primary" href="/app/demand/new">Create demand</Link>
        </header>

        {error ? (
          <ErrorState title="Demand Board unavailable" description="LUX could not load demand safely. No demand state has been assumed." />
        ) : demands.length === 0 ? (
          <section className="demand-empty">
            <h2>No open demand yet</h2>
            <p>Start with a clear request. Referencing a creator is always a suggestion, never a commitment.</p>
            <Link href="/app/demand/new">Create the first demand</Link>
          </section>
        ) : (
          <section className="demand-grid" aria-label="Crowd demand">
            {demands.map((demand) => <DemandCard key={demand.publicId} demand={demand} />)}
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}
