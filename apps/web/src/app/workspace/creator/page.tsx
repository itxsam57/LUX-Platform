import { WorkspaceRoleView } from "@/components/workspace/workspace-role-view";
import { LinkButton } from "@/components/ui/primitives";
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
    >
      <div className="workspace-request-panel">
        <div>
          <span className="eyebrow">Availability</span>
          <h2>Availability and offers</h2>
          <p>Publish coarse availability or optional creator offers. These listings never create a project contract or performer consent.</p>
        </div>
        <LinkButton href="/app/offers">Manage availability</LinkButton>
      </div>
      <div className="workspace-request-panel">
        <div>
          <span className="eyebrow">Representation</span>
          <h2>Agency representation</h2>
          <p>Personally accept, decline, or revoke agency representation and review every agreed scope and activity event.</p>
        </div>
        <LinkButton href="/app/representation">Open representation</LinkButton>
      </div>
      <div className="workspace-request-panel">
        <div>
          <span className="eyebrow">Rights protection</span>
          <h2>Copyright and copied-content cases</h2>
          <p>Register released-work evidence and follow copied-content case stages without exposing purchaser identity.</p>
        </div>
        <LinkButton href="/app/copyright">Open copyright workspace</LinkButton>
      </div>
    </WorkspaceRoleView>
  );
}
