import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, Status } from "@/components/ui/primitives";
import type { AppRole } from "@/lib/auth/policy";

export function WorkspaceRoleView({
  role,
  title,
  description,
  children,
}: {
  role: AppRole | "staff";
  title: string;
  description: string;
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
          <Badge tone="accent">Slice 2 boundary</Badge>
          <h2>Authorization is active</h2>
        </div>
        <p>
          This route proves session, adult access, approved membership, and exact active-context checks. Product features for this workspace are intentionally deferred to their canonical slices.
        </p>
        <Link className="workspace-inline-link" href="/workspace">Change active workspace</Link>
      </Card>

      {children}
    </div>
  );
}
