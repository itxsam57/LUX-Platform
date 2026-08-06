import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const viewer = await requireAdultViewer("/workspace");
  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      {children}
    </WorkspaceShell>
  );
}
