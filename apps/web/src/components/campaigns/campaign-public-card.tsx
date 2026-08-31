type CampaignPublicCardProps = {
  campaign: Record<string, unknown>;
};

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function supporterLabel(count: number) {
  return `${count} ${count === 1 ? "supporter" : "supporters"}`;
}

export function CampaignPublicCard({ campaign }: CampaignPublicCardProps) {
  const supporterCount = number(campaign.supporterCount);
  const fundedAmount = number(campaign.fundedAmountMinor);
  const target = number(campaign.fundingTargetMinor);
  const currency = String(campaign.currency ?? "");

  return (
    <article className="campaign-public-card">
      <header className="campaign-hero">
        <span className="eyebrow">Published campaign</span>
        <h1>{String(campaign.title ?? "Campaign")}</h1>
        <p className="campaign-creator">By {String(campaign.creatorStageName ?? campaign.creatorHandle ?? "Creator")}</p>
        <p>{String(campaign.publicSynopsis ?? "")}</p>
      </header>

      <section className="campaign-funding-summary" aria-label="Funding summary">
        <div><strong>{fundedAmount.toLocaleString("en-US")}</strong><span> of {target.toLocaleString("en-US")} {currency} pre-booked</span></div>
        <div><strong>{supporterLabel(supporterCount)}</strong></div>
        <div><span>Deadline</span><strong>{String(campaign.deadline ?? "")}</strong></div>
        <div><span>Expected delivery</span><strong>{String(campaign.expectedDeliveryWindow ?? "")}</strong></div>
      </section>

      <section className="campaign-public-section">
        <h2>Guaranteed outcomes</h2>
        <ul>{strings(campaign.guarantees).map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section className="campaign-public-section">
        <h2>Optional supporter choices</h2>
        {strings(campaign.optionalChoices).length ? (
          <ul>{strings(campaign.optionalChoices).map((item) => <li key={item}>{item}</li>)}</ul>
        ) : <p>No optional supporter choices are offered for this version.</p>}
      </section>

      <section className="campaign-public-section campaign-rules">
        <div><h2>Refund rules</h2><p>{String(campaign.refundRules ?? "")}</p></div>
        <div><h2>Material change rules</h2><p>{String(campaign.materialChangeRules ?? "")}</p></div>
      </section>

      <footer className="campaign-version">
        <span>Campaign terms version {String(campaign.campaignTermsVersion ?? "")}</span>
        <code>{String(campaign.campaignTermsHash ?? "")}</code>
      </footer>
    </article>
  );
}
