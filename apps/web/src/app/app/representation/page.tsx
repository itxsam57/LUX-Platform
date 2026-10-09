import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { Button, Input, Status, Table } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseMyAgencyRepresentations, type AgencyScopes } from "@/lib/agency/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { respondToAgencyRepresentationAction, revokeAgencyRepresentationAction } from "./actions";

export const dynamic = "force-dynamic";

function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function scopeLabel(scopes: AgencyScopes) {
  return [
    scopes.communications ? "communications" : null,
    scopes.opportunities ? "opportunities" : null,
    scopes.negotiations ? "negotiations" : null,
    scopes.projectAdmin ? "project admin" : null,
    scopes.contractAdmin ? "contract admin" : null,
    scopes.earningsVisibility ? "earnings" : null,
  ].filter(Boolean).join(", ") || "none";
}

export default async function RepresentationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdultViewer("/app/representation");
  const supabase = await createServerSupabaseClient();
  const params = await searchParams;
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const actionError = Array.isArray(params.error) ? params.error[0] : params.error;
  const { data, error } = await supabase.rpc("list_my_agency_representations");
  const representations = parseMyAgencyRepresentations(data);

  return <div className="workspace-stack">
    <header className="workspace-page-header">
      <div><span className="eyebrow">Personal representation control</span><h1>Agency representation</h1><p>Only you can accept, decline, or revoke your representation. Agency access never grants consent or final-cut authority over you.</p></div>
      <Status label={error ? "Unavailable" : `${representations.length} agreements`} tone={error ? "danger" : "info"} />
    </header>
    {notice ? <div className="auth-message auth-message--success" role="status">Representation action completed.</div> : null}
    {actionError ? <div className="auth-message auth-message--error" role="alert">The previous representation action could not be completed safely.</div> : null}
    {error ? <div className="auth-message auth-message--error" role="alert">Representation data could not be loaded safely.</div> : null}

    {representations.map((agreement) => <article className="workspace-stack" key={agreement.publicId}>
      <div className="workspace-page-header">
        <div><span className="eyebrow">{agreement.agencyVerificationStatus === "approved" ? "Verified agency" : `Agency ${agreement.agencyVerificationStatus}`}</span><h2>{agreement.agencyName}</h2><p>{agreement.publicId} · proposed {formatTime(agreement.proposedAt)}</p></div>
        <Status label={agreement.status.replaceAll("_", " ")} tone={agreement.status === "accepted" ? "success" : agreement.status === "proposed" || agreement.status === "revocation_pending" ? "warning" : "neutral"} />
      </div>
      <Table caption={`Representation terms for ${agreement.agencyName}`}><thead><tr><th scope="col">Scopes</th><th scope="col">Commission</th><th scope="col">Revocation notice</th><th scope="col">Terms hash</th></tr></thead><tbody><tr><td>{scopeLabel(agreement.scopes)}</td><td>{(agreement.commissionBasisPoints / 100).toFixed(2)}%</td><td>{agreement.revocationNoticeDays} days</td><td><code>{agreement.termsHash}</code></td></tr></tbody></Table>

      {agreement.status === "proposed" ? <div className="component-row">
        <NavigationActionForm action={respondToAgencyRepresentationAction}><input type="hidden" name="agreement_public_id" value={agreement.publicId} /><input type="hidden" name="decision" value="accept" /><Button type="submit">Accept these exact terms</Button></NavigationActionForm>
        <NavigationActionForm action={respondToAgencyRepresentationAction}><input type="hidden" name="agreement_public_id" value={agreement.publicId} /><input type="hidden" name="decision" value="decline" /><Button type="submit" variant="danger">Decline</Button></NavigationActionForm>
      </div> : null}

      {agreement.status === "accepted" ? <NavigationActionForm action={revokeAgencyRepresentationAction} className="workspace-form-grid representation-revoke-form">
        <input type="hidden" name="agreement_public_id" value={agreement.publicId} />
        <Input id={`revoke-reason-${agreement.publicId}`} name="reason" label="Revocation reason" description={`Your agreed notice period is ${agreement.revocationNoticeDays} days.`} minLength={3} maxLength={500} required />
        <Button type="submit" variant="danger">Revoke representation</Button>
      </NavigationActionForm> : agreement.status === "revocation_pending" ? <div className="auth-message" role="status">Revocation is recorded and becomes effective {formatTime(agreement.revocationEffectiveAt)}.</div> : null}

      <section aria-labelledby={`activity-${agreement.publicId}`}><h3 id={`activity-${agreement.publicId}`}>Immutable activity</h3>{agreement.activity.length ? <Table caption={`Representation activity for ${agreement.agencyName}`}><thead><tr><th scope="col">Event</th><th scope="col">Time</th></tr></thead><tbody>{agreement.activity.map((event) => <tr key={event.publicId}><td>{event.eventType.replaceAll("_", " ")}</td><td>{formatTime(event.createdAt)}</td></tr>)}</tbody></Table> : <p>No activity has been recorded yet.</p>}</section>
    </article>)}

    {!error && !representations.length ? <div className="ui-state-card"><h2>No agency representation</h2><p>Agency invitations addressed to your account will appear here for your personal decision.</p></div> : null}
  </div>;
}
