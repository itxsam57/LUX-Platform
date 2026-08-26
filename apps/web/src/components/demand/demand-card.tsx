import Link from "next/link";
import { setDemandSupportAction } from "@/app/demand/actions";

export type DemandView = {
  publicId: string;
  title: string;
  brief: string;
  category: string;
  format: string;
  state: "open" | "creator_interested" | "converted" | "expired" | "closed";
  author: { handle: string; displayName: string };
  suggestedCreator: { handle: string; displayName: string; relationship: "suggested" | "interested" } | null;
  viewerCreatorResponse: "declined" | "interested" | null;
  supportCount: number;
  viewerSupported: boolean;
  publicSupporters: Array<{ handle: string; displayName: string }>;
  createdAt: string | null;
};

const STATES = new Set<DemandView["state"]>(["open", "creator_interested", "converted", "expired", "closed"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function person(value: unknown): { handle: string; displayName: string } | null {
  const row = record(value);
  if (typeof row.handle !== "string" || typeof row.displayName !== "string") return null;
  return { handle: row.handle, displayName: row.displayName };
}

export function parseDemand(value: unknown): DemandView | null {
  const row = record(value);
  const author = person(row.author);
  if (
    typeof row.publicId !== "string"
    || typeof row.title !== "string"
    || typeof row.brief !== "string"
    || typeof row.category !== "string"
    || typeof row.format !== "string"
    || typeof row.state !== "string"
    || !STATES.has(row.state as DemandView["state"])
    || !author
  ) return null;

  const suggested = person(row.suggestedCreator);
  const suggestedRecord = record(row.suggestedCreator);
  const suggestedCreator = suggested && (suggestedRecord.relationship === "suggested" || suggestedRecord.relationship === "interested")
    ? { ...suggested, relationship: suggestedRecord.relationship as "suggested" | "interested" }
    : null;

  const viewerCreatorResponse = row.viewerCreatorResponse === "declined" || row.viewerCreatorResponse === "interested"
    ? row.viewerCreatorResponse
    : null;

  const publicSupporters = Array.isArray(row.publicSupporters)
    ? row.publicSupporters.flatMap((candidate) => {
      const parsed = person(candidate);
      return parsed ? [parsed] : [];
    })
    : [];

  return {
    publicId: row.publicId,
    title: row.title,
    brief: row.brief,
    category: row.category,
    format: row.format,
    state: row.state as DemandView["state"],
    author,
    suggestedCreator,
    viewerCreatorResponse,
    supportCount: typeof row.supportCount === "number" ? row.supportCount : 0,
    viewerSupported: row.viewerSupported === true,
    publicSupporters,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
  };
}

export function demandStateLabel(state: DemandView["state"]): string {
  if (state === "creator_interested") return "Creator interested";
  if (state === "converted") return "Converted";
  if (state === "expired") return "Expired";
  if (state === "closed") return "Closed";
  return "Open";
}

export function DemandCard({ demand, detail = false }: { demand: DemandView; detail?: boolean }) {
  return (
    <article className={`demand-card${detail ? " demand-card--detail" : ""}`}>
      <div className="demand-card__meta">
        <span>{demand.category.replaceAll("_", " ")}</span>
        <span>{demand.format.replaceAll("_", " ")}</span>
      </div>
      {detail ? <h1>{demand.title}</h1> : <h2><Link href={`/demand/${demand.publicId}`}>{demand.title}</Link></h2>}
      <p>{demand.brief}</p>
      <div className="demand-card__facts">
        <span data-testid={detail ? "demand-state" : undefined}>{demandStateLabel(demand.state)}</span>
        <span>Requested by @{demand.author.handle}</span>
      </div>

      {demand.suggestedCreator ? (
        <p className="demand-card__creator" data-testid={detail ? "demand-suggested-creator" : undefined}>
          @{demand.suggestedCreator.handle} · {demand.suggestedCreator.relationship === "interested" ? "creator interested" : "suggested creator — request only, no commitment"}
        </p>
      ) : null}

      {detail ? (
        <div className="demand-card__support">
          <strong data-testid="demand-support-count">{demand.supportCount}</strong>
          <span>{demand.supportCount === 1 ? "support" : "supports"}</span>
          {demand.publicSupporters.length > 0 ? (
            <p data-testid="demand-supporters">
              Public supporters: {demand.publicSupporters.map((supporter) => `@${supporter.handle}`).join(", ")}
            </p>
          ) : null}
          <form action={setDemandSupportAction} className="demand-support-form">
            <input type="hidden" name="public_id" value={demand.publicId} />
            <input type="hidden" name="enabled" value={demand.viewerSupported ? "false" : "true"} />
            {!demand.viewerSupported ? (
              <label className="demand-check">
                <input type="checkbox" name="publicly_attributed" />
                Show my handle publicly
              </label>
            ) : null}
            <button className="demand-button" type="submit">
              {demand.viewerSupported ? "Remove support" : "Support demand"}
            </button>
          </form>
        </div>
      ) : (
        <div className="demand-card__footer">
          <span>{demand.supportCount} {demand.supportCount === 1 ? "support" : "supports"}</span>
          <Link href={`/demand/${demand.publicId}`}>Open demand</Link>
        </div>
      )}
    </article>
  );
}
