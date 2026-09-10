export type ReviewProcessingState = "uploaded" | "processing" | "ready" | "failed";
export type ReviewChecklistState = "pending" | "pass" | "fail";
export type FinalCutApprovalState = "pending" | "approved" | "changes_requested";
export type DeliveryReviewState = "pending" | "in_review" | "changes_requested" | "held" | "escalated" | "approved" | "rejected";
export type DeliveryReviewDecision = "approve" | "reject" | "request_changes" | "escalate" | "hold";

export type DeliveryReviewContext = {
  project: { publicId: string; title: string; state: string };
  contract: null | {
    version: number;
    termsHash: string;
    body: Record<string, unknown>;
    participants: Array<{ handle: string; role: string; depicted: boolean; accepted: boolean; consentRecorded: boolean | null }>;
  };
  current: null | {
    publicId: string;
    version: number;
    assetPublicId: string;
    sha256: string;
    processingState: ReviewProcessingState;
    processingNote: string | null;
    status: DeliveryReviewState;
    releaseReady: boolean;
    submittedAt: string;
    finalCutApprovals: Array<{ handle: string; state: FinalCutApprovalState; note: string | null; respondedAt: string | null }>;
    checklist: Array<{ key: string; label: string; required: boolean; state: ReviewChecklistState; note: string | null; checkedAt: string | null }>;
  };
  deliveries: DeliveryReviewVersion[];
  reviewHistory: Array<{ deliveryPublicId: string; version: number; decision: DeliveryReviewDecision; reason: string; reviewerHandle: string | null; createdAt: string }>;
  creatorResponses: Array<{ deliveryPublicId: string; version: number; body: string; createdAt: string }>;
};

export type DeliveryReviewVersion = {
  publicId: string;
  version: number;
  sha256: string;
  processingState: ReviewProcessingState;
  status: DeliveryReviewState;
  releaseReady: boolean;
  submittedAt: string;
};

export type FinalCutReviewContext = {
  projectPublicId: string;
  projectTitle: string;
  delivery: Omit<DeliveryReviewVersion, "status" | "releaseReady"> & { reviewStatus: DeliveryReviewState };
  contract: { termsHash: string; finalCutApprovalRequired: boolean };
  approval: { state: FinalCutApprovalState; note: string | null; respondedAt: string | null };
};

export type DeliveryReviewQueueItem = DeliveryReviewVersion & {
  projectPublicId: string;
  title: string;
  deliveryPublicId: string;
  finalCutBlockers: number;
  checklistBlockers: number;
};

const PROCESSING_STATES = new Set<ReviewProcessingState>(["uploaded", "processing", "ready", "failed"]);
const CHECKLIST_STATES = new Set<ReviewChecklistState>(["pending", "pass", "fail"]);
const FINAL_CUT_STATES = new Set<FinalCutApprovalState>(["pending", "approved", "changes_requested"]);
const REVIEW_STATES = new Set<DeliveryReviewState>(["pending", "in_review", "changes_requested", "held", "escalated", "approved", "rejected"]);
const REVIEW_DECISIONS = new Set<DeliveryReviewDecision>(["approve", "reject", "request_changes", "escalate", "hold"]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedText(value: unknown, max = 4000) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

function nullableText(value: unknown, max = 4000): string | null | undefined {
  if (value === null || value === undefined) return null;
  return boundedText(value, max) ?? undefined;
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function timestamp(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function nullableTimestamp(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return timestamp(value) ?? undefined;
}

function opaqueId(value: unknown, prefix: string) {
  return typeof value === "string" && new RegExp(`^${prefix}[0-9a-f]{24}$`).test(value) ? value : null;
}

function hash(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

function enumValue<T extends string>(value: unknown, values: Set<T>): T | null {
  return typeof value === "string" && values.has(value as T) ? value as T : null;
}

function parseList<T>(value: unknown, parser: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parser);
  return parsed.every((item): item is T => item !== null) ? parsed : null;
}

function parseVersion(value: unknown): DeliveryReviewVersion | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["publicId", "version", "sha256", "processingState", "status", "releaseReady", "submittedAt"])) return null;
  const publicId = opaqueId(row.publicId, "fdv"), version = positiveInteger(row.version), sha256 = hash(row.sha256);
  const processingState = enumValue(row.processingState, PROCESSING_STATES), status = enumValue(row.status, REVIEW_STATES), submittedAt = timestamp(row.submittedAt);
  return publicId && version && sha256 && processingState && status && typeof row.releaseReady === "boolean" && submittedAt
    ? { publicId, version, sha256, processingState, status, releaseReady: row.releaseReady, submittedAt }
    : null;
}

