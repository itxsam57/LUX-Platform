import { WorkspaceRoleView } from "@/components/workspace/workspace-role-view";
import { LinkButton } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";

export default async function StaffWorkspacePage() {
  const viewer = await requireWorkspace("staff", "workspace-staff");
  const canReviewVerification = viewer.context.activeRole === "reviewer"
    || viewer.context.activeRole === "super_admin";
  const canManageFinance = viewer.context.activeRole === "finance"
    || viewer.context.activeRole === "super_admin";
  const canManageCopyright = viewer.context.activeRole === "copyright"
    || viewer.context.activeRole === "super_admin";
  const canOpenOperations = ["reviewer", "moderator", "finance", "copyright", "support", "super_admin"]
    .includes(viewer.context.activeRole ?? "");

  return (
    <WorkspaceRoleView
      role="staff"
      title="Staff workspace"
      description="A restricted staff context is active. Staff permissions remain separate from fan, creator, and agency memberships."
    >
      {canOpenOperations ? (
        <div className="workspace-request-panel">
          <div>
            <span className="eyebrow">Administration and launch</span>
            <h2>Scoped operations console</h2>
            <p>Open only the queues allowed for this active staff role, including operational search, audit, incident, hold, and rate-limit controls.</p>
          </div>
          <LinkButton href="/workspace/staff/operations">Open operations console</LinkButton>
        </div>
      ) : null}

      {canReviewVerification ? (
        <>
          <div className="workspace-request-panel">
            <div>
              <span className="eyebrow">Verification review</span>
              <h2>Identity review queue</h2>
              <p>Review normalized V2/V3 state without exposing identity documents or provider evidence.</p>
            </div>
            <LinkButton href="/workspace/staff/verification">Open verification queue</LinkButton>
          </div>
          <div className="workspace-request-panel">
            <div>
              <span className="eyebrow">Delivery review</span>
              <h2>Final delivery queue</h2>
              <p>Review immutable final versions, depicted-person approvals, processing state, and release blockers.</p>
            </div>
            <LinkButton href="/workspace/staff/delivery-review">Open delivery queue</LinkButton>
          </div>
          <div className="workspace-request-panel">
            <div>
              <span className="eyebrow">Agency verification</span>
              <h2>Agency review queue</h2>
              <p>Review normalized agency status and reasons without exposing private evidence references.</p>
            </div>
            <LinkButton href="/workspace/staff/agency-verification">Open agency queue</LinkButton>
          </div>
        </>
      ) : null}

      {canManageFinance ? (
        <div className="workspace-request-panel">
          <div>
            <span className="eyebrow">Finance operations</span>
            <h2>Ledger and payout queue</h2>
            <p>Review journal-backed earnings, holds, payout batches, retries, and reconciliation differences.</p>
          </div>
          <LinkButton href="/workspace/staff/finance">Open finance queue</LinkButton>
        </div>
      ) : null}

      {canManageCopyright ? (
        <div className="workspace-request-panel">
          <div>
            <span className="eyebrow">Copyright operations</span>
            <h2>Copied-content case queue</h2>
            <p>Triage copied-release reports, generate notice records, review audited evidence, and track removal or recurrence.</p>
          </div>
          <LinkButton href="/workspace/staff/copyright">Open copyright queue</LinkButton>
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
