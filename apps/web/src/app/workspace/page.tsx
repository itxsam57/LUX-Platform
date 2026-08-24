import Link from "next/link";
import {
  activateWorkspaceAction,
  requestWorkspaceRoleAction,
} from "./actions";
import { Badge, Button, Status } from "@/components/ui/primitives";
import { WorkspaceMutationForm } from "@/components/workspace/workspace-mutation-form";
import { requireAdultViewer } from "@/lib/auth/context";
import { routeForRole, type AppRole } from "@/lib/auth/policy";

const ROLE_COPY: Record<AppRole, { label: string; description: string }> = {
  fan: { label: "Fan", description: "Support, vote, fund, purchase, and manage a private library in later slices." },
  creator: { label: "Creator", description: "Creator participation remains voluntary and requires separate approval." },
  agency: { label: "Agency", description: "Agency access never replaces the personal consent of a performer." },
  reviewer: { label: "Reviewer", description: "Restricted staff review context." },
  moderator: { label: "Moderator", description: "Restricted trust and safety context." },
  finance: { label: "Finance", description: "Restricted ledger and payout context." },
  copyright: { label: "Copyright", description: "Restricted rights operations context." },
  support: { label: "Support", description: "Restricted account-support context." },
  super_admin: { label: "Super admin", description: "Restricted platform governance context." },
};

export default async function WorkspaceIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireAdultViewer("/workspace");
  const params = await searchParams;
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const existingRoles = new Set(viewer.context.memberships.map((membership) => membership.role));

  return (
    <div className="workspace-stack">
      <header className="workspace-page-header">
        <div>
          <span className="eyebrow">Active security context</span>
          <h1>Choose a workspace</h1>
          <p>Approved memberships stay separate. Activating one context does not merge permissions from another.</p>
        </div>
        <Badge tone="success">Email verified</Badge>
      </header>

      {notice ? <div className="auth-message auth-message--success" role="status">Workspace request updated: {notice.replaceAll("-", " ")}.</div> : null}
      {error ? <div className="auth-message auth-message--error" role="alert">The workspace action was denied or could not be completed.</div> : null}

      <div className="workspace-card-grid">
        {viewer.context.memberships.map((membership) => {
          const copy = ROLE_COPY[membership.role];
          const active = viewer.context.activeRole === membership.role;
          const titleId = `workspace-${membership.id}-title`;
          return (
            <section
              className="ui-card workspace-role-card"
              aria-labelledby={titleId}
              key={membership.id}
            >
              <div className="workspace-role-card__heading">
                <div>
                  <span className="eyebrow">{copy.label}</span>
                  <h2 id={titleId}>{copy.label} workspace</h2>
                </div>
                <Status
                  label={active ? "Active" : membership.status}
                  tone={active ? "success" : membership.status === "approved" ? "info" : membership.status === "requested" ? "warning" : "danger"}
                />
              </div>
              <p>{copy.description}</p>
              {membership.status === "approved" ? (
                active ? (
                  <Button variant="secondary" disabled title="This workspace is already active">Already active</Button>
                ) : (
                  <WorkspaceMutationForm
                    action={activateWorkspaceAction}
                    fields={[{ name: "membership_id", value: membership.id }]}
                    label={`Activate ${copy.label}`}
                  />
                )
              ) : (
                <Button variant="secondary" disabled title="Approval is required before this workspace can be activated">
                  {membership.status === "requested" ? "Awaiting approval" : "Not available"}
                </Button>
              )}
              {active ? (
                <Link className="workspace-inline-link" href={routeForRole(membership.role)}>
                  Open current workspace
                </Link>
              ) : null}
            </section>
          );
        })}
      </div>

      <section className="workspace-request-panel" aria-labelledby="request-title">
        <div>
          <span className="eyebrow">Optional roles</span>
          <h2 id="request-title">Request another workspace</h2>
          <p>Requests create no permission until a super-admin approves the exact membership.</p>
        </div>
        <div className="workspace-request-actions">
          {!existingRoles.has("creator") ? (
            <WorkspaceMutationForm
              action={requestWorkspaceRoleAction}
              fields={[{ name: "role", value: "creator" }]}
              label="Request creator access"
              variant="secondary"
            />
          ) : null}
          {!existingRoles.has("agency") ? (
            <WorkspaceMutationForm
              action={requestWorkspaceRoleAction}
              fields={[{ name: "role", value: "agency" }]}
              label="Request agency access"
              variant="secondary"
            />
          ) : null}
          {existingRoles.has("creator") && existingRoles.has("agency") ? (
            <span className="muted-copy">All self-requestable roles already have a membership record.</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
