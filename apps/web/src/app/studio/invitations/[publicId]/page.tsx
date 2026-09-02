import Link from "next/link";
import { notFound } from "next/navigation";
import { InvitationPanel } from "@/components/invitations/invitation-panel";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InvitationDetailPage({ params, searchParams }: { params: Promise<{ publicId: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { publicId } = await params;
  if (!/^inv[0-9a-f]{24}$/.test(publicId)) notFound();
  await requireAdultViewer(`/studio/invitations/${publicId}`);
  const query = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_invitation_private", { requested_invitation_public_id: publicId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) notFound();
  return <main className="studio-page studio-page--narrow"><header className="studio-header"><div><span className="eyebrow">Exact proposal</span><h1>Collaboration invitation</h1><p>Review the bound project revision before responding.</p></div><Link className="studio-button" href="/studio/invitations">All invitations</Link></header>{query.error ? <p className="studio-error" role="alert">The invitation action was denied or could not be saved safely.</p> : null}{query.notice ? <p className="studio-notice" role="status">Invitation updated.</p> : null}<InvitationPanel invitation={data as Record<string, unknown>} /></main>;
}
