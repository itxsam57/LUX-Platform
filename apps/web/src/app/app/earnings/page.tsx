import { randomUUID } from "node:crypto";
import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import { Button, Input, Status, Table } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseEarnings, parseMyPayouts } from "@/lib/finance/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requestPayoutAction, retryPayoutAction } from "./actions";

export const dynamic = "force-dynamic";

function formatMinor(amountMinor: number, currency: string) {
  const formatter = new Intl.NumberFormat("en", { style: "currency", currency });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** fractionDigits);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const current = new Date();
  return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default async function EarningsPage() {
  await requireAdultViewer("/app/earnings");
  const supabase = await createServerSupabaseClient();
  const [{ data: earningsData, error: earningsError }, { data: payoutData, error: payoutError }] = await Promise.all([
    supabase.rpc("get_my_earnings"),
    supabase.rpc("list_my_payouts"),
  ]);
  const earnings = parseEarnings(earningsData);
  const payouts = parseMyPayouts(payoutData);
  const loadError = Boolean(earningsError || payoutError);

  return <div className="workspace-stack">
    <header className="workspace-page-header">
      <div>
        <span className="eyebrow">Journal-backed earnings</span>
        <h1>Earnings</h1>
        <p>Available, restricted, held, pending, and paid amounts come from the same balanced ledger used for payouts.</p>
      </div>
      <Status label={loadError ? "Unavailable" : `${earnings.length} balance ${earnings.length === 1 ? "row" : "rows"}`} tone={loadError ? "danger" : "success"}/>
    </header>

    {loadError ? <div className="auth-message auth-message--error" role="alert">Earnings could not be loaded safely.</div> : null}

    {earnings.length ? <Table caption="Participant balances by project and currency">
      <thead><tr><th scope="col">Project</th><th scope="col">Restricted</th><th scope="col">Available</th><th scope="col">Held</th><th scope="col">Pending payout</th><th scope="col">Paid</th><th scope="col">Payout</th></tr></thead>
      <tbody>{earnings.map((row) => <tr key={`${row.projectPublicId}:${row.currency}`}>
        <td><strong>{row.projectTitle}</strong><br/><small>{row.currency}</small></td>
        <td>{formatMinor(row.restrictedMinor, row.currency)}</td>
        <td>{formatMinor(row.availableMinor, row.currency)}</td>
        <td>{formatMinor(row.openHoldMinor, row.currency)}</td>
        <td>{formatMinor(row.pendingPayoutMinor, row.currency)}</td>
        <td>{formatMinor(row.paidMinor, row.currency)}</td>
        <td>{row.payoutEligible && row.availableMinor > 0 ? <NavigationActionForm action={requestPayoutAction} className="workspace-inline-form" data-payout-form>
          <input type="hidden" name="project_public_id" value={row.projectPublicId}/>
          <input type="hidden" name="currency" value={row.currency}/>
          <input type="hidden" name="idempotency_key" value={`payout.request:${randomUUID()}`}/>
          <Input id={`payout-${row.projectPublicId}-${row.currency}`} name="amount_minor" label="Amount (minor units)" type="number" min={1} max={row.availableMinor} step={1} defaultValue={row.availableMinor} required/>
          <Button type="submit" size="small">Request payout</Button>
        </NavigationActionForm> : <span>{row.payoutEligible ? "No available balance" : "Not eligible yet"}</span>}</td>
      </tr>)}</tbody>
    </Table> : !loadError ? <div className="ui-state-card"><h2>No earnings yet</h2><p>Journal-backed balances will appear after eligible project value is settled and released.</p></div> : null}

    {earnings.length ? <section className="workspace-request-panel" aria-labelledby="statement-heading">
      <div><span className="eyebrow">Export</span><h2 id="statement-heading">Download statement</h2><p>Choose a project and date range. The export contains only your safe journal projection.</p></div>
      <form action="/app/earnings/statement" method="get" className="workspace-form-grid">
        <label>Project<select className="ui-input ui-select" name="project" required>{earnings.map((row) => <option key={`${row.projectPublicId}:${row.currency}`} value={row.projectPublicId}>{row.projectTitle}</option>)}</select></label>
        <Input id="statement-from" name="from" label="From" type="date" defaultValue={monthStart()} required/>
        <Input id="statement-to" name="to" label="To" type="date" defaultValue={today()} required/>
        <Button type="submit" variant="secondary">Download CSV</Button>
      </form>
    </section> : null}

    <section className="workspace-stack" aria-labelledby="payout-history-heading">
      <div className="workspace-page-header"><div><span className="eyebrow">Payout history</span><h2 id="payout-history-heading">Requests</h2></div></div>
      {payouts.length ? <Table caption="Your payout requests"><thead><tr><th scope="col">Project</th><th scope="col">Amount</th><th scope="col">State</th><th scope="col">Attempts</th><th scope="col">Created</th><th scope="col">Action</th></tr></thead><tbody>{payouts.map((payout) => <tr key={payout.publicId}>
        <td>{payout.projectTitle}</td><td>{formatMinor(payout.amountMinor, payout.currency)}</td><td>{payout.state}</td><td>{payout.attemptCount}</td><td>{formatTime(payout.createdAt)}</td><td>{payout.state === "failed" ? <NavigationActionForm action={retryPayoutAction}>
          <input type="hidden" name="payout_public_id" value={payout.publicId}/><input type="hidden" name="idempotency_key" value={`payout.retry:${randomUUID()}`}/><Button type="submit" size="small" variant="secondary">Retry</Button>
        </NavigationActionForm> : payout.state === "paid" && payout.paidAt ? `Paid ${formatTime(payout.paidAt)}` : "—"}</td>
      </tr>)}</tbody></Table> : <div className="ui-state-card"><h3>No payout requests</h3><p>Your payout requests and provider-confirmed status will appear here.</p></div>}
    </section>
  </div>;
}
