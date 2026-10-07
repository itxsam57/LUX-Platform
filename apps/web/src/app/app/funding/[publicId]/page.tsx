import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UrlActionFeedback } from "@/components/feedback/url-action-feedback";
import { FundingDetail, parseFundingDetail } from "@/components/funding/funding-detail";
import { PrebookForm } from "@/components/funding/prebook-form";
import { SupporterProductionUpdates } from "@/components/funding/supporter-production-updates";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseSupporterProductionUpdates } from "@/lib/production/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPaymentProviderRuntime } from "@/lib/supabase/env";
import {
  acceptChangedTermsAction,
  createPrebookAction,
  requestFundingRefundAction,
  saveSupporterBadgeAction,
  startFundingCheckoutAction,
} from "./actions";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function campaignTiers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    if (!row) return [];
    const key = typeof row.key === "string" && /^[a-z0-9][a-z0-9_-]{1,47}$/.test(row.key) ? row.key : null;
    const title = typeof row.title === "string" && row.title.trim().length >= 2 ? row.title.trim() : null;
    const amountMinor = typeof row.amountMinor === "number" && Number.isSafeInteger(row.amountMinor) && row.amountMinor > 0 ? row.amountMinor : null;
    const accessPromise = typeof row.accessPromise === "string" && row.accessPromise.trim().length >= 3 ? row.accessPromise.trim() : null;
    return key && title && amountMinor && accessPromise ? [{ key, title, amountMinor, accessPromise }] : [];
  });
}

async function CampaignPrebook({ publicId }: { publicId: string }) {
  const viewer = await requireAdultViewer(`/app/funding/${publicId}`);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_public_campaign", { requested_campaign_public_id: publicId });
  const campaign = record(data);
  if (error || !campaign) notFound();
  const idempotencyKey = `prebook:${randomUUID()}`;
  const tiers = campaignTiers(campaign.tiers);

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
            genericError="The pre-book could not be confirmed safely. Review the selected tier or amount and current campaign eligibility."
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
          <PrebookForm campaignPublicId={publicId} idempotencyKey={idempotencyKey} tiers={tiers} action={createPrebookAction} />
        </section>
      </main>
    </WorkspaceShell>
  );
}

async function SupporterFundingDetail({ publicId }: { publicId: string }) {
  const viewer = await requireAdultViewer(`/app/funding/${publicId}`);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_funding_commitment", { requested_commitment_public_id: publicId });
  const funding = parseFundingDetail(data);
  if (error || !funding) notFound();
  const { data: productionUpdates } = await supabase.rpc("list_supporter_production_updates", { requested_campaign_public_id: funding.campaignPublicId });
  const updates = parseSupporterProductionUpdates(productionUpdates);
  const paymentRuntime = getPaymentProviderRuntime();

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <main className="studio-page studio-page--narrow funding-detail-page">
        <header className="studio-header">
          <div>
            <span className="eyebrow">Your private supporter record</span>
            <h1>{funding.title}</h1>
            <p>Review this exact commitment without exposing processor references, private production briefs, or internal account identifiers.</p>
          </div>
          <div className="studio-actions">
            <Link className="studio-button" href="/app/funding">Funding dashboard</Link>
            <Link className="studio-button" href={`/p/${funding.campaignPublicId}`}>Campaign</Link>
            <Link className="studio-button" href={`/app/support?type=funding_commitment&subject=${funding.publicId}`}>Dispute / support</Link>
          </div>
        </header>

        <Suspense fallback={null}>
          <UrlActionFeedback
            notices={{
              badge: "Badge updated",
              changed: "Changed terms accepted",
              refund: "Refund requested",
            }}
            errors={{
              badge: "The badge could not be updated safely.",
              changed: "The changed campaign terms could not be accepted safely.",
              refund: "The refund request could not be recorded safely.",
            }}
            genericError="The funding action could not be completed safely."
          />
        </Suspense>

        <FundingDetail
          funding={funding}
          badgeAction={saveSupporterBadgeAction}
          acceptAction={acceptChangedTermsAction}
          refundAction={requestFundingRefundAction}
          acceptIdempotencyKey={`accept-change:${randomUUID()}`}
          refundIdempotencyKey={`refund:${randomUUID()}`}
        />
        {funding.paymentState === "pending" ? (
          <section className="studio-card">
            <h2>Complete payment</h2>
            {paymentRuntime.mode === "provider" ? (
              <form action={startFundingCheckoutAction} className="studio-form">
                <input type="hidden" name="commitment_public_id" value={funding.publicId} />
                <input type="hidden" name="idempotency_key" value={`checkout:${randomUUID()}`} />
                <p className="muted-copy">Payment opens on the approved provider-hosted checkout. LUX never receives raw card numbers or security codes.</p>
                <button className="studio-button studio-button--primary" type="submit">Continue to secure checkout</button>
              </form>
            ) : (
              <p className="muted-copy">Production checkout is unavailable until an approved payment provider is connected.</p>
            )}
          </section>
        ) : null}
        <SupporterProductionUpdates updates={updates} />
      </main>
    </WorkspaceShell>
  );
}

export default async function FundingRoutePage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (/^cmp[0-9a-f]{24}$/.test(publicId)) return <CampaignPrebook publicId={publicId} />;
  if (/^fnd[0-9a-f]{24}$/.test(publicId)) return <SupporterFundingDetail publicId={publicId} />;
  notFound();
}
