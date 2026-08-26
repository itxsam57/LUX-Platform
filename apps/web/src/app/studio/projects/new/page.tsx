import Link from "next/link";
import { createProjectAction } from "@/app/studio/actions";
import { ProjectEditor } from "@/components/projects/project-editor";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireWorkspace } from "@/lib/auth/context";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ demand?: string; error?: string }> }) {
  const viewer = await requireWorkspace("creator", "studio-project-create");
  const query = await searchParams;
  const source = typeof query.demand === "string" && /^dem[A-Za-z0-9_-]{24}$/.test(query.demand) ? query.demand : undefined;
  return <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}><main className="studio-page studio-page--narrow"><header className="studio-header"><div><span className="eyebrow">Creator-controlled</span><h1>New project draft</h1><p>{source ? "Convert an interested demand into a creator-owned draft. The original fan receives no edit or control rights." : "Create a private versioned project proposal."}</p></div><Link className="studio-button" href="/studio/projects">Back to projects</Link></header>{query.error ? <p className="studio-error" role="alert">The project draft could not be created safely.</p> : null}<ProjectEditor action={createProjectAction} submitLabel="Create project draft" sourceDemandPublicId={source} /></main></WorkspaceShell>;
}
