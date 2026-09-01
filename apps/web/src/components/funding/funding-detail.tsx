import { MaterialChangePanel } from "./material-change-panel";
import { SupporterBadge } from "./supporter-badge";
import type { FundingPaymentState } from "./funding-card";

export type FundingDetailRecord = {
  publicId: string;
  campaignPublicId: string;
  title: string;
  amountMinor: number;
  currency: string;
  supporterAnonymous: boolean;
  termsVersion: number;
  termsHash: string;
  expectedDeliveryWindow: string;
  paymentState: FundingPaymentState;
  authorizedMinor: number;
  capturedMinor: number;
  refundedMinor: number;
  sandbox: boolean;
  badge: { key: string; visibility: "public" | "private" | "hidden" } | null;
  materialChange: {
    requestPublicId: string;
    state: string;
    termsVersion: number;
    termsHash: string;
    previousExpectedDeliveryWindow: string;
    nextExpectedDeliveryWindow: string;
    reason: string;
  } | null;
  refundRequest: {
    requestPublicId: string;
    state: string;
    amountMinor: number;
    reason: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

const paymentStates = new Set<FundingPaymentState>(["pending", "authorized", "captured", "partially_refunded", "refunded", "failed"]);
const badgeVisibilities = new Set(["public", "private", "hidden"] as const);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function minor(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function positiveInteger(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null; }
function text(value: unknown, max = 1000): string | null { return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null; }
function date(value: unknown): string | null { return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null; }

export function parseFundingDetail(value: unknown): FundingDetailRecord | null {
  const row = object(value);
  if (!row) return null;
  const publicId = typeof row.publicId === "string" && /^fnd[0-9a-f]{24}$/.test(row.publicId) ? row.publicId : null;
  const campaignPublicId = typeof row.campaignPublicId === "string" && /^cmp[0-9a-f]{24}$/.test(row.campaignPublicId) ? row.campaignPublicId : null;
  const title = text(row.title, 180);
  const amountMinor = minor(row.amountMinor);
  const currency = typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null;
  const termsVersion = positiveInteger(row.termsVersion);
  const termsHash = typeof row.termsHash === "string" && /^[0-9a-f]{64}$/.test(row.termsHash) ? row.termsHash : null;
  const expectedDeliveryWindow = text(row.expectedDeliveryWindow, 240);
  const paymentState = typeof row.paymentState === "string" && paymentStates.has(row.paymentState as FundingPaymentState) ? row.paymentState as FundingPaymentState : null;
  const authorizedMinor = minor(row.authorizedMinor); const capturedMinor = minor(row.capturedMinor); const refundedMinor = minor(row.refundedMinor);
  const createdAt = date(row.createdAt); const updatedAt = date(row.updatedAt);
  if (!publicId || !campaignPublicId || !title || amountMinor === null || !currency || typeof row.supporterAnonymous !== "boolean" || typeof row.sandbox !== "boolean" || !termsVersion || !termsHash || !expectedDeliveryWindow || !paymentState || authorizedMinor === null || capturedMinor === null || refundedMinor === null || !createdAt || !updatedAt) return null;

  const badgeRow = object(row.badge);
  let badge: FundingDetailRecord["badge"] = null;
  if (badgeRow) {
    const key = text(badgeRow.key, 64);
    const visibility = typeof badgeRow.visibility === "string" && badgeVisibilities.has(badgeRow.visibility as "public" | "private" | "hidden") ? badgeRow.visibility as "public" | "private" | "hidden" : null;
    if (key && visibility) badge = { key, visibility };
  }

  const changeRow = object(row.materialChange);
  let materialChange: FundingDetailRecord["materialChange"] = null;
  if (changeRow) {
    const requestPublicId = typeof changeRow.requestPublicId === "string" && /^chg[0-9a-f]{24}$/.test(changeRow.requestPublicId) ? changeRow.requestPublicId : null;
    const state = text(changeRow.state, 32); const changeTermsVersion = positiveInteger(changeRow.termsVersion);
    const changeTermsHash = typeof changeRow.termsHash === "string" && /^[0-9a-f]{64}$/.test(changeRow.termsHash) ? changeRow.termsHash : null;
    const previousExpectedDeliveryWindow = text(changeRow.previousExpectedDeliveryWindow, 240);
    const nextExpectedDeliveryWindow = text(changeRow.nextExpectedDeliveryWindow, 240);
    const reason = text(changeRow.reason, 1000);
    if (requestPublicId && state && changeTermsVersion && changeTermsHash && previousExpectedDeliveryWindow && nextExpectedDeliveryWindow && reason) {
      materialChange = { requestPublicId, state, termsVersion: changeTermsVersion, termsHash: changeTermsHash, previousExpectedDeliveryWindow, nextExpectedDeliveryWindow, reason };
    }
  }

  const refundRow = object(row.refundRequest);
  let refundRequest: FundingDetailRecord["refundRequest"] = null;
  if (refundRow) {
    const requestPublicId = typeof refundRow.requestPublicId === "string" && /^chg[0-9a-f]{24}$/.test(refundRow.requestPublicId) ? refundRow.requestPublicId : null;
    const state = text(refundRow.state, 32); const amount = minor(refundRow.amountMinor); const reason = text(refundRow.reason, 1000);
    if (requestPublicId && state && amount !== null && reason) refundRequest = { requestPublicId, state, amountMinor: amount, reason };
  }

  return { publicId, campaignPublicId, title, amountMinor, currency, supporterAnonymous: row.supporterAnonymous, termsVersion, termsHash, expectedDeliveryWindow, paymentState, authorizedMinor, capturedMinor, refundedMinor, sandbox: row.sandbox, badge, materialChange, refundRequest, createdAt, updatedAt };
}

export function FundingDetail({
  funding,
  badgeAction,
  acceptAction,
  refundAction,
  acceptIdempotencyKey,
  refundIdempotencyKey,
}: {
  funding: FundingDetailRecord;
  badgeAction: (formData: FormData) => Promise<void>;
  acceptAction: (formData: FormData) => Promise<void>;
  refundAction: (formData: FormData) => Promise<void>;
  acceptIdempotencyKey: string;
  refundIdempotencyKey: string;
}) {
  return (
    <div className="studio-stack funding-detail">
      <section className="studio-card funding-detail__summary">
        <div className="funding-card__topline">
          <span className="funding-state">{funding.paymentState.replaceAll("_", " ")}</span>
          <span>{funding.amountMinor} {funding.currency}</span>
        </div>
        <p className="funding-sandbox-note">{funding.sandbox ? "Sandbox payment state — not production revenue. Processor references stay private and are never rendered here." : "Payment state is shown without exposing processor references or claiming sandbox revenue."}</p>
        <dl className="funding-amounts funding-amounts--detail">
          <div><dt>Authorized</dt><dd>{funding.authorizedMinor}</dd></div>
          <div><dt>Captured</dt><dd>{funding.capturedMinor}</dd></div>
          <div><dt>Refunded</dt><dd>{funding.refundedMinor}</dd></div>
          <div><dt>Original delivery window</dt><dd>{funding.expectedDeliveryWindow}</dd></div>
        </dl>
      </section>
      <SupporterBadge commitmentPublicId={funding.publicId} badge={funding.badge} action={badgeAction} />
      <MaterialChangePanel commitmentPublicId={funding.publicId} materialChange={funding.materialChange} refundRequest={funding.refundRequest} acceptIdempotencyKey={acceptIdempotencyKey} refundIdempotencyKey={refundIdempotencyKey} acceptAction={acceptAction} refundAction={refundAction} />
    </div>
  );
}
