import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Status, Table } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseWalletEntries } from "@/lib/consumer/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function money(amountMinor: number, currency: string) {
  const formatter = new Intl.NumberFormat("en", { style: "currency", currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** digits);
}

function time(value: string) {
  return new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

export default async function WalletPage() {
  const viewer = await requireAdultViewer("/app/wallet");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_my_wallet_entries");
  const entries = error ? [] : parseWalletEntries(data);

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack">
        <header className="workspace-page-header">
          <div><span className="eyebrow">Auditable money history</span><h1>Wallet records</h1><p>This is a transaction-history view, not an unregulated stored-value balance. Provider-confirmed authorizations, purchases, failures, and refunds are recorded here.</p></div>
          <Status label={error ? "Unavailable" : `${entries.length} record${entries.length === 1 ? "" : "s"}`} tone={error ? "danger" : "success"} />
        </header>
        {error ? <div className="auth-message auth-message--error" role="alert">Wallet records could not be loaded safely.</div> : null}
        {entries.length ? (
          <Table caption="Your wallet transaction history">
            <thead><tr><th scope="col">Project</th><th scope="col">Type</th><th scope="col">Direction</th><th scope="col">Amount</th><th scope="col">Order</th><th scope="col">Time</th></tr></thead>
            <tbody>{entries.map((entry) => (
              <tr key={entry.publicId}>
                <td>{entry.title}</td>
                <td>{entry.entryType.replaceAll("_"," ")}</td>
                <td>{entry.direction}</td>
                <td>{money(entry.amountMinor,entry.currency)}</td>
                <td>{entry.orderPublicId}</td>
                <td>{time(entry.createdAt)}</td>
              </tr>
            ))}</tbody>
          </Table>
        ) : !error ? <div className="ui-state-card"><h2>No wallet records yet</h2><p>Money events appear after a payment provider confirms an authorization, capture, failure, or refund.</p></div> : null}
      </div>
    </WorkspaceShell>
  );
}
