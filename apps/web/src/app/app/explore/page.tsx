import Link from "next/link";
import { MarketplaceDiscoveryGrid } from "@/components/discovery/marketplace-discovery-grid";
import { EmptyState, ErrorState } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { marketplaceCursor, parseMarketplaceFilter, parseMarketplaceItems } from "@/lib/discovery/marketplace";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function parseCursor(value: string | string[] | undefined) {
  const raw = one(value);
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[]; cursor?: string | string[] }>;
}) {
  const params = await searchParams;
  const filter = parseMarketplaceFilter(one(params.type));
  const pageCursor = parseCursor(params.cursor);
  const viewer = await requireAdultViewer("/app/explore");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("explore_marketplace", {
    item_filter: filter,
    page_size: PAGE_SIZE,
    page_cursor: pageCursor,
  });
  const items = parseMarketplaceItems(data);
  const nextCursor = items.length === PAGE_SIZE ? marketplaceCursor(items) : null;

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack discovery-page">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Explore marketplace</span>
            <h1>Discover creators and projects</h1>
            <p>Explore combines public profiles, active Crowd Demand, published campaigns, and approved releases while applying privacy and block boundaries at the database layer.</p>
          </div>
          <div className="discovery-header-links">
            <Link className="workspace-inline-link" href="/app/search">Search</Link>
            <Link className="workspace-inline-link" href="/app/feed">Profile feed</Link>
          </div>
        </header>

        <nav className="workspace-inline-form" aria-label="Explore filters">
          {(["all","profile","demand","campaign","release"] as const).map((type) => (
            <Link key={type} className={`ui-button ui-button--${filter === type ? "primary" : "secondary"} ui-button--small`} href={`/app/explore?type=${type}`}>
              {type === "all" ? "All" : type === "demand" ? "Crowd Demand" : `${type[0]?.toUpperCase()}${type.slice(1)}s`}
            </Link>
          ))}
        </nav>

        {error ? (
          <ErrorState title="Explore unavailable" description="LUX could not load the marketplace discovery projection safely." />
        ) : items.length ? (
          <>
            <MarketplaceDiscoveryGrid items={items} returnTo={`/app/explore?type=${filter}${pageCursor ? `&cursor=${encodeURIComponent(pageCursor)}` : ""}`} />
            {nextCursor ? <Link className="ui-button ui-button--secondary ui-button--medium" href={`/app/explore?type=${filter}&cursor=${encodeURIComponent(nextCursor)}`}>Next page</Link> : null}
          </>
        ) : (
          <EmptyState title="No public marketplace items yet" description="Discoverable profiles, active demands, campaigns, and releases will appear here." />
        )}
      </div>
    </WorkspaceShell>
  );
}
