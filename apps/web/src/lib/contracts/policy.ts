export type CanonicalProjectTerms = {
  role: string;
  boundaries: string[];
  collaborators: string[];
  compensation: string;
  distributionScope: string;
  rightsScope: string;
  schedule: string;
  cancellation: string;
  finalCutApprovalRequired: boolean;
};

const materialFields: ReadonlyArray<keyof CanonicalProjectTerms> = [
  "role", "boundaries", "collaborators", "compensation", "distributionScope", "rightsScope",
];

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function classifyProjectTermChange(previous: CanonicalProjectTerms, next: CanonicalProjectTerms): "none" | "non_material" | "material" {
  if (same(previous, next)) return "none";
  if (materialFields.some((field) => !same(previous[field], next[field]))) return "material";
  return "non_material";
}

export function canAcceptTerms(input: {
  currentSession: boolean;
  participantRelationship: boolean;
  currentV2: boolean;
  currentV3: boolean;
  depicted: boolean;
  agencyActingForPerformer: boolean;
  riskEligible: boolean;
  stepUpConfirmed: boolean;
  hashMatches: boolean;
}): boolean {
  return input.currentSession
    && input.participantRelationship
    && input.currentV2
    && (!input.depicted || input.currentV3)
    && !input.agencyActingForPerformer
    && input.riskEligible
    && input.stepUpConfirmed
    && input.hashMatches;
}

export function canLockContract(input: {
  actorIsOwner: boolean;
  projectDraft: boolean;
  termsCurrent: boolean;
  allAcceptancesCurrent: boolean;
  allDepictedConsentsCurrent: boolean;
  projectRestricted: boolean;
}): boolean {
  return input.actorIsOwner
    && input.projectDraft
    && input.termsCurrent
    && input.allAcceptancesCurrent
    && input.allDepictedConsentsCurrent
    && !input.projectRestricted;
}
