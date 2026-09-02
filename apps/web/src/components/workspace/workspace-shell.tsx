import Link from "next/link";
import type { ReactNode } from "react";
import { logoutCurrentDeviceAction } from "@/app/auth/actions";
import { Badge, Button } from "@/components/ui/primitives";
import { routeForRole, type ViewerContext } from "@/lib/auth/policy";

export function WorkspaceShell({
  email,
  context,
  children,
}: {
  email: string;
  context: ViewerContext;
  children: ReactNode;
}) {
  const activeRoute = context.activeRole ? routeForRole(context.activeRole) : "/workspace";

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-content">Skip to workspace content</a>
      <header className="workspace-header">
        <Link className="app-brand" href="/workspace">
          <span className="app-brand__mark" aria-hidden="true">L</span>
          <span>
            <strong>LUX</strong>
            <small>Secure workspace</small>
          </span>
        </Link>
        <nav className="workspace-header__nav" aria-label="Account workspace navigation">
          <Link href="/app/feed">Feed</Link>
          <Link href="/app/explore">Explore</Link>
          <Link href="/app/demand">Demand</Link>
          <Link href="/workspace">Workspaces</Link>
          <Link href={activeRoute}>Current context</Link>
          <Link href="/settings/profile">Profile</Link>
          <Link href="/settings/verification">Verification</Link>
          <Link href="/settings/privacy">Privacy</Link>
          <Link href="/notifications">Notifications</Link>
          <Link href="/settings/security">Security</Link>
        </nav>
        <div className="workspace-header__account">
          <div>
            <Badge tone="accent">{context.activeRole ?? "No active role"}</Badge>
            <span title={email}>{email}</span>
          </div>
          <form action={logoutCurrentDeviceAction}>
            <Button type="submit" variant="quiet" size="small">Sign out</Button>
          </form>
        </div>
      </header>
      <main className="workspace-main" id="workspace-content">{children}</main>
    </div>
  );
}
