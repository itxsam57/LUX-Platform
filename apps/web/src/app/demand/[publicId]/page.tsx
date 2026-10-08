import Link from "next/link";
import { DemandCard, parseDemand } from "@/components/demand/demand-card";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Button } from "@/components/ui/primitives";
import { setSavedItemAction } from "@/app/app/saved/actions";
import { addDemandDiscussionAction, hideDemandDiscussionAction } from "@/app/demand/actions";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DiscussionEntry = {
  publicId: string;
  kind: "comment" | "suggestion";
  body: string;
  authorHandle: string;
  authorDisplayName: string;
  createdAt: string;
  canHide: boolean;
};

function parseDiscussion(value: unknown): DiscussionEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const item = row as Record<string, unknown>;
    if (
      typeof item.publicId !== "string" ||
      (item.kind !== "comment" && item.kind !== "suggestion") ||
      typeof item.body !== "string" ||
      typeof item.authorHandle !== "string" ||
      typeof item.authorDisplayName !== "string" ||
      typeof item.createdAt !== "string" ||
      typeof item.canHide !== "boolean"
    ) return [];
    return [item as DiscussionEntry];
  });
}

export default async function DemandDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { publicId } = await params;
  const viewer = await requireAdultViewer(`/demand/${publicId}`);
  const supabase = await createServerSupabaseClient();
  const [{ data, error }, { data: discussionData, error: discussionError }] = await Promise.all([
    supabase.rpc("get_demand_complete", { requested_public_id: publicId }),
    supabase.rpc("list_demand_discussion", { requested_demand_public_id: publicId }),
  ]);
  const demand = parseDemand(data);
  const discussion = parseDiscussion(discussionData);
  const query = await searchParams;

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack demand-page demand-page--narrow">
        <Link className="workspace-inline-link" href="/app/demand">← Crowd Demand Board</Link>
        {query.error ? <div className="demand-error" role="alert">The requested demand change could not be recorded safely.</div> : null}
        {query.notice ? <div className="auth-message auth-message--success" role="status">Demand discussion updated.</div> : null}
        {error || !demand ? (
          <section className="demand-empty">
            <h1>Demand unavailable</h1>
            <p>This demand does not exist or is unavailable because of privacy, blocking, or policy state. LUX does not reveal which condition applies.</p>
          </section>
        ) : (
          <>
            <DemandCard demand={demand} detail />
            <form action={setSavedItemAction} className="workspace-inline-form">
              <input type="hidden" name="item_type" value="demand" />
              <input type="hidden" name="item_public_id" value={demand.publicId} />
              <input type="hidden" name="saved" value="true" />
              <input type="hidden" name="return_to" value={`/demand/${demand.publicId}`} />
              <Button type="submit" variant="secondary">Save demand</Button>
            </form>

            <section className="studio-card" aria-labelledby="demand-discussion-heading">
              <span className="eyebrow">Crowd input</span>
              <h2 id="demand-discussion-heading">Discussion and suggestions</h2>
              <p>Comments and suggestions help refine demand. They never create performer consent, contract acceptance, or production authority.</p>
              <form action={addDemandDiscussionAction} className="studio-form">
                <input type="hidden" name="public_id" value={demand.publicId} />
                <label>Entry type
                  <select name="kind" defaultValue="comment">
                    <option value="comment">Comment</option>
                    <option value="suggestion">Structured suggestion</option>
                  </select>
                </label>
                <label>Message
                  <textarea name="body" minLength={3} maxLength={2000} rows={4} required />
                </label>
                <Button type="submit">Add to discussion</Button>
              </form>

              {discussionError ? <p className="demand-error">Discussion could not be loaded safely.</p> : null}
              {discussion.length ? (
                <div className="studio-stack">
                  {discussion.map((entry) => (
                    <article key={entry.publicId} className="studio-card">
                      <div className="studio-meta">
                        <strong>{entry.kind === "suggestion" ? "Suggestion" : "Comment"}</strong>
                        <span>@{entry.authorHandle}</span>
                        <span>{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                      <p>{entry.body}</p>
                      {entry.canHide ? (
                        <form action={hideDemandDiscussionAction} className="workspace-inline-form">
                          <input type="hidden" name="public_id" value={demand.publicId} />
                          <input type="hidden" name="entry_public_id" value={entry.publicId} />
                          <Button type="submit" variant="secondary" size="small">Hide from discussion</Button>
                        </form>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : <p>No discussion entries yet.</p>}
            </section>
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
