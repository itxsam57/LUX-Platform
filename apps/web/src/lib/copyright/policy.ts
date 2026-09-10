export type CopyrightCaseStage =
  | "report_received"
  | "matching"
  | "evidence_ready"
  | "notice_drafted"
  | "notice_submitted"
  | "removed"
  | "monitoring"
  | "counter_notice"
  | "closed_false_positive"
  | "closed";

export type CopyrightCaseSummary = {
  publicId: string;
  releasePublicId: string;
  releaseTitle: string;
  stage: CopyrightCaseStage;
  reportedUrl: string;
  evidencePackageAvailable: boolean;
  sourceMatchState: "not_checked" | "no_match" | "possible_session_match";
  noticeStatus: "not_started" | "drafted" | "submitted" | "counter_notice" | "removed";
  removalConfirmedAt: string | null;
  recurrenceCount: number;
  openedAt: string;
  updatedAt: string;
};

export type CopyrightCaseAction =
  | "begin_matching"
  | "prepare_evidence"
  | "draft_notice"
  | "submit_notice"
  | "confirm_removal"
  | "record_recurrence"
  | "record_counter_notice"
  | "mark_false_positive"
  | "close_case";

export type CopyrightStaffCaseSummary = CopyrightCaseSummary & {
  reportPublicId: string;
  rightsRegistered: boolean;
  repeatInfringerFlag: boolean;
};

export type CopyrightEvidence = {
  casePublicId: string;
  releasePublicId: string;
  releaseTitle: string;
  reportedUrl: string;
  reportNote: string;
  reportCreatedAt: string;
  ownershipKind: "owner" | "licensee" | null;
  licenceReference: string | null;
  ownershipEvidenceReference: string | null;
  contentSha256: string | null;
  perceptualFingerprint: string | null;
  sourceMatchState: CopyrightCaseSummary["sourceMatchState"];
  sourceMatchFingerprint: string | null;
  noticeReference: string | null;
  noticeDocumentReference: string | null;
  noticeDocumentSha256: string | null;
  noticeHistory: Array<{
    recordPublicId: string;
    eventType: "drafted" | "submitted" | "removal_confirmed" | "counter_notice";
    documentReference: string;
    documentSha256: string;
    submissionReference: string | null;
    createdAt: string;
  }>;
  evidencePackageReference: string | null;
  evidencePackageSha256: string | null;
  removalConfirmedAt: string | null;
  recurrenceCount: number;
  history: Array<{
    eventPublicId: string;
    eventType: CopyrightCaseAction | "case_opened" | "source_match_recorded";
    stageAfter: CopyrightCaseStage;
    reason: string;
    noticeReference: string | null;
    evidenceReference: string | null;
    createdAt: string;
  }>;
};

export type CreatorRightsRegistryRow = {
  releasePublicId: string;
  releaseTitle: string;
  releasedAt: string;
  rightsPublicId: string | null;
  ownershipKind: "owner" | "licensee" | null;
  registeredAt: string | null;
  watermarkState: "queued" | "completed" | "failed" | null;
};

export type CopyrightIntakeRow = {
  reportPublicId: string;
  releasePublicId: string;
  releaseTitle: string;
  reportedUrl: string;
  reportCreatedAt: string;
  casePublicId: string | null;
};

const CONTROL = /[\u0000-\u001f\u007f]/;
const SHA256 = /^[0-9a-f]{64}$/;
const PERCEPTUAL = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}:[0-9a-f]{16,128}$/;
const EVIDENCE_REFERENCE = /^evidence:[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/;
const CASE_ID = /^cpy[0-9a-f]{24}$/;
const RELEASE_ID = /^rel[0-9a-f]{24}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function onlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max || CONTROL.test(normalized)) return null;
  return normalized;
}