function parseParticipant(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["handle", "role", "depicted", "accepted", "consentRecorded"])) return null;
  const handle = boundedText(row.handle, 64), role = boundedText(row.role, 64);
  if (!handle || !role || typeof row.depicted !== "boolean" || typeof row.accepted !== "boolean") return null;
  if (row.consentRecorded !== null && typeof row.consentRecorded !== "boolean") return null;
  return { handle, role, depicted: row.depicted, accepted: row.accepted, consentRecorded: row.consentRecorded as boolean | null };
}

function parseFinalCutApproval(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["handle", "state", "note", "respondedAt"])) return null;
  const handle = boundedText(row.handle, 64), state = enumValue(row.state, FINAL_CUT_STATES), note = nullableText(row.note, 1000), respondedAt = nullableTimestamp(row.respondedAt);
  return handle && state && note !== undefined && respondedAt !== undefined ? { handle, state, note, respondedAt } : null;
}

function parseChecklistItem(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["key", "label", "required", "state", "note", "checkedAt"])) return null;
  const key = boundedText(row.key, 32), label = boundedText(row.label, 120), state = enumValue(row.state, CHECKLIST_STATES), note = nullableText(row.note, 1000), checkedAt = nullableTimestamp(row.checkedAt);
  return key && label && state && note !== undefined && checkedAt !== undefined && typeof row.required === "boolean"
    ? { key, label, required: row.required, state, note, checkedAt }
    : null;
}

export function parseDeliveryReviewContext(value: unknown): DeliveryReviewContext | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["project", "contract", "current", "deliveries", "reviewHistory", "creatorResponses"])) return null;
  const project = object(row.project);
  if (!project || !onlyKeys(project, ["publicId", "title", "state"])) return null;
  const projectPublicId = opaqueId(project.publicId, "prj"), title = boundedText(project.title, 180), projectState = boundedText(project.state, 64);
  if (!projectPublicId || !title || !projectState) return null;

  let contract: DeliveryReviewContext["contract"] = null;
  if (row.contract !== null && row.contract !== undefined) {
    const contractRow = object(row.contract);
    if (!contractRow || !onlyKeys(contractRow, ["version", "termsHash", "body", "participants"])) return null;
    const version = positiveInteger(contractRow.version), termsHash = hash(contractRow.termsHash), body = object(contractRow.body), participants = parseList(contractRow.participants, parseParticipant);
    if (!version || !termsHash || !body || !participants) return null;
    contract = { version, termsHash, body, participants };
  }

  let current: DeliveryReviewContext["current"] = null;
  if (row.current !== null && row.current !== undefined) {
    const currentRow = object(row.current);
    if (!currentRow || !onlyKeys(currentRow, ["publicId", "version", "assetPublicId", "sha256", "processingState", "processingNote", "status", "releaseReady", "submittedAt", "finalCutApprovals", "checklist"])) return null;
    const base = parseVersion({
      publicId: currentRow.publicId,
      version: currentRow.version,
      sha256: currentRow.sha256,
      processingState: currentRow.processingState,
      status: currentRow.status,
      releaseReady: currentRow.releaseReady,
      submittedAt: currentRow.submittedAt,
    });
    const assetPublicId = opaqueId(currentRow.assetPublicId, "ast"), processingNote = nullableText(currentRow.processingNote, 1000);
    const finalCutApprovals = parseList(currentRow.finalCutApprovals, parseFinalCutApproval), checklist = parseList(currentRow.checklist, parseChecklistItem);
    if (!base || !assetPublicId || processingNote === undefined || !finalCutApprovals || !checklist) return null;
    current = { ...base, assetPublicId, processingNote, finalCutApprovals, checklist };
  }

  const deliveries = parseList(row.deliveries, parseVersion);
  const reviewHistory = parseList(row.reviewHistory, (value) => {
    const item = object(value);
    if (!item || !onlyKeys(item, ["deliveryPublicId", "version", "decision", "reason", "reviewerHandle", "createdAt"])) return null;
    const deliveryPublicId = opaqueId(item.deliveryPublicId, "fdv"), version = positiveInteger(item.version), decision = enumValue(item.decision, REVIEW_DECISIONS), reason = boundedText(item.reason, 2000), reviewerHandle = nullableText(item.reviewerHandle, 64), createdAt = timestamp(item.createdAt);
    return deliveryPublicId && version && decision && reason && reviewerHandle !== undefined && createdAt ? { deliveryPublicId, version, decision, reason, reviewerHandle, createdAt } : null;
  });
  const creatorResponses = parseList(row.creatorResponses, (value) => {
    const item = object(value);
    if (!item || !onlyKeys(item, ["deliveryPublicId", "version", "body", "createdAt"])) return null;
    const deliveryPublicId = opaqueId(item.deliveryPublicId, "fdv"), version = positiveInteger(item.version), body = boundedText(item.body, 2000), createdAt = timestamp(item.createdAt);
    return deliveryPublicId && version && body && createdAt ? { deliveryPublicId, version, body, createdAt } : null;
  });
  if (!deliveries || !reviewHistory || !creatorResponses) return null;
  return { project: { publicId: projectPublicId, title, state: projectState }, contract, current, deliveries, reviewHistory, creatorResponses };
}

