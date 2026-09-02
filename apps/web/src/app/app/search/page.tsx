import Link from "next/link";
import { DiscoveryCard } from "@/components/discovery/discovery-card";
import { EmptyState, ErrorState } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseDiscoveryProfiles } from "@/lib/discovery/projection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string | string[] }>;

function normalizeQuery(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export default async function DiscoverySearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const viewer = await requireAdultViewer(query ? `/app/search?q=${encodeURIComponent(query)}` : "/app/search");
  const supabase = await createServerSupabaseClient();

  let data: unknown = [];
  let errorMessage: string | null = null;
  if (query.length >= 2) {
    const { data: result, error } = await supabase.rpc("search_discovery", {
      search_query: query,
      page_size: 30,
    });
    data = result;
    errorMessage = error ? "Search could not be completed safely." : null;
  }
  const profiles = parseDiscoveryProfiles(data);

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack discovery-page">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Search</span>
            <h1>Search public profiles</h1>
            <p>Search uses public stage identity only. Legal identity and private account data are not indexed here.</p>
          </div>
          <Link className="workspace-inline-link" href="/app/explore">Explore</Link>
        </header>

        <form className="discovery-search" action="/app/search" method="get" role="search">
          <label htmlFor="discovery-query">Profile name or handle</label>
          <div className="discovery-search__row">
            <input className="ui-input" id="discovery-query" name="q" defaultValue={query} minLength={2} maxLength={80} autoComplete="off" required />
            <button className="ui-button ui-button--primary ui-button--medium" type="submit"><span>Search</span></button>
          </div>
        </form>

        {errorMessage ? (
          <ErrorState title="Search unavailable" description={errorMessage} />
        ) : query.length < 2 ? (
          <EmptyState title="Start with two characters" description="Search public handles and display names without exposing private account identifiers." />
        ) : profiles.length ? (
          <section className="discovery-grid" aria-label={`Search results for ${query}`}>
            {profiles.map((profile) => <DiscoveryCard key={profile.publicKey} profile={profile} />)}
          </section>
        ) : (
          <EmptyState title="No public profiles found" description="No discoverable profile matched that search. LUX does not reveal whether a hidden result is private or blocked." />
        )}
      </div>
    </WorkspaceShell>
  );
}
