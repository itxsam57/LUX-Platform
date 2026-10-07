import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { Button, Input, Select, Status, Table, Textarea } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseTrustCases } from "@/lib/trust/policy";
import {
  createAppealAction,
  createConsumerDisputeAction,
  createSupportCaseAction,
  reportContentAction,
  withdrawConsumerDisputeAction,
} from "./actions";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

function tone(state: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (state === "resolved" || state === "overturned") return "success";
  if (state === "rejected" || state === "upheld") return "danger";
  if (state === "in_review" || state === "in_progress") return "warning";
  if (state === "open") return "info";
  return "neutral";
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireAdultViewer("/app/support");
  const supabase = await createServerSupabaseClient();
  const params = await searchParams;
  const { data, error } = await supabase.rpc("list_my_trust_cases");
  const cases = error ? null : parseTrustCases(data);
  const notice = first(params.notice);
  const actionError = first(params.error);
  const presetSubject = first(params.subject) ?? "";
  const presetType = first(params.type) === "release" ? "release" : "funding_commitment";

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="studio-page">
        <header className="studio-header">
          <div>
            <span className="eyebrow">Trust, support, and resolution</span>
            <h1>Support and case center</h1>
            <p>Open support requests, report content, dispute your own funding or release access, and appeal eligible final decisions.</p>
          </div>
          <Status label={error || !cases ? "Unavailable" : "Case center ready"} tone={error || !cases ? "danger" : "success"} />
        </header>

        {notice ? <div className="auth-message auth-message--success" role="status">Your case action was recorded.</div> : null}
        {actionError || error || !cases ? <div className="auth-message auth-message--error" role="alert">The requested case action could not be completed safely.</div> : null}

        <section className="workspace-request-panel" aria-labelledby="support-request-heading">
          <div>
            <span className="eyebrow">Account help</span>
            <h2 id="support-request-heading">Open a support request</h2>
            <p>Use this for account, privacy, navigation, verification, or product support that is not a funding dispute.</p>
          </div>
          <NavigationActionForm action={createSupportCaseAction} className="workspace-form-grid">
            <Input id="support-subject" name="subject" label="Subject" minLength={8} maxLength={160} required />
            <Textarea id="support-body" name="body" label="What happened?" minLength={20} maxLength={4000} rows={6} required />
            <Button type="submit">Create support request</Button>
          </NavigationActionForm>
        </section>

        <section className="workspace-request-panel" aria-labelledby="report-heading">
          <div>
            <span className="eyebrow">Safety and moderation</span>
            <h2 id="report-heading">Report content or an account</h2>
            <p>Reports go to the moderation queue with an immutable audit trail. Enter the visible handle or public ID from the item you are reporting.</p>
          </div>
          <NavigationActionForm action={reportContentAction} className="workspace-form-grid">
            <Select id="report-type" name="subject_type" label="Item type" required>
              <option value="profile">Profile</option>
              <option value="project">Project</option>
              <option value="campaign">Campaign</option>
              <option value="release">Release</option>
            </Select>
            <Input id="report-target" name="subject_public_id" label="Handle or public ID" minLength={3} maxLength={120} required />
            <Input id="report-summary" name="summary" label="Short summary" minLength={8} maxLength={500} required />
            <Textarea id="report-reason" name="reason" label="Reason and relevant context" minLength={8} maxLength={1000} rows={5} required />
            <Button type="submit">Submit report</Button>
          </NavigationActionForm>
        </section>

        <section className="workspace-request-panel" aria-labelledby="dispute-heading">
          <div>
            <span className="eyebrow">Consumer dispute</span>
            <h2 id="dispute-heading">Dispute funding or release access</h2>
            <p>The target must belong to your account. Funding disputes use a funding ID beginning with <code>fnd</code>; release disputes use a release ID beginning with <code>rel</code>.</p>
          </div>
          <NavigationActionForm action={createConsumerDisputeAction} className="workspace-form-grid">
            <Select id="dispute-type" name="subject_type" label="Dispute target" defaultValue={presetType} required>
              <option value="funding_commitment">Funding commitment</option>
              <option value="release">Release</option>
            </Select>
            <Input id="dispute-target" name="subject_public_id" label="Your funding or release public ID" defaultValue={presetSubject} minLength={8} maxLength={120} required />
            <Select id="dispute-category" name="category" label="Category" required>
              <option value="payment">Payment</option>
              <option value="refund">Refund</option>
              <option value="delivery">Delivery</option>
              <option value="access">Access</option>
              <option value="quality">Quality</option>
              <option value="other">Other</option>
            </Select>
            <Input id="dispute-summary" name="summary" label="Short summary" minLength={8} maxLength={240} required />
            <Textarea id="dispute-detail" name="detail" label="Full dispute details" minLength={20} maxLength={4000} rows={6} required />
            <Button type="submit">Open dispute</Button>
          </NavigationActionForm>
        </section>

        <section className="workspace-request-panel" aria-labelledby="appeal-heading">
          <div>
            <span className="eyebrow">Appeal</span>
            <h2 id="appeal-heading">Appeal an eligible final decision</h2>
            <p>A support case must be resolved, or a consumer dispute must be resolved/rejected, before it can be appealed. One appeal is allowed per source case.</p>
          </div>
          <NavigationActionForm action={createAppealAction} className="workspace-form-grid">
            <Select id="appeal-type" name="source_type" label="Case type" required>
              <option value="support_case">Support case</option>
              <option value="consumer_dispute">Consumer dispute</option>
            </Select>
            <Input id="appeal-source" name="source_public_id" label="Case public ID" minLength={8} maxLength={120} required />
            <Textarea id="appeal-reason" name="reason" label="Why should this decision be reviewed?" minLength={20} maxLength={4000} rows={6} required />
            <Button type="submit">Open appeal</Button>
          </NavigationActionForm>
        </section>

        {cases ? (
          <section className="workspace-stack" aria-labelledby="my-cases-heading">
            <header className="workspace-page-header">
              <div>
                <span className="eyebrow">Private case history</span>
                <h2 id="my-cases-heading">Your cases</h2>
                <p>Only cases attached to your signed-in account are returned here.</p>
              </div>
            </header>

            <h3>Support</h3>
            {cases.support.length ? <Table caption="Your support requests"><thead><tr><th scope="col">Case</th><th scope="col">Subject</th><th scope="col">State</th><th scope="col">Updated</th></tr></thead><tbody>{cases.support.map((item) => <tr key={item.publicId}><td>{item.publicId}</td><td>{item.subject}</td><td><Status label={item.state.replaceAll("_", " ")} tone={tone(item.state)} /></td><td>{formatTime(item.updatedAt)}</td></tr>)}</tbody></Table> : <p className="muted-copy">No support requests yet.</p>}

            <h3>Reports</h3>
            {cases.reports.length ? <Table caption="Your content reports"><thead><tr><th scope="col">Case</th><th scope="col">Target</th><th scope="col">Summary</th><th scope="col">State</th></tr></thead><tbody>{cases.reports.map((item) => <tr key={item.publicId}><td>{item.publicId}</td><td>{item.subjectType}: {item.subjectPublicId}</td><td>{item.summary}</td><td><Status label={item.state.replaceAll("_", " ")} tone={tone(item.state)} /></td></tr>)}</tbody></Table> : <p className="muted-copy">No reports yet.</p>}

            <h3>Disputes</h3>
            {cases.disputes.length ? <Table caption="Your consumer disputes"><thead><tr><th scope="col">Case</th><th scope="col">Target</th><th scope="col">Category</th><th scope="col">State</th><th scope="col">Decision</th><th scope="col">Action</th></tr></thead><tbody>{cases.disputes.map((item) => <tr key={item.publicId}><td>{item.publicId}</td><td>{item.subjectPublicId}</td><td>{item.category}</td><td><Status label={item.state.replaceAll("_", " ")} tone={tone(item.state)} /></td><td>{item.resolutionNote ?? "—"}</td><td>{item.state === "open" || item.state === "in_review" ? <NavigationActionForm action={withdrawConsumerDisputeAction} className="workspace-inline-form"><input type="hidden" name="case_public_id" value={item.publicId} /><Input id={`withdraw-${item.publicId}`} name="reason" label="Withdrawal reason" minLength={8} maxLength={1000} required /><Button type="submit" size="small" variant="secondary">Withdraw</Button></NavigationActionForm> : "—"}</td></tr>)}</tbody></Table> : <p className="muted-copy">No consumer disputes yet.</p>}

            <h3>Appeals</h3>
            {cases.appeals.length ? <Table caption="Your appeals"><thead><tr><th scope="col">Appeal</th><th scope="col">Source</th><th scope="col">State</th><th scope="col">Decision</th><th scope="col">Updated</th></tr></thead><tbody>{cases.appeals.map((item) => <tr key={item.publicId}><td>{item.publicId}</td><td>{item.sourceType}: {item.sourcePublicId}</td><td><Status label={item.state.replaceAll("_", " ")} tone={tone(item.state)} /></td><td>{item.decisionNote ?? "—"}</td><td>{formatTime(item.updatedAt)}</td></tr>)}</tbody></Table> : <p className="muted-copy">No appeals yet.</p>}
          </section>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
