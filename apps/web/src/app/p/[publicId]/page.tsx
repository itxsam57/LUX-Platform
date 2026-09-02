import Link from "next/link";
import { notFound } from "next/navigation";
import { logoutCurrentDeviceAction } from "@/app/auth/actions";
import { CampaignPublicCard } from "@/components/campaigns/campaign-public-card";
import { getOptionalViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export default async function PublicCampaignPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (!/^cmp[0-9a-f]{24}$/.test(publicId)) notFound();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_public_campaign", { requested_campaign_public_id: publicId });
  const campaign = record(data);
  if (error || !campaign) notFound();
  const viewer = await getOptionalViewer();

  return (
    <main className="campaign-public-page">
      <nav className="campaign-public-nav" aria-label="Campaign navigation">
        <Link className="app-brand campaign-brand" href="/">
          <span className="app-brand__mark" aria-hidden="true">L</span>
          <strong>LUX</strong>
        </Link>
        <div className="campaign-public-nav__actions">
          {viewer ? (
            <form action={logoutCurrentDeviceAction}>
              <button className="studio-button studio-button--quiet" type="submit">Sign out</button>
            </form>
          ) : <Link className="studio-button" href={`/auth/login?next=${encodeURIComponent(`/p/${publicId}`)}`}>Sign in</Link>}
        </div>
      </nav>
      <CampaignPublicCard campaign={campaign} />
      <Link className="studio-button studio-button--primary" href={`/app/funding/${publicId}`}>Pre-book</Link>
    </main>
  );
}