function nullableText(value: unknown, min: number, max: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return boundedText(value, min, max) ?? undefined;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function parseRightsRegistration(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, [
    "ownershipKind",
    "licenceReference",
    "ownershipEvidenceReference",
    "contentSha256",
    "perceptualFingerprint",
  ])) return null;

  const ownershipKind = row.ownershipKind === "owner" || row.ownershipKind === "licensee" ? row.ownershipKind : null;
  const licenceReference = nullableText(row.licenceReference, 3, 180);
  const ownershipEvidenceReference = typeof row.ownershipEvidenceReference === "string"
    && EVIDENCE_REFERENCE.test(row.ownershipEvidenceReference.trim())
    ? row.ownershipEvidenceReference.trim()
    : null;
  const contentSha256 = typeof row.contentSha256 === "string" && SHA256.test(row.contentSha256.trim())
    ? row.contentSha256.trim()
    : null;
  const perceptualFingerprint = typeof row.perceptualFingerprint === "string"
    && PERCEPTUAL.test(row.perceptualFingerprint.trim())
    ? row.perceptualFingerprint.trim()
    : null;

  if (!ownershipKind || licenceReference === undefined || !ownershipEvidenceReference || !contentSha256 || !perceptualFingerprint) return null;
  if (ownershipKind === "licensee" && !licenceReference) return null;
  return { ownershipKind, licenceReference, ownershipEvidenceReference, contentSha256, perceptualFingerprint };
}

export function parseCopyrightCaseMutation(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["action", "reason", "noticeReference"])) return null;
  const actions: CopyrightCaseAction[] = [
    "begin_matching",
    "prepare_evidence",
    "draft_notice",
    "submit_notice",
    "confirm_removal",
    "record_recurrence",
    "record_counter_notice",
    "mark_false_positive",
    "close_case",
  ];
  const action = typeof row.action === "string" && actions.includes(row.action as CopyrightCaseAction)
    ? row.action as CopyrightCaseAction
    : null;
  const reason = boundedText(row.reason, 10, 2000);
  const noticeReference = nullableText(row.noticeReference, 3, 180);
  if (!action || !reason || noticeReference === undefined) return null;
  if (action === "submit_notice" && !noticeReference) return null;
  return { action, reason, noticeReference };
}

function parseCase(value: unknown): CopyrightCaseSummary | null {
  const row = object(value);
  if (!row || !onlyKeys(row, [
    "publicId",
    "releasePublicId",
    "releaseTitle",
    "stage",
    "reportedUrl",
    "evidencePackageAvailable",
    "sourceMatchState",
    "noticeStatus",
    "removalConfirmedAt",
    "recurrenceCount",
    "openedAt",
    "updatedAt",
  ])) return null;

  const stages: CopyrightCaseStage[] = [
    "report_received",
    "matching",
    "evidence_ready",
    "notice_drafted",
    "notice_submitted",
    "removed",
    "monitoring",
    "counter_notice",
    "closed_false_positive",
    "closed",
  ];
  const sourceStates: CopyrightCaseSummary["sourceMatchState"][] = ["not_checked", "no_match", "possible_session_match"];
  const noticeStates: CopyrightCaseSummary["noticeStatus"][] = ["not_started", "drafted", "submitted", "counter_notice", "removed"];
  const publicId = typeof row.publicId === "string" && CASE_ID.test(row.publicId) ? row.publicId : null;
  const releasePublicId = typeof row.releasePublicId === "string" && RELEASE_ID.test(row.releasePublicId) ? row.releasePublicId : null;
  const releaseTitle = boundedText(row.releaseTitle, 2, 180);
  const stage = typeof row.stage === "string" && stages.includes(row.stage as CopyrightCaseStage) ? row.stage as CopyrightCaseStage : null;
  const reportedUrl = boundedText(row.reportedUrl, 8, 2048);
  const sourceMatchState = typeof row.sourceMatchState === "string" && sourceStates.includes(row.sourceMatchState as CopyrightCaseSummary["sourceMatchState"])
    ? row.sourceMatchState as CopyrightCaseSummary["sourceMatchState"]
    : null;
  const noticeStatus = typeof row.noticeStatus === "string" && noticeStates.includes(row.noticeStatus as CopyrightCaseSummary["noticeStatus"])
    ? row.noticeStatus as CopyrightCaseSummary["noticeStatus"]
    : null;
  const removalConfirmedAt = row.removalConfirmedAt === null ? null : timestamp(row.removalConfirmedAt);
  const openedAt = timestamp(row.openedAt);
  const updatedAt = timestamp(row.updatedAt);
  const recurrenceCount = typeof row.recurrenceCount === "number" && Number.isSafeInteger(row.recurrenceCount) && row.recurrenceCount >= 0
    ? row.recurrenceCount
    : null;

  if (!publicId || !releasePublicId || !releaseTitle || !stage || !reportedUrl || !sourceMatchState || !noticeStatus
    || typeof row.evidencePackageAvailable !== "boolean" || recurrenceCount === null || !openedAt || !updatedAt
    || (row.removalConfirmedAt !== null && !removalConfirmedAt)) return null;

  return {
    publicId,
    releasePublicId,
    releaseTitle,
    stage,
    reportedUrl,
    evidencePackageAvailable: row.evidencePackageAvailable,
    sourceMatchState,
    noticeStatus,
    removalConfirmedAt,
    recurrenceCount,
    openedAt,
    updatedAt,
  };
}

