import { WorkspaceRoleView } from "@/components/workspace/workspace-role-view";
import { requireWorkspace } from "@/lib/auth/context";

export default async function CreatorWorkspacePage() {
  await requireWorkspace("creator", "workspace-creator");
  return (
    <WorkspaceRoleView
      role="creator"
      title="Creator workspace"
      description="The approved creator context is active. Creator profile, verification, projects, consent, production, and earnings remain separate future slices."
    />
  );
}
