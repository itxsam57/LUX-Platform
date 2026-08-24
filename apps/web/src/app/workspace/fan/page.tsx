import { WorkspaceRoleView } from "@/components/workspace/workspace-role-view";
import { requireWorkspace } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function FanWorkspacePage() {
  const viewer = await requireWorkspace("fan", "workspace-fan");
  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("user_id", viewer.user.id)
    .maybeSingle();

  return (
    <WorkspaceRoleView
      role="fan"
      title="Fan workspace"
      description="The approved fan context is active. Your public profile is one canonical identity record shared across permitted workspaces; funding, library, voting, and community features arrive in their dedicated slices."
      profileHref={profile?.handle ? `/u/${encodeURIComponent(profile.handle)}` : undefined}
    />
  );
}
