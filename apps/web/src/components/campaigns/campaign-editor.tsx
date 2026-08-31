import Link from "next/link";
import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import type { NavigationActionResult } from "@/lib/actions/navigation";

type CampaignEditorProps = {
  projectPublicId: string;
  campaignPublicId: string | null;
  state: string | null;
  termsVersion: number | null;
  terms: Record<string, unknown> | null;
  saveAction: (formData: FormData) => Promise<NavigationActionResult>;
  submitAction: (formData: FormData) => Promise<NavigationActionResult>;
  publishAction: (formData: FormData) => Promise<NavigationActionResult>;
};

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function deadlineValue(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

export function CampaignEditor({
  projectPublicId,
  campaignPublicId,
  state,
  termsVersion,
  terms,
  saveAction,
  submitAction,
  publishAction,
}: CampaignEditorProps) {
  const editable = state === null || state === "draft" || state === "review_ready";
  const version = termsVersion ?? 0;

  return (
    <div className="campaign-editor-stack">
      {editable ? (
        <NavigationActionForm action={saveAction} className="studio-form campaign-editor">
          <input type="hidden" name="project_public_id" value={projectPublicId} />
          <input type="hidden" name="campaign_public_id" value={campaignPublicId ?? ""} />
          <input type="hidden" name="terms_version" value={version || ""} />
          <div className="studio-form__grid">
            <label>
              Funding target (minor units)
              <input name="funding_target_minor" type="number" min="1" step="1" required defaultValue={String(terms?.fundingTargetMinor ?? "")} />
            </label>
            <label>
              Currency
              <input name="currency" inputMode="text" maxLength={3} required defaultValue={String(terms?.currency ?? "USD")} />
            </label>
          </div>
          <label>
            Funding deadline
            <input name="deadline" type="date" required defaultValue={deadlineValue(terms?.deadline)} />
          </label>
          <label>
            Expected delivery window
            <input name="expected_delivery_window" required maxLength={240} defaultValue={String(terms?.expectedDeliveryWindow ?? "")} />
          </label>
          <label>
            Guaranteed outcomes
            <textarea name="guarantees" rows={4} required defaultValue={strings(terms?.guarantees).join("\n")} />
            <small>One guaranteed outcome per line. Only promise outcomes the campaign can actually deliver.</small>
          </label>
          <label>
            Optional supporter choices
            <textarea name="optional_choices" rows={3} defaultValue={strings(terms?.optionalChoices).join("\n")} />
            <small>One creator-approved optional choice per line. These are not guarantees.</small>
          </label>
          <label>
            Refund rules
            <textarea name="refund_rules" rows={4} required maxLength={1000} defaultValue={String(terms?.refundRules ?? "")} />
          </label>
          <label>
            Material change rules
            <textarea name="material_change_rules" rows={4} required maxLength={1000} defaultValue={String(terms?.materialChangeRules ?? "")} />
          </label>
          <button className="studio-button studio-button--primary" type="submit">Save campaign draft</button>
        </NavigationActionForm>
      ) : null}

      {campaignPublicId && state === "draft" && version > 0 ? (
        <NavigationActionForm action={submitAction} className="campaign-stage-action">
          <input type="hidden" name="project_public_id" value={projectPublicId} />
          <input type="hidden" name="campaign_public_id" value={campaignPublicId} />
          <input type="hidden" name="terms_version" value={version} />
          <button className="studio-button" type="submit">Submit for publish review</button>
        </NavigationActionForm>
      ) : null}

      {campaignPublicId && state === "review_ready" && version > 0 ? (
        <NavigationActionForm action={publishAction} className="campaign-stage-action">
          <input type="hidden" name="project_public_id" value={projectPublicId} />
          <input type="hidden" name="campaign_public_id" value={campaignPublicId} />
          <input type="hidden" name="terms_version" value={version} />
          <button className="studio-button studio-button--primary" type="submit">Publish campaign</button>
        </NavigationActionForm>
      ) : null}

      {campaignPublicId && state === "published" ? (
        <Link className="studio-button studio-button--primary" href={`/p/${campaignPublicId}`}>View public campaign</Link>
      ) : null}
    </div>
  );
}