export function parseCopyrightCaseList(value: unknown): CopyrightCaseSummary[] {
  if (!Array.isArray(value)) return [];
  const parsed = value.map(parseCase);
  return parsed.every((row): row is CopyrightCaseSummary => row !== null) ? parsed : [];
}

export function parseCopyrightStaffCaseList(value: unknown): CopyrightStaffCaseSummary[] {
  if (!Array.isArray(value)) return [];
  const parsed = value.map((item) => {
    const row = object(item);
    if (!row || !onlyKeys(row, [
      "publicId",
      "releasePublicId",
      "releaseTitle",
      "stage",
      "reportedUrl",
      "evidencePackageAvailable",
      "sourceMatchState",
      "noticeStatus",
      "removalConfirmedAt",
      "recurrenceCount",
      "openedAt",
      "updatedAt",
      "reportPublicId",
      "rightsRegistered",
      "repeatInfringerFlag",
    ])) return null;

    const base = parseCase({
      publicId: row.publicId,
      releasePublicId: row.releasePublicId,
      releaseTitle: row.releaseTitle,
      stage: row.stage,
      reportedUrl: row.reportedUrl,
      evidencePackageAvailable: row.evidencePackageAvailable,
      sourceMatchState: row.sourceMatchState,
      noticeStatus: row.noticeStatus,
      removalConfirmedAt: row.removalConfirmedAt,
      recurrenceCount: row.recurrenceCount,
      openedAt: row.openedAt,
      updatedAt: row.updatedAt,
    });
    const reportPublicId = typeof row.reportPublicId === "string" && /^lkr[0-9a-f]{24}$/.test(row.reportPublicId)
      ? row.reportPublicId
      : null;
    if (!base || !reportPublicId || typeof row.rightsRegistered !== "boolean" || typeof row.repeatInfringerFlag !== "boolean") return null;
    return {
      ...base,
      reportPublicId,
      rightsRegistered: row.rightsRegistered,
      repeatInfringerFlag: row.repeatInfringerFlag,
    };
  });
  return parsed.every((row): row is CopyrightStaffCaseSummary => row !== null) ? parsed : [];
}

