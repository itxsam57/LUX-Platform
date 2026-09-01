import Link from "next/link";

export type FundingPaymentState = "pending" | "authorized" | "captured" | "partially_refunded" | "refunded" | "failed";

export type FundingSummary = {
  publicId: string;
  campaignPublicId: string;
  title: string;
  paymentState: FundingPaymentState;
  requestedMinor: number;
  authorizedMinor: number;
  capturedMinor: number;
  refundedMinor: number;
  currency: string;
  supporterAnonymous: boolean;
  badge: { key: string; visibility: "public" | "private" | "hidden" } | null;
  materialChangeState: string | null;
  refundRequestState: string | null;
  createdAt: string;
  updatedAt: string;
};

const fundingId = /^fnd[0-9a-f]{24}$/;
const campaignId = /^cmp[0-9a-f]{24}$/;
const paymentStates = new Set<FundingPaymentState>(["pending", "authorized", "captured", "partially_refunded", "refunded", "failed"]);
const badgeVisibilities = new Set(["public", "private", "hidden"] as const);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeMinor(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeDate(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function parseFundingSummary(value: unknown): FundingSummary | null {
  const row = object(value);
  if (!row) return null;
  const badge = object(row.badge);
  const publicId = typeof row.publicId === "string" && fundingId.test(row.publicId) ? row.publicId : null;
  const campaignPublicId = typeof row.campaignPublicId === "string" && campaignId.test(row.campaignPublicId) ? row.campaignPublicId : null;
  const title = typeof row.title === "string" && row.title.trim().length > 0 ? row.title.trim() : null;
  const paymentState = typeof row.paymentState === "string" && paymentStates.has(row.paymentState as FundingPaymentState)
    ? row.paymentState as FundingPaymentState
    : null;
  const requestedMinor = safeMinor(row.requestedMinor);
  const authorizedMinor = safeMinor(row.authorizedMinor);
  const capturedMinor = safeMinor(row.capturedMinor);
  const refundedMinor = safeMinor(row.refundedMinor);
  const currency = typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null;
  const createdAt = safeDate(row.createdAt);
  const updatedAt = safeDate(row.updatedAt);
  if (!publicId || !campaignPublicId || !title || !paymentState || requestedMinor === null || authorizedMinor === null || capturedMinor === null || refundedMinor === null || !currency || typeof row.supporterAnonymous !== "boolean" || !createdAt || !updatedAt) return null;

  let safeBadge: FundingSummary["badge"] = null;
  if (badge) {
    const key = typeof badge.key === "string" && badge.key.length <= 64 ? badge.key : null;
    const visibility = typeof badge.visibility === "string" && badgeVisibilities.has(badge.visibility as "public" | "private" | "hidden")
      ? badge.visibility as "public" | "private" | "hidden"
      : null;
    if (key && visibility) safeBadge = { key, visibility };
  }

  return {
    publicId,
    campaignPublicId,
    title,
    paymentState,
    requestedMinor,
    authorizedMinor,
    capturedMinor,
    refundedMinor,
    currency,
    supporterAnonymous: row.supporterAnonymous,
    badge: safeBadge,
    materialChangeState: typeof row.materialChangeState === "string" ? row.materialChangeState : null,
    refundRequestState: typeof row.refundRequestState === "string" ? row.refundRequestState : null,
    createdAt,
    updatedAt,
  };
}

function stateLabel(state: FundingPaymentState) {
  return state.replaceAll("_", " ");
}

export function FundingCard({ funding }: { funding: FundingSummary }) {
  return (
    <article className="studio-card funding-card">
      <div className="funding-card__topline">
        <span className="funding-state">{stateLabel(funding.paymentState)}</span>
        <span>{funding.requestedMinor} {funding.currency}</span>
      </div>
      <h2>{funding.title}</h2>
      <p className="funding-sandbox-note">Sandbox payment state — not production revenue.</p>
      <dl className="funding-amounts">
        <div><dt>Authorized</dt><dd>{funding.authorizedMinor}</dd></div>
        <div><dt>Captured</dt><dd>{funding.capturedMinor}</dd></div>
        <div><dt>Refunded</dt><dd>{funding.refundedMinor}</dd></div>
      </dl>
      {funding.materialChangeState === "pending" ? <p className="studio-warning">Campaign terms need your review.</p> : null}
      <div className="studio-actions">
        <Link className="studio-button studio-button--primary" href={`/app/funding/${funding.publicId}`}>View funding</Link>
        <Link className="studio-button" href={`/p/${funding.campaignPublicId}`}>Campaign</Link>
      </div>
    </article>
  );
}