export function parseFinalCutReviewContext(value: unknown): FinalCutReviewContext | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["projectPublicId", "projectTitle", "delivery", "contract", "approval"])) return null;
  const projectPublicId = opaqueId(row.projectPublicId, "prj"), projectTitle = boundedText(row.projectTitle, 180);
  const deliveryRow = object(row.delivery), contractRow = object(row.contract), approvalRow = object(row.approval);
  if (!projectPublicId || !projectTitle || !deliveryRow || !contractRow || !approvalRow) return null;
  if (!onlyKeys(deliveryRow, ["publicId", "version", "sha256", "processingState", "reviewStatus", "submittedAt"])
    || !onlyKeys(contractRow, ["termsHash", "finalCutApprovalRequired"])
    || !onlyKeys(approvalRow, ["state", "note", "respondedAt"])) return null;
  const publicId = opaqueId(deliveryRow.publicId, "fdv"), version = positiveInteger(deliveryRow.version), sha256 = hash(deliveryRow.sha256), processingState = enumValue(deliveryRow.processingState, PROCESSING_STATES), reviewStatus = enumValue(deliveryRow.reviewStatus, REVIEW_STATES), submittedAt = timestamp(deliveryRow.submittedAt);
  const termsHash = hash(contractRow.termsHash), state = enumValue(approvalRow.state, FINAL_CUT_STATES), note = nullableText(approvalRow.note, 1000), respondedAt = nullableTimestamp(approvalRow.respondedAt);
  if (!publicId || !version || !sha256 || !processingState || !reviewStatus || !submittedAt || !termsHash || typeof contractRow.finalCutApprovalRequired !== "boolean" || !state || note === undefined || respondedAt === undefined) return null;
  return {
    projectPublicId,
    projectTitle,
    delivery: { publicId, version, sha256, processingState, reviewStatus, submittedAt },
    contract: { termsHash, finalCutApprovalRequired: contractRow.finalCutApprovalRequired },
    approval: { state, note, respondedAt },
  };
}

export function parseDeliveryReviewQueue(value: unknown): DeliveryReviewQueueItem[] {
  const parsed = parseList(value, (entry) => {
    const row = object(entry);
    if (!row || !onlyKeys(row, ["projectPublicId", "title", "deliveryPublicId", "version", "sha256", "processingState", "status", "releaseReady", "finalCutBlockers", "checklistBlockers", "submittedAt"])) return null;
    const projectPublicId = opaqueId(row.projectPublicId, "prj"), title = boundedText(row.title, 180), deliveryPublicId = opaqueId(row.deliveryPublicId, "fdv"), version = positiveInteger(row.version), sha256 = hash(row.sha256), processingState = enumValue(row.processingState, PROCESSING_STATES), status = enumValue(row.status, REVIEW_STATES), finalCutBlockers = nonNegativeInteger(row.finalCutBlockers), checklistBlockers = nonNegativeInteger(row.checklistBlockers), submittedAt = timestamp(row.submittedAt);
    if (!projectPublicId || !title || !deliveryPublicId || !version || !sha256 || !processingState || !status || typeof row.releaseReady !== "boolean" || finalCutBlockers === null || checklistBlockers === null || !submittedAt) return null;
    return { publicId: deliveryPublicId, projectPublicId, title, deliveryPublicId, version, sha256, processingState, status, releaseReady: row.releaseReady, finalCutBlockers, checklistBlockers, submittedAt };
  });
  return parsed ?? [];
}

export function canApprovePlatformReview(input: {
  processingState: ReviewProcessingState;
  checklist: Array<{ key: string; state: ReviewChecklistState }>;
  finalCutApprovals: Array<{ required: boolean; state: FinalCutApprovalState }>;
}) {
  return input.processingState === "ready"
    && input.checklist.length > 0
    && input.checklist.every((item) => item.state === "pass")
    && input.finalCutApprovals.every((approval) => !approval.required || approval.state === "approved");
}

export function parseReviewDecisionNote(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.length > 2000 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

export function parseFinalCutDecision(value: unknown): Exclude<FinalCutApprovalState, "pending"> | null {
  return value === "approved" || value === "changes_requested" ? value : null;
}

export function parsePlatformReviewDecision(value: unknown): DeliveryReviewDecision | null {
  return enumValue(value, REVIEW_DECISIONS);
}

export function parseReviewChecklistUpdate(value: unknown): Exclude<ReviewChecklistState, "pending"> | null {
  return value === "pass" || value === "fail" ? value : null;
}

export function parseProcessingReviewUpdate(value: unknown): ReviewProcessingState | null {
  return enumValue(value, PROCESSING_STATES);
}
