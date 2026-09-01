type MaterialChange = {
  requestPublicId: string;
  state: string;
  termsVersion: number;
  termsHash: string;
  previousExpectedDeliveryWindow: string;
  nextExpectedDeliveryWindow: string;
  reason: string;
};

type RefundRequest = {
  requestPublicId: string;
  state: string;
  amountMinor: number;
  reason: string;
};

type MaterialChangePanelProps = {
  commitmentPublicId: string;
  materialChange: MaterialChange | null;
  refundRequest: RefundRequest | null;
  acceptIdempotencyKey: string;
  refundIdempotencyKey: string;
  acceptAction: (formData: FormData) => Promise<void>;
  refundAction: (formData: FormData) => Promise<void>;
};

export function MaterialChangePanel({
  commitmentPublicId,
  materialChange,
  refundRequest,
  acceptIdempotencyKey,
  refundIdempotencyKey,
  acceptAction,
  refundAction,
}: MaterialChangePanelProps) {
  return (
    <section className="studio-card funding-change-panel">
      {materialChange ? (
        <div className="funding-change-panel__change">
          <h2>{materialChange.state === "pending" ? "Campaign terms changed" : "Changed campaign terms"}</h2>
          <p>{materialChange.reason}</p>
          <div className="funding-terms-diff" aria-label="Changed campaign delivery window">
            <div>
              <span>Original delivery window</span>
              <strong>{materialChange.previousExpectedDeliveryWindow}</strong>
            </div>
            <div>
              <span>Revised delivery window</span>
              <strong>{materialChange.nextExpectedDeliveryWindow}</strong>
            </div>
          </div>
          {materialChange.state === "pending" ? (
            <form action={acceptAction} className="studio-form studio-form--compact">
              <input type="hidden" name="commitment_public_id" value={commitmentPublicId} />
              <input type="hidden" name="terms_version" value={materialChange.termsVersion} />
              <input type="hidden" name="terms_hash" value={materialChange.termsHash} />
              <input type="hidden" name="idempotency_key" value={acceptIdempotencyKey} />
              <p className="funding-disclosure">Acceptance applies only to this exact changed terms hash. LUX does not silently move your original commitment to a new version.</p>
              <button className="studio-button studio-button--primary" type="submit">Accept changed terms</button>
            </form>
          ) : <p className="studio-notice">Changed terms accepted for this commitment.</p>}
        </div>
      ) : (
        <div>
          <h2>Campaign terms</h2>
          <p>No material campaign change currently requires your action.</p>
        </div>
      )}

      <div className="funding-refund-panel">
        <h2>Refund or cancellation request</h2>
        <p>This records an explicit supporter request. It is not a processor settlement, payout, or proof that funds have already moved.</p>
        {refundRequest ? (
          <p className="funding-refund-status">Current request: {refundRequest.amountMinor} minor units · {refundRequest.state}. Reason: {refundRequest.reason}</p>
        ) : null}
        <form action={refundAction} className="studio-form studio-form--compact" data-refund-form>
          <input type="hidden" name="commitment_public_id" value={commitmentPublicId} />
          <input type="hidden" name="idempotency_key" value={refundIdempotencyKey} />
          <label>
            Refund amount (minor units)
            <input name="amount_minor" type="number" min="1" step="1" required />
          </label>
          <label>
            Refund reason
            <textarea name="reason" minLength={3} maxLength={1000} required />
          </label>
          <p className="funding-disclosure">A refund can remove or change supporter attribution according to the campaign policy. Your badge choice is shown separately and is never treated as financial settlement state.</p>
          <button className="studio-button" type="submit">Request refund</button>
        </form>
      </div>
    </section>
  );
}
