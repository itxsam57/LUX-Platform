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

// RED scaffold: Slice 9 tests define the policy before implementation.
export function canPublishCampaign(_input: CampaignEligibilityInput): boolean {
  return true;
}

// RED scaffold: validation/normalization is intentionally not implemented yet.
export function normalizeCampaignTerms(input: CampaignTermsInput, _now: Date): CanonicalCampaignTerms {
  return input;
}
