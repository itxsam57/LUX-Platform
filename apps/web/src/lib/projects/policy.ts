export type ProjectDraftState = "draft" | "contract_ready" | "contract_locked" | "cancelled";
export type ProjectCompensationModel = "fixed" | "revenue_share" | "hybrid" | "unpaid";

export type ProjectDraftInput = {
  title: string;
  publicSynopsis: string;
  privateBrief: string;
  category: string;
  format: string;
  boundaries: string[];
  compensationModel: ProjectCompensationModel;
  distributionScope: string;
  rightsDeclarations: string[];
};

export class ProjectRevisionConflictError extends Error {
  constructor() {
    super("project_revision_conflict");
    this.name = "ProjectRevisionConflictError";
  }
}

const slugPattern = /^[a-z0-9][a-z0-9_-]{1,47}$/;
const listValuePattern = /^[a-z0-9][a-z0-9 _-]{1,63}$/;
const rightPattern = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const compensationModels = new Set<ProjectCompensationModel>(["fixed", "revenue_share", "hybrid", "unpaid"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueNormalizedList(value: unknown, pattern: RegExp, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("invalid_project_list");
  const result: string[] = [];
  for (const candidate of value) {
    const normalized = text(candidate).toLowerCase();
    if (!pattern.test(normalized)) throw new Error("invalid_project_list");
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}

export function normalizeProjectDraft(input: unknown): ProjectDraftInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_project_input");
  const draft = input as Record<string, unknown>;
  const title = text(draft.title);
  const publicSynopsis = text(draft.publicSynopsis);
  const privateBrief = text(draft.privateBrief);
  const category = text(draft.category).toLowerCase();
  const format = text(draft.format).toLowerCase();
  const compensationModel = text(draft.compensationModel).toLowerCase() as ProjectCompensationModel;
  const distributionScope = text(draft.distributionScope);

  if (title.length < 4 || title.length > 120 || /[\u0000-\u001f\u007f]/.test(title)) throw new Error("invalid_project_title");
  if (publicSynopsis.length < 20 || publicSynopsis.length > 600 || /[\u0000-\u001f\u007f]/.test(publicSynopsis)) throw new Error("invalid_project_public_synopsis");
  if (privateBrief.length < 20 || privateBrief.length > 4000 || /[\u0000-\u001f\u007f]/.test(privateBrief)) throw new Error("invalid_project_private_brief");
  if (!slugPattern.test(category) || !slugPattern.test(format)) throw new Error("invalid_project_classification");
  if (!compensationModels.has(compensationModel)) throw new Error("invalid_project_compensation");
  if (distributionScope.length < 4 || distributionScope.length > 240 || /[\u0000-\u001f\u007f]/.test(distributionScope)) throw new Error("invalid_project_distribution_scope");

  return {
    title,
    publicSynopsis,
    privateBrief,
    category,
    format,
    boundaries: uniqueNormalizedList(draft.boundaries, listValuePattern, 16),
    compensationModel,
    distributionScope,
    rightsDeclarations: uniqueNormalizedList(draft.rightsDeclarations, rightPattern, 16),
  };
}

export function assertExpectedProjectRevision(expectedRevision: number, currentRevision: number): number {
  if (!Number.isSafeInteger(expectedRevision) || !Number.isSafeInteger(currentRevision) || expectedRevision !== currentRevision || currentRevision < 1) {
    throw new ProjectRevisionConflictError();
  }
  return currentRevision + 1;
}

export function canEditProjectDraft(input: {
  actorIsOwner: boolean;
  state: ProjectDraftState;
  relationshipBlocked: boolean;
}): boolean {
  return input.actorIsOwner && input.state === "draft" && !input.relationshipBlocked;
}

export function canConvertDemandToProjectDraft(input: {
  effectiveState: "open" | "creator_interested" | "converted" | "expired" | "closed";
  actorIsSuggestedCreator: boolean;
  actorHasActiveApprovedCreatorWorkspace: boolean;
  actorOwnsInterestedResponse: boolean;
  relationshipBlocked: boolean;
  alreadyConverted: boolean;
}): boolean {
  return input.effectiveState === "creator_interested"
    && input.actorIsSuggestedCreator
    && input.actorHasActiveApprovedCreatorWorkspace
    && input.actorOwnsInterestedResponse
    && !input.relationshipBlocked
    && !input.alreadyConverted;
}
