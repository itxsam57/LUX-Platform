import Link from "next/link";
import { PublicProfile, type PublicProfileView } from "@/components/profile/public-profile";
import { getOptionalViewer } from "@/lib/auth/context";
import type { ProfileLink, ProfileVisibility } from "@/lib/profile/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.label !== "string" || typeof candidate.url !== "string") return [];
    return [{ label: candidate.label, url: candidate.url }];
  }).slice(0, 5);
}

function parseProfile(value: unknown): PublicProfileView | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.handle !== "string"
    || typeof row.display_name !== "string"
    || typeof row.bio !== "string"
    || typeof row.language_code !== "string"
    || (row.visibility !== "public" && row.visibility !== "unlisted" && row.visibility !== "private")
  ) return null;

  return {
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    bannerUrl: typeof row.banner_url === "string" ? row.banner_url : null,
    links: parseLinks(row.links),
    languageCode: row.language_code,
    visibility: row.visibility as ProfileVisibility,
    followerCount: typeof row.follower_count === "number" ? row.follower_count : 0,
    followingCount: typeof row.following_count === "number" ? row.following_count : 0,
    creatorCapable: row.creator_capable === true,
    following: row.following === true,
    blockedByMe: row.blocked_by_me === true,
    mutedByMe: row.muted_by_me === true,
  };
}

function parseVerificationLevel(value: unknown): "v2" | "v3" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.verified !== true || (row.level !== "v2" && row.level !== "v3")) return null;
  return row.level;
}

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("get_public_profile", { profile_handle: handle });
  const profile = parseProfile(data);

  if (!profile) {
    return (
      <main className="public-profile-unavailable">
        <section className="ui-card public-profile-card">
          <span className="eyebrow">Privacy boundary</span>
          <h1>Profile unavailable</h1>
          <p className="muted-copy">This profile does not exist, is private, or is unavailable because of a block. LUX does not reveal which condition applies.</p>
          <Link className="workspace-inline-link" href="/">Return home</Link>
        </section>
      </main>
    );
  }

  const { data: verificationBadge } = await supabase.rpc("get_public_verification_badge", {
    profile_handle: profile.handle,
  });
  const verificationLevel = parseVerificationLevel(verificationBadge);

  let viewer = null;
  try {
    viewer = await getOptionalViewer();
  } catch {
    viewer = null;
  }

  let isOwner = false;
  if (viewer) {
    const { data: ownProfile } = await supabase
      .from("profiles")
      .select("handle")
      .eq("user_id", viewer.user.id)
      .maybeSingle();
    isOwner = ownProfile?.handle === profile.handle;
  }

  return (
    <PublicProfile
      profile={profile}
      signedIn={Boolean(viewer)}
      isOwner={isOwner}
      verificationLevel={verificationLevel}
    />
  );
}