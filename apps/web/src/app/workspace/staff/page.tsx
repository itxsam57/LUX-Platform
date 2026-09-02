import { WorkspaceRoleView } from "@/components/workspace/workspace-role-view";
import { LinkButton } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";

export default async function StaffWorkspacePage() {
  const viewer = await requireWorkspace("staff", "workspace-staff");
  const canReviewVerification = viewer.context.activeRole === "reviewer"
    || viewer.context.activeRole === "super_admin";

  return (
    <WorkspaceRoleView
      role="staff"
      title="Staff workspace"
      description="A restricted staff context is active. Staff permissions remain separate from fan, creator, and agency memberships."
    >
      {canReviewVerification ? (
        <div className="workspace-request-panel">
          <div>
            <span className="eyebrow">Verification review</span>
            <h2>Identity review queue</h2>
            <p>Review normalized V2/V3 state without exposing identity documents or provider evidence.</p>
          </div>
          <LinkButton href="/workspace/staff/verification">Open verification queue</LinkButton>
        </div>
      ) : null}

      {viewer.context.activeRole === "super_admin" ? (
        <div className="workspace-request-panel">
          <div>
            <span className="eyebrow">Super-admin control</span>
            <h2>Workspace role requests</h2>
            <p>Review creator and agency requests without exposing unrelated account data.</p>
          </div>
          <LinkButton href="/workspace/staff/role-requests">Open request queue</LinkButton>
        </div>
      ) : null}
    </WorkspaceRoleView>
  );
}