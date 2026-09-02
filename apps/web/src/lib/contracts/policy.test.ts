import { describe, expect, it } from "vitest";
import { canAcceptTerms, canLockContract, classifyProjectTermChange, type CanonicalProjectTerms } from "./policy";

const base: CanonicalProjectTerms = {
  role: "performer",
  boundaries: ["closed-set"],
  collaborators: ["creator_one"],
  compensation: "fixed:10000:USD",
  distributionScope: "platform-only",
  rightsScope: "streaming-only",
  schedule: "September window",
  cancellation: "Either party may leave before contract lock",
  finalCutApprovalRequired: true,
};

describe("contract materiality", () => {
  it.each(["role", "boundaries", "collaborators", "compensation", "distributionScope", "rightsScope"] as const)("treats %s changes as material", (field) => {
    const changed = { ...base, [field]: field === "boundaries" ? ["closed-set", "no-surprises"] : field === "collaborators" ? ["creator_two"] : `${String(base[field])}-changed` } as CanonicalProjectTerms;
    expect(classifyProjectTermChange(base, changed)).toBe("material");
  });

  it("treats schedule-only presentation changes as non-material", () => {
    expect(classifyProjectTermChange(base, { ...base, schedule: "October window" })).toBe("non_material");
  });

  it("detects unchanged terms", () => expect(classifyProjectTermChange(base, { ...base })).toBe("none"));
});

describe("acceptance and lock policy", () => {
  const eligible = { currentSession: true, participantRelationship: true, currentV2: true, currentV3: true, depicted: true, agencyActingForPerformer: false, riskEligible: true, stepUpConfirmed: true, hashMatches: true };
  it("allows an eligible verified participant to accept exact terms", () => expect(canAcceptTerms(eligible)).toBe(true));
  it("requires V2 for any participant", () => expect(canAcceptTerms({ ...eligible, currentV2: false })).toBe(false));
  it("requires V3 for a depicted performer", () => expect(canAcceptTerms({ ...eligible, currentV3: false })).toBe(false));
  it("never lets an agency accept for a performer", () => expect(canAcceptTerms({ ...eligible, agencyActingForPerformer: true })).toBe(false));
  it("requires current step-up and exact version hash", () => {
    expect(canAcceptTerms({ ...eligible, stepUpConfirmed: false })).toBe(false);
    expect(canAcceptTerms({ ...eligible, hashMatches: false })).toBe(false);
  });
  it("locks only when the owner has every current acceptance and consent", () => {
    expect(canLockContract({ actorIsOwner: true, projectDraft: true, termsCurrent: true, allAcceptancesCurrent: true, allDepictedConsentsCurrent: true, projectRestricted: false })).toBe(true);
    expect(canLockContract({ actorIsOwner: true, projectDraft: true, termsCurrent: true, allAcceptancesCurrent: false, allDepictedConsentsCurrent: true, projectRestricted: false })).toBe(false);
    expect(canLockContract({ actorIsOwner: true, projectDraft: true, termsCurrent: true, allAcceptancesCurrent: true, allDepictedConsentsCurrent: true, projectRestricted: true })).toBe(false);
  });
});
