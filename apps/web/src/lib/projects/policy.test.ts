import { describe, expect, it } from "vitest";
import {
  ProjectRevisionConflictError,
  assertExpectedProjectRevision,
  canConvertDemandToProjectDraft,
  canEditProjectDraft,
  normalizeProjectDraft,
} from "./policy";

describe("project draft policy", () => {
  it("normalizes a valid project draft into explicit safe fields", () => {
    expect(normalizeProjectDraft({
      title: "  Rooftop editorial short  ",
      publicSynopsis: " A public-safe synopsis that explains the voluntary creator-led concept. ",
      privateBrief: " A private production brief with scheduling notes, boundaries, and collaborator context. ",
      category: "Creator_Idea",
      format: "Short_Film",
      boundaries: [" no-surprises ", "no-surprises", "closed-set"],
      compensationModel: "fixed",
      distributionScope: "Platform release only",
      rightsDeclarations: ["original-concept", "original-concept"],
    })).toEqual({
      title: "Rooftop editorial short",
      publicSynopsis: "A public-safe synopsis that explains the voluntary creator-led concept.",
      privateBrief: "A private production brief with scheduling notes, boundaries, and collaborator context.",
      category: "creator_idea",
      format: "short_film",
      boundaries: ["no-surprises", "closed-set"],
      compensationModel: "fixed",
      distributionScope: "Platform release only",
      rightsDeclarations: ["original-concept"],
    });
  });

  it("rejects private/public text and unsafe list values outside the contract", () => {
    expect(() => normalizeProjectDraft({
      title: "x",
      publicSynopsis: "too short",
      privateBrief: "too short",
      category: "bad category",
      format: "video",
      boundaries: ["<script>"],
      compensationModel: "fixed",
      distributionScope: "web",
      rightsDeclarations: [],
    })).toThrow(/invalid_project/i);
  });

  it("increments only the exact current revision", () => {
    expect(assertExpectedProjectRevision(4, 4)).toBe(5);
  });

  it("rejects stale optimistic writes instead of silently overwriting", () => {
    expect(() => assertExpectedProjectRevision(3, 4)).toThrow(ProjectRevisionConflictError);
  });

  it("allows only the owner to edit an unlocked draft", () => {
    expect(canEditProjectDraft({ actorIsOwner: true, state: "draft", relationshipBlocked: false })).toBe(true);
    expect(canEditProjectDraft({ actorIsOwner: false, state: "draft", relationshipBlocked: false })).toBe(false);
    expect(canEditProjectDraft({ actorIsOwner: true, state: "contract_locked", relationshipBlocked: false })).toBe(false);
  });

  it("denies project editing across a block relationship", () => {
    expect(canEditProjectDraft({ actorIsOwner: true, state: "draft", relationshipBlocked: true })).toBe(false);
  });

  it("allows demand conversion only to the eligible interested creator", () => {
    expect(canConvertDemandToProjectDraft({
      effectiveState: "creator_interested",
      actorIsSuggestedCreator: true,
      actorHasActiveApprovedCreatorWorkspace: true,
      actorOwnsInterestedResponse: true,
      relationshipBlocked: false,
      alreadyConverted: false,
    })).toBe(true);
  });

  it("keeps fans, duplicate conversion, blocks, and non-interested state out of conversion", () => {
    const eligible = {
      effectiveState: "creator_interested" as const,
      actorIsSuggestedCreator: true,
      actorHasActiveApprovedCreatorWorkspace: true,
      actorOwnsInterestedResponse: true,
      relationshipBlocked: false,
      alreadyConverted: false,
    };
    expect(canConvertDemandToProjectDraft({ ...eligible, actorIsSuggestedCreator: false })).toBe(false);
    expect(canConvertDemandToProjectDraft({ ...eligible, alreadyConverted: true })).toBe(false);
    expect(canConvertDemandToProjectDraft({ ...eligible, relationshipBlocked: true })).toBe(false);
    expect(canConvertDemandToProjectDraft({ ...eligible, effectiveState: "open" })).toBe(false);
  });
});