export function parseCopyrightEvidence(value: unknown): CopyrightEvidence | null {
  const row = object(value);
  if (!row || !onlyKeys(row, [
    "casePublicId",
    "releasePublicId",
    "releaseTitle",
    "reportedUrl",
    "reportNote",
    "reportCreatedAt",
    "ownershipKind",
    "licenceReference",
    "ownershipEvidenceReference",
    "contentSha256",
    "perceptualFingerprint",
    "sourceMatchState",
    "sourceMatchFingerprint",
    "noticeReference",
    "noticeDocumentReference",
    "noticeDocumentSha256",
    "noticeHistory",
    "evidencePackageReference",
    "evidencePackageSha256",
    "removalConfirmedAt",
    "recurrenceCount",
    "history",
  ])) return null;

  const casePublicId = typeof row.casePublicId === "string" && CASE_ID.test(row.casePublicId) ? row.casePublicId : null;
  const releasePublicId = typeof row.releasePublicId === "string" && RELEASE_ID.test(row.releasePublicId) ? row.releasePublicId : null;
  const releaseTitle = boundedText(row.releaseTitle, 2, 180);
  const reportedUrl = boundedText(row.reportedUrl, 8, 2048);
  const reportNote = boundedText(row.reportNote, 3, 2000);
  const reportCreatedAt = timestamp(row.reportCreatedAt);
  const ownershipKind = row.ownershipKind === null || row.ownershipKind === undefined
    ? null
    : row.ownershipKind === "owner" || row.ownershipKind === "licensee"
      ? row.ownershipKind
      : undefined;
  const licenceReference = nullableText(row.licenceReference, 3, 180);
  const ownershipEvidenceReference = row.ownershipEvidenceReference === null || row.ownershipEvidenceReference === undefined
    ? null
    : typeof row.ownershipEvidenceReference === "string" && EVIDENCE_REFERENCE.test(row.ownershipEvidenceReference)
      ? row.ownershipEvidenceReference
      : undefined;
  const contentSha256 = row.contentSha256 === null || row.contentSha256 === undefined
    ? null
    : typeof row.contentSha256 === "string" && SHA256.test(row.contentSha256)
      ? row.contentSha256
      : undefined;
  const perceptualFingerprint = row.perceptualFingerprint === null || row.perceptualFingerprint === undefined
    ? null
    : typeof row.perceptualFingerprint === "string" && PERCEPTUAL.test(row.perceptualFingerprint)
      ? row.perceptualFingerprint
      : undefined;
  const sourceStates: CopyrightCaseSummary["sourceMatchState"][] = ["not_checked", "no_match", "possible_session_match"];
  const sourceMatchState = typeof row.sourceMatchState === "string" && sourceStates.includes(row.sourceMatchState as CopyrightCaseSummary["sourceMatchState"])
    ? row.sourceMatchState as CopyrightCaseSummary["sourceMatchState"]
    : null;
  const sourceMatchFingerprint = row.sourceMatchFingerprint === null || row.sourceMatchFingerprint === undefined
    ? null
    : typeof row.sourceMatchFingerprint === "string" && SHA256.test(row.sourceMatchFingerprint)
      ? row.sourceMatchFingerprint
      : undefined;
  const noticeReference = nullableText(row.noticeReference, 3, 180);
  const noticeDocumentReference = row.noticeDocumentReference === null || row.noticeDocumentReference === undefined
    ? null
    : typeof row.noticeDocumentReference === "string" && EVIDENCE_REFERENCE.test(row.noticeDocumentReference)
      ? row.noticeDocumentReference
      : undefined;
  const noticeDocumentSha256 = row.noticeDocumentSha256 === null || row.noticeDocumentSha256 === undefined
    ? null
    : typeof row.noticeDocumentSha256 === "string" && SHA256.test(row.noticeDocumentSha256)
      ? row.noticeDocumentSha256
      : undefined;
  const noticeEventTypes: CopyrightEvidence["noticeHistory"][number]["eventType"][] = [
    "drafted",
    "submitted",
    "removal_confirmed",
    "counter_notice",
  ];
  const noticeHistory = Array.isArray(row.noticeHistory) ? row.noticeHistory.map((item) => {
    const record = object(item);
    if (!record || !onlyKeys(record, [
      "recordPublicId",
      "eventType",
      "documentReference",
      "documentSha256",
      "submissionReference",
      "createdAt",
    ])) return null;
    const recordPublicId = typeof record.recordPublicId === "string" && /^cnt[0-9a-f]{24}$/.test(record.recordPublicId)
      ? record.recordPublicId
      : null;
    const eventType = typeof record.eventType === "string" && noticeEventTypes.includes(record.eventType as CopyrightEvidence["noticeHistory"][number]["eventType"])
      ? record.eventType as CopyrightEvidence["noticeHistory"][number]["eventType"]
      : null;
    const documentReference = typeof record.documentReference === "string" && EVIDENCE_REFERENCE.test(record.documentReference)
      ? record.documentReference
      : null;
    const documentSha256 = typeof record.documentSha256 === "string" && SHA256.test(record.documentSha256)
      ? record.documentSha256
      : null;
    const submissionReference = nullableText(record.submissionReference, 3, 180);
    const createdAt = timestamp(record.createdAt);
    if (!recordPublicId || !eventType || !documentReference || !documentSha256 || submissionReference === undefined || !createdAt) return null;
    return { recordPublicId, eventType, documentReference, documentSha256, submissionReference, createdAt };
  }) : null;
  const evidencePackageReference = row.evidencePackageReference === null || row.evidencePackageReference === undefined
    ? null
    : typeof row.evidencePackageReference === "string" && EVIDENCE_REFERENCE.test(row.evidencePackageReference)
      ? row.evidencePackageReference
      : undefined;
  const evidencePackageSha256 = row.evidencePackageSha256 === null || row.evidencePackageSha256 === undefined
    ? null
    : typeof row.evidencePackageSha256 === "string" && SHA256.test(row.evidencePackageSha256)
      ? row.evidencePackageSha256
      : undefined;
  const removalConfirmedAt = row.removalConfirmedAt === null || row.removalConfirmedAt === undefined ? null : timestamp(row.removalConfirmedAt);
  const recurrenceCount = typeof row.recurrenceCount === "number" && Number.isSafeInteger(row.recurrenceCount) && row.recurrenceCount >= 0
    ? row.recurrenceCount
    : null;

  const eventTypes: CopyrightEvidence["history"][number]["eventType"][] = [
    "case_opened",
    "begin_matching",
    "source_match_recorded",
    "prepare_evidence",
    "draft_notice",
    "submit_notice",
    "confirm_removal",
    "record_recurrence",
    "record_counter_notice",
    "mark_false_positive",
    "close_case",
  ];
  const stages: CopyrightCaseStage[] = [
    "report_received",
    "matching",
    "evidence_ready",
    "notice_drafted",
    "notice_submitted",
    "removed",
    "monitoring",
    "counter_notice",
    "closed_false_positive",
    "closed",
  ];
  const history = Array.isArray(row.history) ? row.history.map((item) => {
    const event = object(item);
    if (!event || !onlyKeys(event, ["eventPublicId", "eventType", "stageAfter", "reason", "noticeReference", "evidenceReference", "createdAt"])) return null;
    const eventPublicId = typeof event.eventPublicId === "string" && /^cev[0-9a-f]{24}$/.test(event.eventPublicId) ? event.eventPublicId : null;
    const eventType = typeof event.eventType === "string" && eventTypes.includes(event.eventType as CopyrightEvidence["history"][number]["eventType"])
      ? event.eventType as CopyrightEvidence["history"][number]["eventType"]
      : null;
    const stageAfter = typeof event.stageAfter === "string" && stages.includes(event.stageAfter as CopyrightCaseStage)
      ? event.stageAfter as CopyrightCaseStage
      : null;
    const reason = boundedText(event.reason, 10, 2000);
    const eventNoticeReference = nullableText(event.noticeReference, 3, 180);
    const evidenceReference = event.evidenceReference === null || event.evidenceReference === undefined
      ? null
      : typeof event.evidenceReference === "string" && EVIDENCE_REFERENCE.test(event.evidenceReference)
        ? event.evidenceReference
        : undefined;
    const createdAt = timestamp(event.createdAt);
    if (!eventPublicId || !eventType || !stageAfter || !reason || eventNoticeReference === undefined || evidenceReference === undefined || !createdAt) return null;
    return { eventPublicId, eventType, stageAfter, reason, noticeReference: eventNoticeReference, evidenceReference, createdAt };
  }) : null;

  if (!casePublicId || !releasePublicId || !releaseTitle || !reportedUrl || !reportNote || !reportCreatedAt
    || ownershipKind === undefined || licenceReference === undefined || ownershipEvidenceReference === undefined
    || contentSha256 === undefined || perceptualFingerprint === undefined || !sourceMatchState
    || sourceMatchFingerprint === undefined || noticeReference === undefined || noticeDocumentReference === undefined
    || noticeDocumentSha256 === undefined || !noticeHistory
    || !noticeHistory.every((record): record is CopyrightEvidence["noticeHistory"][number] => record !== null)
    || ((noticeDocumentReference === null) !== (noticeDocumentSha256 === null)) || evidencePackageReference === undefined
    || evidencePackageSha256 === undefined || (row.removalConfirmedAt !== null && row.removalConfirmedAt !== undefined && !removalConfirmedAt)
    || recurrenceCount === null || !history || !history.every((event): event is CopyrightEvidence["history"][number] => event !== null)) return null;

  return {
    casePublicId,
    releasePublicId,
    releaseTitle,
    reportedUrl,
    reportNote,
    reportCreatedAt,
    ownershipKind,
    licenceReference,
    ownershipEvidenceReference,
    contentSha256,
    perceptualFingerprint,
    sourceMatchState,
    sourceMatchFingerprint,
    noticeReference,
    noticeDocumentReference,
    noticeDocumentSha256,
    noticeHistory,
    evidencePackageReference,
    evidencePackageSha256,
    removalConfirmedAt,
    recurrenceCount,
    history,
  };
}

