import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";
import { WorkspaceRoleView } from "@/components/workspace/workspace-role-view";
import { requireWorkspace } from "@/lib/auth/context";
import { parseReleaseLibrary } from "@/lib/releases/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function FanWorkspacePage() {
  const viewer = await requireWorkspace("fan", "workspace-fan");
  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("user_id", viewer.user.id)
    .maybeSingle();
  const { data: libraryData, error: libraryError } = await supabase.rpc("list_fan_library");
  const library = libraryError ? [] : parseReleaseLibrary(libraryData);

  return (
    <WorkspaceRoleView
      role="fan"
      title="Fan workspace"
      description="Your funded releases are collected here. Playback is issued only while the matching payment entitlement remains active."
      profileHref={profile?.handle ? `/u/${encodeURIComponent(profile.handle)}` : undefined}
    >
      <Card className="workspace-boundary-card">
        <div className="workspace-boundary-card__title">
          <Badge tone="accent">Fan library</Badge>
          <h2>Your released titles</h2>
        </div>
        {library.length ? (
          <div className="studio-stack">
            {library.map((release) => (
              <article key={release.publicId} className="studio-card">
                <div className="studio-meta">
                  <span>@{release.creatorHandle}</span>
                  <Badge tone={release.playbackEligible ? "success" : "neutral"}>
                    {release.playbackEligible ? "Playback available" : "Entitlement inactive"}
                  </Badge>
                </div>
                <h3>{release.title}</h3>
                <p>{release.synopsis}</p>
                <div className="studio-meta">
                  <span>Approved delivery v{release.deliveryVersion}</span>
                  <span>SHA-256 {release.deliverySha256.slice(0, 12)}…</span>
                  {release.myRating ? <span>Your rating {release.myRating}/5</span> : null}
                </div>
                <Link className="workspace-inline-link" href={`/releases/${release.publicId}`}>Open release</Link>
              </article>
            ))}
          </div>
        ) : <p className="muted-copy">No funded releases are available in this account yet.</p>}
      </Card>
    </WorkspaceRoleView>
  );
}
