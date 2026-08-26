import { describe, expect, it } from "vitest";

import {
  canConvertDemandToProject,
  type DemandConversionEligibility,
} from "./conversion";

const eligibleConversion: DemandConversionEligibility = {
  effectiveState: "creator_interested",
  actorIsSuggestedCreator: true,
  actorHasActiveApprovedCreatorWorkspace: true,
  actorOwnsInterestedResponse: true,
  relationshipBlocked: false,
};

describe("demand-to-project conversion policy", () => {
  it("allows only the interested eligible suggested creator", () => {
    expect(canConvertDemandToProject(eligibleConversion)).toBe(true);
  });

  it.each(["open", "converted", "expired", "closed"] as const)(
    "rejects the %s demand state",
    (effectiveState) => {
      expect(
        canConvertDemandToProject({ ...eligibleConversion, effectiveState }),
      ).toBe(false);
    },
  );

  it("does not let demand authorship or support substitute for creator ownership", () => {
    expect(
      canConvertDemandToProject({
        ...eligibleConversion,
        actorIsSuggestedCreator: false,
        actorHasActiveApprovedCreatorWorkspace: false,
        actorOwnsInterestedResponse: false,
      }),
    ).toBe(false);
  });

  it("requires the actor to be in the active approved Creator workspace", () => {
    expect(
      canConvertDemandToProject({
        ...eligibleConversion,
        actorHasActiveApprovedCreatorWorkspace: false,
      }),
    ).toBe(false);
  });

  it("requires the durable interested response to belong to the actor", () => {
    expect(
      canConvertDemandToProject({
        ...eligibleConversion,
        actorOwnsInterestedResponse: false,
      }),
    ).toBe(false);
  });

  it("fails closed when the creator-author relationship becomes blocked", () => {
    expect(
      canConvertDemandToProject({
        ...eligibleConversion,
        relationshipBlocked: true,
      }),
    ).toBe(false);
  });
});
