import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireWorkspace } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const viewer = await requireWorkspace("creator", "studio-projects");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_my_projects");
  const projects = Array.isArray(data) ? data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  return <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
    <main className="studio-page"><header className="studio-header"><div><span className="eyebrow">Creator Studio</span><h1>Projects</h1><p>Private, creator-owned drafts with immutable revisions and explicit collaboration boundaries.</p></div><div className="studio-actions"><Link className="studio-button studio-button--primary" href="/studio/projects/new">New project</Link><Link className="studio-button" href="/studio/invitations">Invitations</Link></div></header>
      {error ? <p role="alert" className="studio-error">Projects could not be loaded safely.</p> : projects.length === 0 ? <section className="studio-card"><h2>No project drafts yet</h2><p>Create one directly or convert an interested Crowd Demand request.</p></section> : <section className="studio-grid" aria-label="Project drafts">{projects.map((project) => { const id=String(project.publicId??""); return <article className="studio-card" key={id}><div className="studio-meta"><span>{String(project.state??"draft")}</span><span>Revision {String(project.revision??1)}</span></div><h2><Link href={`/studio/projects/${id}`}>{String(project.title??"Project")}</Link></h2><p>{String(project.publicSynopsis??"")}</p></article>; })}</section>}
    </main>
  </WorkspaceShell>;
}
