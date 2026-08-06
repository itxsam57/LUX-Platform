import { WorkspaceRoleView } from "@/components/workspace/workspace-role-view";
import { requireWorkspace } from "@/lib/auth/context";

export default async function FanWorkspacePage() {
  await requireWorkspace("fan", "workspace-fan");
  return (
    <WorkspaceRoleView
      role="fan"
      title="Fan workspace"
      description="The verified fan context is active. Funding, library, voting, and community features arrive in their dedicated slices."
    />
  );
}
