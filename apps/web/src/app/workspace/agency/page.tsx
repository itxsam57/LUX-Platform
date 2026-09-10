import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { Button, Checkbox, Input, Select, Status, Table, Textarea } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";
import { parseAgencyEarningsStatements, parseAgencyWorkspace, type AgencyScopes } from "@/lib/agency/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  advanceAgencyNegotiationAction,
  changeAgencyStaffAction,
  createAgencyOpportunityAction,
  ensureAgencyProfileAction,
  invitePerformerRepresentationAction,
  submitAgencyVerificationAction,
} from "./actions";

export const dynamic = "force-dynamic";

function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function formatMoney(amountMinor: number, currency: string) {
  const formatter = new Intl.NumberFormat("en", { style: "currency", currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** digits);
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

export default async function AgencyWorkspacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireWorkspace("agency", "workspace-agency");
  const supabase = await createServerSupabaseClient();
  const params = await searchParams;
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const actionError = Array.isArray(params.error) ? params.error[0] : params.error;
  const workspaceResult = await supabase.rpc("list_agency_workspace");
  const workspace = parseAgencyWorkspace(workspaceResult.data);

  if (!workspace) {
    return <div className="workspace-stack">
      <header className="workspace-page-header"><div><span className="eyebrow">Agency onboarding</span><h1>Agency workspace</h1><p>Create the agency profile attached to this approved agency workspace. The owner account becomes the first agency administrator.</p></div><Status label="Setup required" tone="warning" /></header>
      {actionError ? <div className="auth-message auth-message--error" role="alert">The previous agency action could not be completed safely.</div> : null}
      {workspaceResult.error ? <div className="auth-message" role="status">No active agency profile is available for this workspace yet.</div> : null}
      <section className="workspace-request-panel" aria-labelledby="agency-profile-heading"><div><span className="eyebrow">Profile</span><h2 id="agency-profile-heading">Create agency profile</h2><p>Use the legal operating jurisdiction. Verification is a separate reviewer-controlled step.</p></div><NavigationActionForm action={ensureAgencyProfileAction} className="workspace-form-grid"><Input id="agency-display-name" name="display_name" label="Agency name" minLength={2} maxLength={120} required /><Input id="agency-jurisdiction" name="jurisdiction_code" label="Jurisdiction code" description="Two-letter country code, for example PK or GB." minLength={2} maxLength={2} required /><Button type="submit">Create agency profile</Button></NavigationActionForm></section>
    </div>;
  }

  const role = workspace.agency.staffRole;
  const verified = workspace.agency.verificationStatus === "approved";
  const canManageStaff = role === "owner" || role === "manager";
  const canManageRepresentation = role === "owner" || role === "manager" || role === "agent";
  const canViewEarnings = role === "owner" || role === "manager" || role === "finance";
  const earningsResult = canViewEarnings ? await supabase.rpc("list_agency_earnings_statements") : null;
  const earnings = parseAgencyEarningsStatements(earningsResult?.data);

  return <div className="workspace-stack">
    <header className="workspace-page-header"><div><span className="eyebrow">Representation administration</span><h1>{workspace.agency.displayName}</h1><p>Agency access is limited by staff role and each performer-approved representation scope. Personal consent and final-cut approval always remain with the performer.</p></div><Status label={`Verification: ${workspace.agency.verificationStatus}`} tone={verified ? "success" : workspace.agency.verificationStatus === "pending" ? "warning" : "danger"} /></header>
    {notice ? <div className="auth-message auth-message--success" role="status">Agency action completed.</div> : null}
    {actionError ? <div className="auth-message auth-message--error" role="alert">The previous agency action could not be completed safely.</div> : null}

    {role === "owner" && !verified ? <section className="workspace-request-panel" aria-labelledby="agency-verification-heading"><div><span className="eyebrow">Agency verification</span><h2 id="agency-verification-heading">Submit verification evidence</h2><p>The evidence reference stays private. Reviewers receive only normalized provider, status, and review-reason metadata.</p></div><NavigationActionForm action={submitAgencyVerificationAction} className="workspace-form-grid"><input type="hidden" name="agency_public_id" value={workspace.agency.publicId} /><Input id="agency-provider" name="provider" label="Verification provider" minLength={2} maxLength={64} required /><Input id="agency-evidence-reference" name="evidence_reference" label="Private evidence reference" minLength={8} maxLength={220} required /><Button type="submit">Submit for review</Button></NavigationActionForm></section> : null}

    <section className="workspace-stack" aria-labelledby="agency-staff-heading"><div className="workspace-page-header"><div><span className="eyebrow">Tenant staff</span><h2 id="agency-staff-heading">Staff and roles</h2><p>Only staff memberships belonging to this agency tenant are shown.</p></div><Status label={`${workspace.staff.filter((row) => row.active).length} active`} tone="info" /></div>{workspace.staff.length ? <Table caption="Agency staff memberships"><thead><tr><th scope="col">Account</th><th scope="col">Role</th><th scope="col">State</th></tr></thead><tbody>{workspace.staff.map((member) => <tr key={`${member.handle}:${member.staffRole}`}><td>@{member.handle}</td><td>{member.staffRole}</td><td>{member.active ? "Active" : "Disabled"}</td></tr>)}</tbody></Table> : null}{canManageStaff ? <NavigationActionForm action={changeAgencyStaffAction} className="workspace-form-grid"><Input id="agency-staff-handle" name="handle" label="Account handle" required /><Select id="agency-staff-role" name="staff_role" label="Staff role" required><option value="manager">Manager</option><option value="agent">Agent</option><option value="finance">Finance</option><option value="viewer">Viewer</option></Select><Select id="agency-staff-enabled" name="enabled" label="Access state" required><option value="true">Active</option><option value="false">Disabled</option></Select><Textarea id="agency-staff-reason" name="reason" label="Reason" minLength={3} maxLength={500} required /><Button type="submit" variant="secondary">Update staff access</Button></NavigationActionForm> : null}</section>

    <section className="workspace-stack" aria-labelledby="representation-roster-heading"><div className="workspace-page-header"><div><span className="eyebrow">Performer autonomy</span><h2 id="representation-roster-heading">Representation roster</h2><p>Invitations become active only after the performer personally accepts the exact scopes, commission, and revocation notice.</p></div><Status label={`${workspace.representations.length} agreements`} tone="info" /></div>{canManageRepresentation && verified ? <NavigationActionForm action={invitePerformerRepresentationAction} className="workspace-form-grid"><Input id="representation-performer" name="performer_handle" label="Performer handle" required /><Checkbox id="scope-communications" name="scope_communications" label="Communications" /><Checkbox id="scope-opportunities" name="scope_opportunities" label="Opportunities" /><Checkbox id="scope-negotiations" name="scope_negotiations" label="Negotiations" /><Checkbox id="scope-project-admin" name="scope_project_admin" label="Project administration" description="Administrative authority only; performer consent remains personal." /><Checkbox id="scope-contract-admin" name="scope_contract_admin" label="Contract administration" description="Administrative authority only; performer consent remains personal." /><Checkbox id="scope-earnings" name="scope_earnings" label="Earnings visibility" description="Required when commission is greater than zero." /><Input id="representation-commission" name="commission_basis_points" label="Commission (basis points)" description="100 basis points = 1%." type="number" min={0} max={5000} step={1} defaultValue={0} required /><Input id="representation-revocation" name="revocation_notice_days" label="Revocation notice (days)" type="number" min={0} max={90} step={1} defaultValue={0} required /><Button type="submit">Send representation invitation</Button></NavigationActionForm> : !verified ? <div className="auth-message" role="status">Agency verification must be approved before representation invitations can be sent.</div> : null}{workspace.representations.length ? <Table caption="Performer representation agreements"><thead><tr><th scope="col">Performer</th><th scope="col">State</th><th scope="col">Scopes</th><th scope="col">Commission</th><th scope="col">Revocation</th><th scope="col">Accepted</th><th scope="col">Recent activity</th></tr></thead><tbody>{workspace.representations.map((agreement) => <tr key={agreement.publicId}><td>@{agreement.performerHandle}<br/><small>{agreement.publicId}</small></td><td>{agreement.status.replaceAll("_", " ")}</td><td>{scopeLabel(agreement.scopes)}</td><td>{(agreement.commissionBasisPoints / 100).toFixed(2)}%</td><td>{agreement.revocationNoticeDays} days{agreement.revocationEffectiveAt ? ` · effective ${formatTime(agreement.revocationEffectiveAt)}` : ""}</td><td>{formatTime(agreement.acceptedAt)}</td><td>{agreement.activity.length ? agreement.activity.slice(0, 3).map((event) => <div key={event.publicId}>{event.eventType.replaceAll("_", " ")} · {formatTime(event.createdAt)}</div>) : "—"}</td></tr>)}</tbody></Table> : <div className="ui-state-card"><h3>No representation agreements</h3><p>Performer-visible representation activity appears after an invitation is created.</p></div>}</section>

    <section className="workspace-stack" aria-labelledby="agency-opportunities-heading"><div className="workspace-page-header"><div><span className="eyebrow">Scoped commercial work</span><h2 id="agency-opportunities-heading">Opportunities and negotiations</h2><p>Only accepted representations with the matching performer-approved scope can be used.</p></div></div>{canManageRepresentation && verified ? <NavigationActionForm action={createAgencyOpportunityAction} className="workspace-form-grid"><Input id="agency-opportunity-agreement" name="agreement_public_id" label="Representation agreement ID" placeholder="agr…" required /><Input id="agency-opportunity-title" name="title" label="Opportunity title" minLength={3} maxLength={120} required /><Textarea id="agency-opportunity-summary" name="summary" label="Opportunity summary" minLength={10} maxLength={1200} required /><Button type="submit">Create opportunity</Button></NavigationActionForm> : null}{workspace.opportunities.length ? <Table caption="Agency opportunities and negotiations"><thead><tr><th scope="col">Performer</th><th scope="col">Opportunity</th><th scope="col">State</th><th scope="col">Latest negotiation</th><th scope="col">Update</th></tr></thead><tbody>{workspace.opportunities.map((opportunity) => <tr key={opportunity.publicId}><td>@{opportunity.performerHandle}</td><td><strong>{opportunity.title}</strong><br/><small>{opportunity.publicId}</small><br/>{opportunity.summary}</td><td>{opportunity.status}</td><td>{opportunity.negotiationHistory[0] ? `${opportunity.negotiationHistory[0].stage} · ${opportunity.negotiationHistory[0].note}` : "—"}</td><td>{canManageRepresentation && verified ? <NavigationActionForm action={advanceAgencyNegotiationAction} className="workspace-inline-form"><input type="hidden" name="opportunity_public_id" value={opportunity.publicId} /><Select id={`agency-negotiation-stage-${opportunity.publicId}`} name="stage" label="Stage" required><option value="proposed">Proposed</option><option value="countered">Countered</option><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="closed">Closed</option></Select><Textarea id={`agency-negotiation-note-${opportunity.publicId}`} name="note" label="Negotiation note" minLength={3} maxLength={1200} required /><Button type="submit" size="small" variant="secondary">Record update</Button></NavigationActionForm> : "Read only"}</td></tr>)}</tbody></Table> : <div className="ui-state-card"><h3>No opportunities yet</h3><p>Scoped opportunities appear after an accepted representation permits opportunity management.</p></div>}</section>

    {canViewEarnings ? <section className="workspace-stack" aria-labelledby="agency-earnings-heading"><div className="workspace-page-header"><div><span className="eyebrow">Ledger-derived commission</span><h2 id="agency-earnings-heading">Earnings statements</h2><p>Agency balances come only from explicit project revenue rules posted to the restricted agency ledger account.</p></div><Status label={earningsResult?.error ? "Unavailable" : `${earnings.length} statements`} tone={earningsResult?.error ? "danger" : "success"} /></div>{earnings.length ? <Table caption="Agency commission statements"><thead><tr><th scope="col">Project</th><th scope="col">Balance</th><th scope="col">Commission rule</th></tr></thead><tbody>{earnings.map((statement) => <tr key={`${statement.projectPublicId}:${statement.currency}`}><td>{statement.projectTitle}<br/><small>{statement.projectPublicId}</small></td><td>{formatMoney(statement.balanceMinor, statement.currency)}</td><td>{(statement.commissionBasisPoints / 100).toFixed(2)}%</td></tr>)}</tbody></Table> : !earningsResult?.error ? <div className="ui-state-card"><h3>No agency earnings yet</h3><p>Commission appears only after an explicit revenue rule posts eligible value.</p></div> : null}</section> : null}
  </div>;
}
