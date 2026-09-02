import Link from "next/link";
import { DiscoveryCard } from "@/components/discovery/discovery-card";
import { FeedTabs } from "@/components/discovery/feed-tabs";
import { EmptyState, ErrorState } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseDiscoveryProfiles, rankDiscoveryProfiles } from "@/lib/discovery/projection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FeedSearchParams = Promise<{ mode?: string | string[] }>;

function resolveMode(value: string | string[] | undefined): "following" | "for_you" {
  return value === "following" ? "following" : "for_you";
}

export default async function FeedPage({ searchParams }: { searchParams: FeedSearchParams }) {
  const params = await searchParams;
  const mode = resolveMode(params.mode);
  const viewer = await requireAdultViewer(`/app/feed?mode=${mode}`);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_discovery_feed", {
    feed_mode: mode,
    page_size: 30,
    page_cursor: null,
  });

  const parsed = parseDiscoveryProfiles(data);
  const profiles = mode === "for_you" ? rankDiscoveryProfiles(parsed, Date.now()) : parsed;

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack discovery-page">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Discovery</span>
            <h1>Your feed</h1>
            <p>Creator-controlled public identity, filtered by your privacy boundaries before ranking.</p>
          </div>
          <Link className="workspace-inline-link" href="/app/explore">Explore creators</Link>
        </header>

        <FeedTabs mode={mode} />

        {error ? (
          <ErrorState title="Feed unavailable" description="LUX could not load a privacy-safe feed. No fallback data was shown." />
        ) : profiles.length ? (
          <section className="discovery-grid" aria-label={mode === "following" ? "Following feed" : "For You feed"}>
            {profiles.map((profile) => <DiscoveryCard key={profile.publicKey} profile={profile} />)}
          </section>
        ) : (
          <EmptyState
            title={mode === "following" ? "No followed profiles yet" : "Nothing to recommend yet"}
            description={mode === "following" ? "Follow a public creator profile and it will appear here without weakening block or privacy rules." : "Explore public profiles. Recommendations use explicit, understandable signals rather than hidden paid placement."}
            action={<Link className="workspace-inline-link" href="/app/explore">Open Explore</Link>}
          />
        )}
      </div>
    </WorkspaceShell>
  );
}
