import Link from "next/link";
import { FundingCard, parseFundingSummary, type FundingSummary } from "@/components/funding/funding-card";
import { ErrorState } from "@/components/ui/primitives";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FundingFilter = "active" | "successful" | "production" | "delivered" | "refunded" | "all";
type SearchParams = Promise<{ status?: string | string[] }>;

const tabs: Array<{ key: FundingFilter; label: string }> = [
  { key: "active", label: "Active" },
  { key: "successful", label: "Successful" },
  { key: "production", label: "In production" },
  { key: "delivered", label: "Delivered" },
  { key: "refunded", label: "Refunded" },
  { key: "all", label: "All" },
];

function parseFilter(value: string | string[] | undefined): FundingFilter {
  return typeof value === "string" && tabs.some((tab) => tab.key === value) ? value as FundingFilter : "active";
}

function matchesFilter(funding: FundingSummary, filter: FundingFilter) {
  if (filter === "all") return true;
  if (filter === "active") return funding.paymentState === "pending" || funding.paymentState === "authorized";
  if (filter === "successful") return funding.paymentState === "captured" || funding.paymentState === "partially_refunded";
  if (filter === "refunded") return funding.paymentState === "refunded";
  return false;
}

function emptyCopy(filter: FundingFilter) {
  if (filter === "successful") return { title: "No successful funding yet", body: "Captured sandbox commitments will appear here. This view does not claim production revenue." };
  if (filter === "refunded") return { title: "No refunded funding yet", body: "A completed refund state will appear here only after the payment boundary records it truthfully." };
  if (filter === "production") return { title: "No productions linked yet", body: "Production lifecycle tracking belongs to the later production slice. LUX does not fabricate that state here." };
  if (filter === "delivered") return { title: "No delivered funding yet", body: "Delivery appears only after the later delivery and release workflow records it." };
  if (filter === "all") return { title: "No funding commitments yet", body: "Your supporter commitments will appear here after you confirm an eligible campaign pre-book." };
  return { title: "No active funding yet", body: "Pending or authorized supporter commitments will appear here without exposing payment processor identifiers." };
}

export default async function FundingDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const viewer = await requireAdultViewer(filter === "active" ? "/app/funding" : `/app/funding?status=${filter}`);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_funding_commitments");
  const funding = Array.isArray(data) ? data.flatMap((item) => {
    const parsed = parseFundingSummary(item);
    return parsed ? [parsed] : [];
  }) : [];
  const visibleFunding = funding.filter((item) => matchesFilter(item, filter));
  const empty = emptyCopy(filter);

  return (
    <WorkspaceShell email={viewer.user.email ?? "Verified account"} context={viewer.context}>
      <main className="studio-page funding-page">
        <header className="studio-header">
          <div>
            <span className="eyebrow">Private supporter lifecycle</span>
            <h1>Funding dashboard</h1>
            <p>Review only your own commitments, exact campaign terms, badge privacy, and truthful sandbox payment state. Processor references remain private.</p>
          </div>
          <Link className="studio-button" href="/app/explore">Explore campaigns</Link>
        </header>

        <nav className="funding-tabs" aria-label="Funding status">
          {tabs.map((tab) => (
            <Link key={tab.key} className={filter === tab.key ? "funding-tab funding-tab--active" : "funding-tab"} href={tab.key === "active" ? "/app/funding" : `/app/funding?status=${tab.key}`}>{tab.label}</Link>
          ))}
        </nav>

        {error ? (
          <ErrorState title="Funding dashboard unavailable" description="LUX could not load your funding projection safely. No payment or refund state has been assumed." />
        ) : visibleFunding.length ? (
          <section className="studio-grid funding-grid" aria-label={`${tabs.find((tab) => tab.key === filter)?.label ?? "Funding"} funding`}>
            {visibleFunding.map((item) => <FundingCard key={item.publicId} funding={item} />)}
          </section>
        ) : (
          <section className="studio-card funding-empty">
            <h2>{empty.title}</h2>
            <p>{empty.body}</p>
          </section>
        )}
      </main>
    </WorkspaceShell>
  );
}