export function parseCreatorRightsRegistry(value: unknown): CreatorRightsRegistryRow[] {
  if (!Array.isArray(value)) return [];
  const parsed = value.map((item) => {
    const row = object(item);
    if (!row || !onlyKeys(row, ["releasePublicId", "releaseTitle", "releasedAt", "rightsPublicId", "ownershipKind", "registeredAt", "watermarkState"])) return null;
    const releasePublicId = typeof row.releasePublicId === "string" && RELEASE_ID.test(row.releasePublicId) ? row.releasePublicId : null;
    const releaseTitle = boundedText(row.releaseTitle, 2, 180);
    const releasedAt = timestamp(row.releasedAt);
    const rightsPublicId = row.rightsPublicId === null || row.rightsPublicId === undefined
      ? null
      : typeof row.rightsPublicId === "string" && /^crg[0-9a-f]{24}$/.test(row.rightsPublicId)
        ? row.rightsPublicId
        : undefined;
    const ownershipKind = row.ownershipKind === null || row.ownershipKind === undefined
      ? null
      : row.ownershipKind === "owner" || row.ownershipKind === "licensee"
        ? row.ownershipKind
        : undefined;
    const registeredAt = row.registeredAt === null || row.registeredAt === undefined ? null : timestamp(row.registeredAt);
    const watermarkState = row.watermarkState === null || row.watermarkState === undefined
      ? null
      : row.watermarkState === "queued" || row.watermarkState === "completed" || row.watermarkState === "failed"
        ? row.watermarkState
        : undefined;
    if (!releasePublicId || !releaseTitle || !releasedAt || rightsPublicId === undefined || ownershipKind === undefined
      || (row.registeredAt !== null && row.registeredAt !== undefined && !registeredAt) || watermarkState === undefined) return null;
    return { releasePublicId, releaseTitle, releasedAt, rightsPublicId, ownershipKind, registeredAt, watermarkState };
  });
  return parsed.every((row): row is CreatorRightsRegistryRow => row !== null) ? parsed : [];
}

