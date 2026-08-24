import { WorkspaceRoleView } from "@/components/workspace/workspace-role-view";
import { requireWorkspace } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function CreatorWorkspacePage() {
  const viewer = await requireWorkspace("creator", "workspace-creator");
  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("user_id", viewer.user.id)
    .maybeSingle();

  return (
    <WorkspaceRoleView
      role="creator"
      title="Creator workspace"
      description="The approved creator workspace is active and uses the same canonical profile as the fan context. Workspace approval is not identity verification; creator identity verification remains a separate later slice."
      profileHref={profile?.handle ? `/u/${encodeURIComponent(profile.handle)}` : undefined}
    />
  );
}
