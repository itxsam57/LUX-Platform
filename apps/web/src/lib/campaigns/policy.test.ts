import { describe, expect, it } from "vitest";
import {
  canPublishCampaign,
  normalizeCampaignTerms,
  type CampaignEligibilityInput,
  type CampaignTermsInput,
} from "./policy";

const eligible: CampaignEligibilityInput = {
  actorIsOwner: true,
  projectState: "contract_locked",
  creatorVerificationCurrent: true,
  allDepictedParticipantsV3Current: true,
  allCampaignConsentsCurrent: true,
  projectRestricted: false,
  paymentEnvironmentEligible: true,
  campaignTermsComplete: true,
};

const terms: CampaignTermsInput = {
  fundingTargetMinor: 250_000,
  currency: "USD",
  deadline: "2026-10-15T00:00:00.000Z",
  expectedDeliveryWindow: "January–March 2027",
  guarantees: ["One completed platform release"],
  optionalChoices: ["Supporters may vote on one creator-approved poster option"],
  refundRules: "If the campaign fails or is cancelled, the permitted refund path is shown before confirmation.",
  materialChangeRules: "Material campaign changes require a new version and fresh supporter action where applicable.",
};

const now = new Date("2026-08-28T00:00:00.000Z");

describe("campaign publication eligibility", () => {
  it("allows only a fully eligible locked project", () => {
    expect(canPublishCampaign(eligible)).toBe(true);
  });

  it.each([
    ["owner relationship", { actorIsOwner: false }],
    ["contract lock", { projectState: "draft" as const }],
    ["creator verification", { creatorVerificationCurrent: false }],
    ["depicted participant V3", { allDepictedParticipantsV3Current: false }],
    ["current campaign consent", { allCampaignConsentsCurrent: false }],
    ["project restriction", { projectRestricted: true }],
    ["payment-environment eligibility", { paymentEnvironmentEligible: false }],
    ["complete campaign terms", { campaignTermsComplete: false }],
  ])("fails closed when %s is not satisfied", (_label, override) => {
    expect(canPublishCampaign({ ...eligible, ...override })).toBe(false);
  });
});

describe("campaign term validation", () => {
  it("normalizes complete truthful campaign terms", () => {
    expect(normalizeCampaignTerms(terms, now)).toEqual(terms);
  });

  it("rejects a non-positive or unsafe funding target", () => {
    expect(() => normalizeCampaignTerms({ ...terms, fundingTargetMinor: 0 }, now)).toThrow("invalid_campaign_funding_target");
    expect(() => normalizeCampaignTerms({ ...terms, fundingTargetMinor: Number.MAX_SAFE_INTEGER + 1 }, now)).toThrow("invalid_campaign_funding_target");
  });

  it("rejects a deadline that is not in the future", () => {
    expect(() => normalizeCampaignTerms({ ...terms, deadline: now.toISOString() }, now)).toThrow("invalid_campaign_deadline");
  });

  it("requires a canonical three-letter currency", () => {
    expect(() => normalizeCampaignTerms({ ...terms, currency: "usd" }, now)).toThrow("invalid_campaign_currency");
  });

  it("requires explicit guarantees, delivery, refund, and material-change rules", () => {
    expect(() => normalizeCampaignTerms({ ...terms, guarantees: [] }, now)).toThrow("incomplete_campaign_terms");
    expect(() => normalizeCampaignTerms({ ...terms, expectedDeliveryWindow: "" }, now)).toThrow("incomplete_campaign_terms");
    expect(() => normalizeCampaignTerms({ ...terms, refundRules: "" }, now)).toThrow("incomplete_campaign_terms");
    expect(() => normalizeCampaignTerms({ ...terms, materialChangeRules: "" }, now)).toThrow("incomplete_campaign_terms");
  });
});