export function parseCopyrightIntakeList(value: unknown): CopyrightIntakeRow[] {
  if (!Array.isArray(value)) return [];
  const parsed = value.map((item) => {
    const row = object(item);
    if (!row || !onlyKeys(row, ["reportPublicId", "releasePublicId", "releaseTitle", "reportedUrl", "reportCreatedAt", "casePublicId"])) return null;
    const reportPublicId = typeof row.reportPublicId === "string" && /^lkr[0-9a-f]{24}$/.test(row.reportPublicId) ? row.reportPublicId : null;
    const releasePublicId = typeof row.releasePublicId === "string" && RELEASE_ID.test(row.releasePublicId) ? row.releasePublicId : null;
    const releaseTitle = boundedText(row.releaseTitle, 2, 180);
    const reportedUrl = boundedText(row.reportedUrl, 8, 2048);
    const reportCreatedAt = timestamp(row.reportCreatedAt);
    const casePublicId = row.casePublicId === null || row.casePublicId === undefined
      ? null
      : typeof row.casePublicId === "string" && CASE_ID.test(row.casePublicId)
        ? row.casePublicId
        : undefined;
    if (!reportPublicId || !releasePublicId || !releaseTitle || !reportedUrl || !reportCreatedAt || casePublicId === undefined) return null;
    return { reportPublicId, releasePublicId, releaseTitle, reportedUrl, reportCreatedAt, casePublicId };
  });
  return parsed.every((row): row is CopyrightIntakeRow => row !== null) ? parsed : [];
}
