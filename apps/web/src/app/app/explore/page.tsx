import Link from "next/link";
import { DiscoveryCard } from "@/components/discovery/discovery-card";
import { EmptyState, ErrorState } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseDiscoveryProfiles, rankDiscoveryProfiles } from "@/lib/discovery/projection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const viewer = await requireAdultViewer("/app/explore");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_discovery_feed", {
    feed_mode: "for_you",
    page_size: 40,
    page_cursor: null,
  });
  const profiles = rankDiscoveryProfiles(parseDiscoveryProfiles(data), Date.now());

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack discovery-page">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Explore</span>
            <h1>Discover public creators</h1>
            <p>Only discoverable public profiles are shown. Private and blocked profiles are removed at the database boundary.</p>
          </div>
          <div className="discovery-header-links">
            <Link className="workspace-inline-link" href="/app/search">Search</Link>
            <Link className="workspace-inline-link" href="/app/feed">Feed</Link>
          </div>
        </header>

        {error ? (
          <ErrorState title="Explore unavailable" description="LUX could not load the public discovery projection safely." />
        ) : profiles.length ? (
          <section className="discovery-grid" aria-label="Explore public profiles">
            {profiles.map((profile) => <DiscoveryCard key={profile.publicKey} profile={profile} />)}
          </section>
        ) : (
          <EmptyState title="No public profiles yet" description="Public profiles will appear here as creators choose to publish them." />
        )}
      </div>
    </WorkspaceShell>
  );
}
