import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { Button, Input, Select, Status, Table, Textarea } from "@/components/ui/primitives";
import { requireWorkspace } from "@/lib/auth/context";
import { parseFinancePayoutQueue } from "@/lib/finance/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createMonthlyPayoutBatchAction,
  placeEarningsHoldAction,
  promoteProjectEarningsAction,
  releaseEarningsHoldAction,
  retryFinancePayoutAction,
} from "./actions";

export const dynamic = "force-dynamic";

function formatMinor(amountMinor: number, currency: string) {
  const formatter = new Intl.NumberFormat("en", { style: "currency", currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** digits);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function currentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default async function FinanceOperationsPage() {
  const viewer = await requireWorkspace("staff", "staff-finance");
  const supabase = await createServerSupabaseClient();
  if (viewer.context.activeRole !== "finance" && viewer.context.activeRole !== "super_admin") {
    await supabase.rpc("record_access_denied", {
      denied_route_key: "staff-finance",
      required_role: "finance",
      denial_reason: "finance_role_required",
    });
    redirect("/access-denied?route=staff-finance");
  }
  const { data, error } = await supabase.rpc("list_finance_payout_queue");
  const queue = parseFinancePayoutQueue(data);
  const loadError = Boolean(error || !queue);
  const payoutRows = queue?.payouts ?? [];
  const holdRows = queue?.holds ?? [];
  const reconciliationRows = queue?.reconciliationCases ?? [];

  return <div className="workspace-stack">
    <header className="workspace-page-header"><div><span className="eyebrow">Finance-only operations</span><h1>Finance queue</h1><p>Operate promotions, holds, payout batches, retries, and reconciliation from journal-backed state.</p></div><Status label={loadError ? "Unavailable" : `${payoutRows.length} payout items`} tone={loadError ? "danger" : payoutRows.length || holdRows.length || reconciliationRows.length ? "warning" : "success"}/></header>
    {loadError ? <div className="auth-message auth-message--error" role="alert">Finance operations could not be loaded safely.</div> : null}

    <section className="workspace-request-panel" aria-labelledby="promotion-heading"><div><span className="eyebrow">Release earnings</span><h2 id="promotion-heading">Promote eligible earnings</h2><p>Moves verified participant restricted balances into available balances only after payout gates pass.</p></div><NavigationActionForm action={promoteProjectEarningsAction} className="workspace-form-grid">
      <Input id="promotion-project" name="project_public_id" label="Project public ID" placeholder="prj…" required/>
      <input type="hidden" name="idempotency_key" value={`earnings.promotion:${randomUUID()}`}/>
      <Button type="submit">Promote eligible earnings</Button>
    </NavigationActionForm></section>

    <section className="workspace-request-panel" aria-labelledby="hold-heading"><div><span className="eyebrow">Reserve and disputes</span><h2 id="hold-heading">Place earnings hold</h2><p>Moves an affected amount from available back to restricted balance with an audited reason.</p></div><NavigationActionForm action={placeEarningsHoldAction} className="workspace-form-grid">
      <Input id="hold-project" name="project_public_id" label="Project public ID" placeholder="prj…" required/>
      <Input id="hold-participant" name="participant_handle" label="Participant handle" placeholder="performer.handle" required/>
      <Input id="hold-amount" name="amount_minor" label="Amount (minor units)" type="number" min={1} step={1} required/>
      <Select id="hold-kind" name="kind" label="Hold kind" required><option value="reserve">Reserve</option><option value="dispute">Dispute</option><option value="chargeback">Chargeback</option><option value="campaign">Campaign</option><option value="verification">Verification</option></Select>
      <Textarea id="hold-reason" name="reason" label="Reason" minLength={3} maxLength={1000} required/>
      <input type="hidden" name="idempotency_key" value={`earnings.hold:${randomUUID()}`}/>
      <Button type="submit" variant="secondary">Place hold</Button>
    </NavigationActionForm></section>

    <section className="workspace-request-panel" aria-labelledby="batch-heading"><div><span className="eyebrow">Monthly payout run</span><h2 id="batch-heading">Create payout batch</h2><p>Moves requested payouts for one currency and month into processing without changing reserved amounts.</p></div><NavigationActionForm action={createMonthlyPayoutBatchAction} className="workspace-form-grid">
      <Input id="batch-month" name="month" label="Month start" type="date" defaultValue={currentMonthStart()} required/>
      <Input id="batch-currency" name="currency" label="Currency" defaultValue="USD" minLength={3} maxLength={3} required/>
      <input type="hidden" name="idempotency_key" value={`payout.batch:${randomUUID()}`}/>
      <Button type="submit" variant="secondary">Create batch</Button>
    </NavigationActionForm></section>

    <section className="workspace-stack" aria-labelledby="payout-queue-heading"><div className="workspace-page-header"><div><span className="eyebrow">Payouts</span><h2 id="payout-queue-heading">Open payout queue</h2></div></div>{payoutRows.length ? <Table caption="Requested, processing, and failed payouts"><thead><tr><th scope="col">Participant</th><th scope="col">Project</th><th scope="col">Amount</th><th scope="col">State</th><th scope="col">Attempts</th><th scope="col">Created</th><th scope="col">Action</th></tr></thead><tbody>{payoutRows.map((row) => <tr key={row.publicId}><td>@{row.participantHandle}</td><td>{row.projectPublicId}</td><td>{formatMinor(row.amountMinor, row.currency)}</td><td>{row.state}</td><td>{row.attemptCount}</td><td>{formatTime(row.createdAt)}</td><td>{row.state === "failed" ? <NavigationActionForm action={retryFinancePayoutAction}><input type="hidden" name="payout_public_id" value={row.publicId}/><input type="hidden" name="idempotency_key" value={`finance.retry:${randomUUID()}`}/><Button type="submit" size="small" variant="secondary">Retry</Button></NavigationActionForm> : row.batchPublicId ?? "Awaiting batch"}</td></tr>)}</tbody></Table> : !loadError ? <div className="ui-state-card"><h3>No open payouts</h3><p>Requested, processing, or failed payouts will appear here.</p></div> : null}</section>

    <section className="workspace-stack" aria-labelledby="holds-heading"><div className="workspace-page-header"><div><span className="eyebrow">Holds</span><h2 id="holds-heading">Open earnings holds</h2></div></div>{holdRows.length ? <Table caption="Open reserve, dispute, chargeback, campaign, and verification holds"><thead><tr><th scope="col">Participant</th><th scope="col">Project</th><th scope="col">Kind</th><th scope="col">Amount</th><th scope="col">Reason</th><th scope="col">Action</th></tr></thead><tbody>{holdRows.map((row) => <tr key={row.publicId}><td>@{row.participantHandle}</td><td>{row.projectPublicId}</td><td>{row.kind}</td><td>{formatMinor(row.amountMinor, row.currency)}</td><td>{row.reason}</td><td><NavigationActionForm action={releaseEarningsHoldAction}><input type="hidden" name="hold_public_id" value={row.publicId}/><input type="hidden" name="idempotency_key" value={`hold.release:${randomUUID()}`}/><Button type="submit" size="small" variant="secondary">Release</Button></NavigationActionForm></td></tr>)}</tbody></Table> : !loadError ? <div className="ui-state-card"><h3>No open holds</h3><p>Active finance holds will appear here with their audited reason.</p></div> : null}</section>

    <section className="workspace-stack" aria-labelledby="reconciliation-heading"><div className="workspace-page-header"><div><span className="eyebrow">Reconciliation</span><h2 id="reconciliation-heading">Open differences</h2></div></div>{reconciliationRows.length ? <Table caption="Provider reconciliation differences"><thead><tr><th scope="col">Case</th><th scope="col">Project</th><th scope="col">Payout</th><th scope="col">Kind</th><th scope="col">Expected</th><th scope="col">Observed</th><th scope="col">Note</th></tr></thead><tbody>{reconciliationRows.map((row) => <tr key={row.publicId}><td>{row.publicId}</td><td>{row.projectPublicId}</td><td>{row.payoutPublicId ?? "—"}</td><td>{row.kind}</td><td>{row.expectedMinor === null ? "—" : formatMinor(row.expectedMinor, row.currency)}</td><td>{row.observedMinor === null ? "—" : formatMinor(row.observedMinor, row.currency)}</td><td>{row.note ?? "—"}</td></tr>)}</tbody></Table> : !loadError ? <div className="ui-state-card"><h3>No reconciliation differences</h3><p>Provider amount or state conflicts will open an operations case here.</p></div> : null}</section>
  </div>;
}
