type CampaignTier = {
  key: string;
  title: string;
  amountMinor: number;
  accessPromise: string;
};

type PrebookFormProps = {
  campaignPublicId: string;
  idempotencyKey: string;
  tiers?: CampaignTier[];
  action: (formData: FormData) => Promise<void>;
};

export function PrebookForm({ campaignPublicId, idempotencyKey, tiers = [], action }: PrebookFormProps) {
  return (
    <form action={action} className="studio-form prebook-form" data-prebook-form>
      <input type="hidden" name="campaign_public_id" value={campaignPublicId} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {tiers.length ? (
        <label>
          Funding tier
          <select name="tier_key" defaultValue={tiers[0]?.key} required>
            {tiers.map((tier) => (
              <option value={tier.key} key={tier.key}>
                {tier.title} — {tier.amountMinor.toLocaleString("en-US")} minor units
              </option>
            ))}
          </select>
          <small>The selected tier amount and access promise are bound to this exact campaign terms version.</small>
        </label>
      ) : (
        <label>
          Pre-book amount (minor units)
          <input name="amount_minor" type="number" min="1" step="1" required />
        </label>
      )}
      <label>
        Supporter visibility
        <select name="supporter_visibility" defaultValue="default">
          <option value="default">Use my privacy default</option>
          <option value="anonymous">Anonymous</option>
          <option value="public">Public attribution</option>
        </select>
      </label>
      <label>
        Supporter badge choice
        <input name="badge_choice" maxLength={64} placeholder="Optional" />
      </label>
      {tiers.length ? (
        <div className="studio-stack" aria-label="Funding tier promises">
          {tiers.map((tier) => (
            <p className="prebook-disclosure" key={tier.key}>
              <strong>{tier.title}</strong>: {tier.accessPromise}
            </p>
          ))}
        </div>
      ) : null}
      <p className="prebook-disclosure">This action records a durable pre-book commitment for this exact campaign terms version. It is not a payment or card authorization.</p>
      <button className="studio-button studio-button--primary" type="submit">Confirm pre-book</button>
    </form>
  );
}
