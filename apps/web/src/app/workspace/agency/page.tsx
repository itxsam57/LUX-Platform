import { WorkspaceRoleView } from "@/components/workspace/workspace-role-view";
import { requireWorkspace } from "@/lib/auth/context";

export default async function AgencyWorkspacePage() {
  await requireWorkspace("agency", "workspace-agency");
  return (
    <WorkspaceRoleView
      role="agency"
      title="Agency workspace"
      description="The approved agency context is active. Roster and negotiation tools arrive later and will never replace a performer’s personal consent."
    />
  );
}
