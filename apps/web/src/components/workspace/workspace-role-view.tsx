import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, Status } from "@/components/ui/primitives";
import type { AppRole } from "@/lib/auth/policy";

export function WorkspaceRoleView({
  role,
  title,
  description,
  profileHref,
  children,
}: {
  role: AppRole | "staff";
  title: string;
  description: string;
  profileHref?: string;
  children?: ReactNode;
}) {
  return (
    <div className="workspace-stack">
      <header className="workspace-page-header">
        <div>
          <span className="eyebrow">Isolated workspace</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Status label={`${role} context active`} tone="success" />
      </header>

      <Card className="workspace-boundary-card">
        <div className="workspace-boundary-card__title">
          <Badge tone="accent">Slice 3 boundary</Badge>
          <h2>Authorization and profile privacy are active</h2>
        </div>
        <p>
          Session, adult-access, approved-membership, exact active-context, and profile-privacy checks are enforced independently. An approved creator workspace does not mean that a creator identity has been verified.
        </p>
        <div className="workspace-request-actions">
          <Link className="workspace-inline-link" href="/workspace">Change active workspace</Link>
          <Link className="workspace-inline-link" href="/settings/profile">Edit canonical profile</Link>
          {profileHref ? <Link className="workspace-inline-link" href={profileHref}>View canonical profile</Link> : null}
        </div>
      </Card>

      {children}
    </div>
  );
}
