import { WorkspaceRoleView } from "@/components/workspace/workspace-role-view";
import { LinkButton } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";

export default async function PerformerWorkspacePage() {
  await requireWorkspace("performer", "workspace-performer");

  return (
    <WorkspaceRoleView
      role="performer"
      title="Performer workspace"
      description="This workspace is for depicted-performer participation. V3 verification, personal consent, project-specific boundaries, and final-cut decisions remain personal and cannot be exercised by an agency."
    >
      <div className="workspace-request-panel">
        <div><span className="eyebrow">Availability</span><h2>Availability and offers</h2><p>Publish coarse availability or voluntary offers without creating consent or a booking.</p></div>
        <LinkButton href="/app/offers">Manage availability</LinkButton>
      </div>
      <div className="workspace-request-panel">
        <div><span className="eyebrow">Negotiation</span><h2>Project invitations</h2><p>Review proposed roles and terms before any project participation becomes accepted.</p></div>
        <LinkButton href="/studio/invitations">Open invitations</LinkButton>
      </div>
      <div className="workspace-request-panel">
        <div><span className="eyebrow">Personal authority</span><h2>Representation and consent</h2><p>Review agency representation separately. Agencies may communicate within granted scopes but cannot provide your personal consent.</p></div>
        <LinkButton href="/app/representation">Open representation</LinkButton>
      </div>
    </WorkspaceRoleView>
  );
}
