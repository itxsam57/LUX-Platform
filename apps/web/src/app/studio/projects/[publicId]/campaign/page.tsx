import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignEditor } from "@/components/campaigns/campaign-editor";
import { UrlActionFeedback } from "@/components/feedback/url-action-feedback";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireWorkspace } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publishCampaignAction, saveCampaignDraftAction, submitCampaignForPublishAction } from "./actions";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export default async function CampaignEditorPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  if (!/^prj[0-9a-f]{24}$/.test(publicId)) notFound();
  const viewer = await requireWorkspace("creator", "campaign-editor");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_campaign_editor_context", {
    requested_project_public_id: publicId,
  });
  const context = record(data);
  if (error || !context) notFound();

  const campaignPublicId = typeof context.campaignPublicId === "string" ? context.campaignPublicId : null;
  const state = typeof context.campaignState === "string" ? context.campaignState : null;
  const termsVersionValue = Number(context.termsVersion ?? 0);
  const termsVersion = Number.isInteger(termsVersionValue) && termsVersionValue > 0 ? termsVersionValue : null;
  const terms = record(context.terms);

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <main className="studio-page studio-page--narrow campaign-page">
        <header className="studio-header">
          <div>
            <span className="eyebrow">Truthful funding preparation</span>
            <h1>Campaign publishing</h1>
            <p>Campaign terms are versioned and publication is rechecked against the locked contract, current verification, restrictions, consent, and deadline.</p>
          </div>
          <Link className="studio-button" href={`/studio/projects/${publicId}`}>Project</Link>
        </header>

        <Suspense fallback={null}>
          <UrlActionFeedback
            notices={{
              saved: "Campaign draft saved.",
              review: "Campaign ready for publish review.",
              published: "Campaign published.",
            }}
            errors={{
              publish: "Campaign publication denied. Current eligibility gates must pass before publication.",
            }}
            genericError="The requested campaign action could not be completed safely."
          />
        </Suspense>

        <section className="studio-card campaign-boundary">
          <div className="studio-meta">
            <span>Project: {String(context.projectState ?? "unknown")}</span>
            <span>Campaign: {state ?? "not created"}</span>
            {termsVersion ? <span>Terms version {termsVersion}</span> : null}
          </div>
          <h2>Public funding terms</h2>
          <p>Guaranteed outcomes, optional choices, refund rules and material-change rules are shown separately so supporters are never given fabricated or hidden conditions.</p>
        </section>

        <CampaignEditor
          projectPublicId={publicId}
          campaignPublicId={campaignPublicId}
          state={state}
          termsVersion={termsVersion}
          terms={terms}
          saveAction={saveCampaignDraftAction}
          submitAction={submitCampaignForPublishAction}
          publishAction={publishCampaignAction}
        />
      </main>
    </WorkspaceShell>
  );
}
