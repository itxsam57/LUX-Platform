import Link from "next/link";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InvitationsPage() {
  await requireAdultViewer("/studio/invitations");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_my_project_invitations");
  const invitations = Array.isArray(data) ? data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  return <main className="studio-page"><header className="studio-header"><div><span className="eyebrow">Private collaboration</span><h1>Collaboration invitations</h1><p>Accepting an invitation is not a contract or depicted-person consent. Those require separate versioned acceptance and personal consent.</p></div><Link className="studio-button" href="/workspace">Workspace</Link></header>{error ? <p role="alert" className="studio-error">Invitations could not be loaded safely.</p> : invitations.length === 0 ? <section className="studio-card"><h2>No invitations</h2><p>Received or project-managed collaboration invitations will appear here.</p></section> : <section className="studio-grid">{invitations.map((invitation) => { const id=String(invitation.publicId??""); return <article className="studio-card" key={id}><div className="studio-meta"><span>{String(invitation.direction??"")}</span><span>{String(invitation.state??"")}</span>{invitation.agencyManaged===true?<span>Agency managed</span>:null}</div><h2><Link href={`/studio/invitations/${id}`}>{String(invitation.projectTitle??"Project invitation")}</Link></h2><p>Role: {String(invitation.roleName??"collaborator")}</p></article>; })}</section>}</main>;
}
