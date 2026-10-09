export type CampaignEligibilityInput = {
  actorIsOwner: boolean;
  projectState: "draft" | "contract_ready" | "contract_locked" | "cancelled";
  creatorVerificationCurrent: boolean;
  allDepictedParticipantsV3Current: boolean;
  allCampaignConsentsCurrent: boolean;
  projectRestricted: boolean;
  paymentEnvironmentEligible: boolean;
  campaignTermsComplete: boolean;
};

export type CampaignTierInput = {
  key: string;
  title: string;
  amountMinor: number;
  accessPromise: string;
};

export type CampaignTermsInput = {
  fundingTargetMinor: number;
  currency: string;
  deadline: string;
  expectedDeliveryWindow: string;
  guarantees: string[];
  optionalChoices: string[];
  tiers: CampaignTierInput[];
  refundRules: string;
  materialChangeRules: string;
};

export type CanonicalCampaignTerms = CampaignTermsInput;

export function canPublishCampaign(input: CampaignEligibilityInput): boolean {
  return input.actorIsOwner
    && input.projectState === "contract_locked"
    && input.creatorVerificationCurrent
    && input.allDepictedParticipantsV3Current
    && input.allCampaignConsentsCurrent
    && !input.projectRestricted
    && input.paymentEnvironmentEligible
    && input.campaignTermsComplete;
}

export function normalizeCampaignTerms(input: CampaignTermsInput, now: Date): CanonicalCampaignTerms {
  if (!Number.isSafeInteger(input.fundingTargetMinor) || input.fundingTargetMinor <= 0) {
    throw new Error("invalid_campaign_funding_target");
  }

  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error("invalid_campaign_currency");
  }

  const deadlineTime = new Date(input.deadline).getTime();
  if (!Number.isFinite(deadlineTime) || deadlineTime <= now.getTime()) {
    throw new Error("invalid_campaign_deadline");
  }

  if (
    input.guarantees.length === 0
    || input.expectedDeliveryWindow.trim() === ""
    || input.refundRules.trim() === ""
    || input.materialChangeRules.trim() === ""
  ) {
    throw new Error("incomplete_campaign_terms");
  }

  if (input.tiers.length < 1 || input.tiers.length > 12) {
    throw new Error("invalid_campaign_tiers");
  }
  const seenTierKeys = new Set<string>();
  const tiers = input.tiers.map((tier) => {
    const key = tier.key.trim().toLowerCase();
    const title = tier.title.trim();
    const accessPromise = tier.accessPromise.trim();
    if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(key)
      || title.length < 2 || title.length > 120
      || !Number.isSafeInteger(tier.amountMinor) || tier.amountMinor < 1
      || accessPromise.length < 3 || accessPromise.length > 500
      || seenTierKeys.has(key)) {
      throw new Error("invalid_campaign_tiers");
    }
    seenTierKeys.add(key);
    return { key, title, amountMinor: tier.amountMinor, accessPromise };
  });

  return {
    ...input,
    expectedDeliveryWindow: input.expectedDeliveryWindow.trim(),
    guarantees: input.guarantees.map((item) => item.trim()),
    optionalChoices: input.optionalChoices.map((item) => item.trim()),
    tiers,
    refundRules: input.refundRules.trim(),
    materialChangeRules: input.materialChangeRules.trim(),
  };
}
