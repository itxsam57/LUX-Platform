import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UrlActionFeedback } from "@/components/feedback/url-action-feedback";
import { PrebookForm } from "@/components/funding/prebook-form";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createPrebookAction } from "./actions";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export default async function CampaignPrebookPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  if (!/^cmp[0-9a-f]{24}$/.test(publicId)) notFound();
  const viewer = await requireAdultViewer(`/app/funding/${publicId}`);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_public_campaign", { requested_campaign_public_id: publicId });
  const campaign = record(data);
  if (error || !campaign) notFound();
  const idempotencyKey = `prebook:${randomUUID()}`;

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <main className="studio-page studio-page--narrow prebook-page">
        <header className="studio-header">
          <div>
            <span className="eyebrow">Exact-version supporter commitment</span>
            <h1>Confirm your pre-book</h1>
            <p>{String(campaign.title ?? "Campaign")}</p>
          </div>
          <Link className="studio-button" href={`/p/${publicId}`}>Campaign</Link>
        </header>

        <Suspense fallback={null}>
          <UrlActionFeedback
            notices={{ confirmed: "Pre-book confirmed. This is not a payment or card authorization." }}
            genericError="The pre-book could not be confirmed safely. Review the amount and current campaign eligibility."
          />
        </Suspense>

        <section className="studio-card prebook-summary">
          <h2>What you are confirming</h2>
          <p>This commitment is bound to campaign terms version {String(campaign.campaignTermsVersion ?? "")} and cannot silently move to a different version.</p>
          <div className="studio-meta">
            <span>Target {String(campaign.fundingTargetMinor ?? "")} {String(campaign.currency ?? "")}</span>
            <span>{String(campaign.supporterCount ?? 0)} supporters</span>
          </div>
        </section>

        <section className="studio-card">
          <PrebookForm campaignPublicId={publicId} idempotencyKey={idempotencyKey} action={createPrebookAction} />
        </section>
      </main>
    </WorkspaceShell>
  );
}
