import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Status, Table } from "@/components/ui/primitives";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseOrders } from "@/lib/consumer/policy";
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

export default async function OrdersPage() {
  const viewer = await requireAdultViewer("/app/orders");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_my_orders");
  const orders = error ? [] : parseOrders(data);

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <div className="workspace-stack">
        <header className="workspace-page-header">
          <div><span className="eyebrow">Purchase records</span><h1>Orders</h1><p>Each order is bound to one immutable funding commitment and its provider-confirmed payment state.</p></div>
          <Status label={error ? "Unavailable" : `${orders.length} order${orders.length === 1 ? "" : "s"}`} tone={error ? "danger" : "success"} />
        </header>
        {error ? <div className="auth-message auth-message--error" role="alert">Orders could not be loaded safely.</div> : null}
        {orders.length ? (
          <Table caption="Your orders">
            <thead><tr><th scope="col">Order</th><th scope="col">Project</th><th scope="col">State</th><th scope="col">Paid</th><th scope="col">Refunded</th><th scope="col">Updated</th><th scope="col">Details</th></tr></thead>
            <tbody>{orders.map((order) => (
              <tr key={order.publicId}>
                <td>{order.publicId}<br/><small>{order.tierTitle ?? order.fundingPublicId}</small></td>
                <td>{order.title}</td>
                <td><Status label={order.state.replaceAll("_"," ")} tone={order.state === "captured" ? "success" : order.state === "failed" ? "danger" : order.state.includes("refund") ? "warning" : "info"} /></td>
                <td>{money(order.capturedMinor,order.currency)}</td>
                <td>{money(order.refundedMinor,order.currency)}</td>
                <td>{time(order.updatedAt)}</td>
                <td><Link href={order.fundingPath}>Funding record</Link></td>
              </tr>
            ))}</tbody>
          </Table>
        ) : !error ? <div className="ui-state-card"><h2>No orders yet</h2><p>Provider-authorized funding purchases will appear here.</p></div> : null}
      </div>
    </WorkspaceShell>
  );
}
