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

export type CampaignTermsInput = {
  fundingTargetMinor: number;
  currency: string;
  deadline: string;
  expectedDeliveryWindow: string;
  guarantees: string[];
  optionalChoices: string[];
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

  return {
    ...input,
    expectedDeliveryWindow: input.expectedDeliveryWindow.trim(),
    guarantees: input.guarantees.map((item) => item.trim()),
    optionalChoices: input.optionalChoices.map((item) => item.trim()),
    refundRules: input.refundRules.trim(),
    materialChangeRules: input.materialChangeRules.trim(),
  };
}
