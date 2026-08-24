import Link from "next/link";
import { ProfileEditor, type EditableProfile } from "@/components/profile/profile-editor";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Badge, Status } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
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

export default async function ProfileSettingsPage() {
  const viewer = await requireAdultViewer("/settings/profile");
  const supabase = await createServerSupabaseClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("handle, display_name, bio, avatar_path, banner_path, links, language_code, visibility")
    .eq("user_id", viewer.user.id)
    .single();

  if (error || !profile) {
    return (
      <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
        <div className="workspace-stack">
          <header className="workspace-page-header">
            <div>
              <span className="eyebrow">Profile settings</span>
              <h1>Profile unavailable</h1>
              <p>The private owner profile record could not be loaded safely.</p>
            </div>
            <Status label="Unavailable" tone="danger" />
          </header>
          <div className="auth-message auth-message--error" role="alert">Refresh after the database connection is restored. No public profile data was exposed.</div>
        </div>
      </WorkspaceShell>
    );
  }

  const editableProfile: EditableProfile = {
    handle: profile.handle,
    displayName: profile.display_name,
    bio: profile.bio,
    links: parseLinks(profile.links),
    languageCode: profile.language_code,
    visibility: profile.visibility as ProfileVisibility,
    hasAvatar: Boolean(profile.avatar_path),
    hasBanner: Boolean(profile.banner_path),
  };

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack">
        <header className="workspace-page-header">
          <div>
            <span className="eyebrow">Profile settings</span>
            <h1>Control your public profile</h1>
            <p>Public identity stays separate from private account data. Profile publication and new media uploads require current adult assurance.</p>
          </div>
          <div className="profile-header-actions">
            <Badge tone={profile.visibility === "public" ? "success" : profile.visibility === "unlisted" ? "info" : "neutral"}>{profile.visibility}</Badge>
            <Link className="workspace-inline-link" href={`/u/${encodeURIComponent(profile.handle)}`}>View profile</Link>
          </div>
        </header>
        <ProfileEditor profile={editableProfile} />
      </div>
    </WorkspaceShell>
  );
}
