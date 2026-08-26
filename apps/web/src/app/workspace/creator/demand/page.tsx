import Link from "next/link";
import { respondToDemandAction } from "@/app/demand/actions";
import { demandStateLabel, parseDemand } from "@/components/demand/demand-card";
import { ErrorState } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireWorkspace } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CreatorDemandResponse = "declined" | "interested";

function parseCreatorResponseMap(value: unknown): Map<string, CreatorDemandResponse> {
  const responses = new Map<string, CreatorDemandResponse>();
  if (!Array.isArray(value)) return responses;

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const row = candidate as Record<string, unknown>;
    if (
      typeof row.publicId === "string"
      && (row.response === "declined" || row.response === "interested")
    ) {
      responses.set(row.publicId, row.response);
    }
  }

  return responses;
}

export default async function CreatorDemandPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; demand?: string; error?: string }>;
}) {
  const viewer = await requireWorkspace("creator", "creator-demand");
  const query = await searchParams;
  const supabase = await createServerSupabaseClient();
  const [
    { data: ownProfile },
    { data, error },
    { data: creatorResponseData, error: creatorResponseError },
  ] = await Promise.all([
    supabase.from("profiles").select("handle").eq("user_id", viewer.user.id).maybeSingle(),
    supabase.rpc("list_demands", { page_size: 50, page_cursor: null }),
    supabase.rpc("get_my_demand_creator_responses"),
  ]);
  const ownHandle = typeof ownProfile?.handle === "string" ? ownProfile.handle : null;
  const creatorResponses = parseCreatorResponseMap(creatorResponseData);
  const demands = Array.isArray(data) && ownHandle
    ? data.flatMap((item) => {
      const parsed = parseDemand(item);
      return parsed?.suggestedCreator?.handle === ownHandle ? [parsed] : [];
    })
    : [];

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack demand-page">
        <header className="workspace-page-header demand-page__header">
          <div>
            <span className="eyebrow">Creator autonomy</span>
            <h1>Demand requests</h1>
            <p>Being suggested never commits you. Declines stay private; only your explicit interest changes the public demand state.</p>
          </div>
          <Link className="workspace-inline-link" href="/app/demand">Open Demand Board</Link>
        </header>

        {query.error ? <div className="demand-error" role="alert">The creator response could not be recorded safely.</div> : null}
        {error || creatorResponseError ? (
          <ErrorState title="Demand requests unavailable" description="LUX could not load creator demand requests safely." />
        ) : demands.length === 0 ? (
          <section className="demand-empty"><h2>No creator requests</h2><p>Suggestions addressed to your approved creator profile will appear here.</p></section>
        ) : (
          <section className="demand-grid" aria-label="Creator demand requests">
            {demands.map((demand) => {
              const privateResponse = creatorResponses.get(demand.publicId) ?? null;
              const interested = demand.state === "creator_interested" || privateResponse === "interested";
              const privatelyDeclined = !interested && privateResponse === "declined";
              return (
                <article className="demand-card" data-testid="creator-demand-card" key={demand.publicId}>
                  <div className="demand-card__meta"><span>Suggested/requested</span><span>{demand.format.replaceAll("_", " ")}</span></div>
                  <h2><Link href={`/demand/${demand.publicId}`}>{demand.title}</Link></h2>
                  <p>{demand.brief}</p>
                  <p className="demand-card__creator">You were suggested/requested. No commitment exists until you choose interest.</p>
                  <p data-testid="creator-demand-response" className="demand-response-status">
                    {interested ? "Interested" : privatelyDeclined ? "Declined privately" : "No response yet"}
                  </p>
                  <div className="demand-card__facts"><span>{demandStateLabel(demand.state)}</span><span>{demand.supportCount} supports</span></div>
                  <div className="demand-response-actions">
                    <form action={respondToDemandAction}>
                      <input type="hidden" name="public_id" value={demand.publicId} />
                      <input type="hidden" name="response" value="declined" />
                      <button className="demand-button" type="submit">Decline privately</button>
                    </form>
                    <form action={respondToDemandAction}>
                      <input type="hidden" name="public_id" value={demand.publicId} />
                      <input type="hidden" name="response" value="interested" />
                      <button className="demand-button demand-button--primary" type="submit">Mark interested</button>
                    </form>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}
