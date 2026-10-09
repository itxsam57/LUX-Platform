import Link from "next/link";
import { MarketplaceDiscoveryGrid } from "@/components/discovery/marketplace-discovery-grid";
import { EmptyState, ErrorState } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { marketplaceCursor, parseMarketplaceFilter, parseMarketplaceItems } from "@/lib/discovery/marketplace";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string | string[]; type?: string | string[]; cursor?: string | string[] }>;
const PAGE_SIZE = 30;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeQuery(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim().slice(0,80) : "";
}

function cursor(value: string | string[] | undefined) {
  const raw = one(value);
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

export default async function DiscoverySearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const filter = parseMarketplaceFilter(one(params.type));
  const pageCursor = cursor(params.cursor);
  const viewer = await requireAdultViewer(query ? `/app/search?q=${encodeURIComponent(query)}` : "/app/search");
  const supabase = await createServerSupabaseClient();

  let data: unknown = [];
  let errorMessage: string | null = null;
  if (query.length >= 2) {
    const { data: result, error } = await supabase.rpc("search_marketplace", {
      search_query: query,
      item_filter: filter,
      page_size: PAGE_SIZE,
      page_cursor: pageCursor,
    });
    data = result;
    errorMessage = error ? "Search could not be completed safely." : null;
  }
  const items = parseMarketplaceItems(data);
  const nextCursor = items.length === PAGE_SIZE ? marketplaceCursor(items) : null;

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack discovery-page">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Marketplace search</span>
            <h1>Search creators, demands, campaigns, and releases</h1>
            <p>Search indexes only public-safe marketplace projections. Private profiles, blocked relationships, legal identity, and private project data are excluded before ranking.</p>
          </div>
          <Link className="workspace-inline-link" href="/app/explore">Explore</Link>
        </header>

        <form className="discovery-search" action="/app/search" method="get" role="search">
          <label htmlFor="discovery-query">Search marketplace</label>
          <div className="discovery-search__row">
            <input className="ui-input" id="discovery-query" name="q" defaultValue={query} minLength={2} maxLength={80} autoComplete="off" required />
            <select className="ui-input ui-select" name="type" defaultValue={filter} aria-label="Result type">
              <option value="all">All</option>
              <option value="profile">Profiles</option>
              <option value="demand">Crowd Demand</option>
              <option value="campaign">Campaigns</option>
              <option value="release">Releases</option>
            </select>
            <button className="ui-button ui-button--primary ui-button--medium" type="submit"><span>Search</span></button>
          </div>
        </form>

        {errorMessage ? (
          <ErrorState title="Search unavailable" description={errorMessage} />
        ) : query.length < 2 ? (
          <EmptyState title="Start with two characters" description="Search public marketplace content without exposing private account or project data." />
        ) : items.length ? (
          <>
            <MarketplaceDiscoveryGrid items={items} returnTo={`/app/search?q=${encodeURIComponent(query)}&type=${filter}${pageCursor ? `&cursor=${encodeURIComponent(pageCursor)}` : ""}`} />
            {nextCursor ? (
              <Link className="ui-button ui-button--secondary ui-button--medium" href={`/app/search?q=${encodeURIComponent(query)}&type=${filter}&cursor=${encodeURIComponent(nextCursor)}`}>Next page</Link>
            ) : null}
          </>
        ) : (
          <EmptyState title="No public results found" description="No discoverable item matched. LUX does not reveal whether hidden results are private or blocked." />
        )}
      </div>
    </WorkspaceShell>
  );
}
