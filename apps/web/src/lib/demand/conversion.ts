export type DemandConversionState =
  | "open"
  | "creator_interested"
  | "converted"
  | "expired"
  | "closed";

export type DemandConversionEligibility = {
  effectiveState: DemandConversionState;
  actorIsSuggestedCreator: boolean;
  actorHasApprovedCreatorRole: boolean;
  actorOwnsInterestedResponse: boolean;
  relationshipBlocked: boolean;
};

export function canConvertDemandToProject(
  eligibility: DemandConversionEligibility,
): boolean {
  return (
    eligibility.effectiveState === "creator_interested"
    && eligibility.actorIsSuggestedCreator
    && eligibility.actorHasApprovedCreatorRole
    && eligibility.actorOwnsInterestedResponse
    && !eligibility.relationshipBlocked
  );
}
