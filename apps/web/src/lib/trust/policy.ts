export type SupportCase = {
  publicId: string;
  subject: string;
  state: "open" | "in_progress" | "resolved";
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type ReportCase = {
  publicId: string;
  subjectType: "profile" | "project" | "campaign" | "release";
  subjectPublicId: string;
  summary: string;
  state: "open" | "in_review" | "resolved";
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type DisputeCase = {
  publicId: string;
  subjectType: "funding_commitment" | "release";
  subjectPublicId: string;
  category: "payment" | "refund" | "delivery" | "access" | "quality" | "other";
  summary: string;
  state: "open" | "in_review" | "resolved" | "rejected" | "withdrawn";
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type AppealCase = {
  publicId: string;
  sourceType: "support_case" | "consumer_dispute";
  sourcePublicId: string;
  state: "open" | "in_review" | "upheld" | "overturned" | "closed";
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
};

export type TrustCaseProjection = {
  support: SupportCase[];
  reports: ReportCase[];
  disputes: DisputeCase[];
  appeals: AppealCase[];
};

const CONTROL = /[\u0000-\u001f\u007f]/;
const SUPPORT_ID = /^sup[0-9a-f]{24}$/;
const MODERATION_ID = /^mod[0-9a-f]{24}$/;
const DISPUTE_ID = /^dsp[0-9a-f]{24}$/;
const APPEAL_ID = /^apl[0-9a-f]{24}$/;
const FUNDING_ID = /^fnd[0-9a-f]{24}$/;
const RELEASE_ID = /^rel[0-9a-f]{24}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function nullableTimestamp(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return timestamp(value) ?? undefined;
}

function boundedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= min && normalized.length <= max && !CONTROL.test(normalized)
    ? normalized
    : null;
}

function nullableText(value: unknown, min: number, max: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  return boundedText(value, min, max) ?? undefined;
}

function parseList<T>(value: unknown, parser: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parser);
  return parsed.every((entry): entry is T => entry !== null) ? parsed : null;
}

function parseSupportCase(value: unknown): SupportCase | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["publicId","subject","state","createdAt","updatedAt","resolvedAt"])) return null;
  const publicId = typeof row.publicId === "string" && SUPPORT_ID.test(row.publicId) ? row.publicId : null;
  const subject = boundedText(row.subject, 8, 160);
  const state = row.state === "open" || row.state === "in_progress" || row.state === "resolved" ? row.state : null;
  const createdAt = timestamp(row.createdAt), updatedAt = timestamp(row.updatedAt), resolvedAt = nullableTimestamp(row.resolvedAt);
  return publicId && subject && state && createdAt && updatedAt && resolvedAt !== undefined
    ? { publicId, subject, state, createdAt, updatedAt, resolvedAt }
    : null;
}

function parseReportCase(value: unknown): ReportCase | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["publicId","subjectType","subjectPublicId","summary","state","createdAt","updatedAt","resolvedAt"])) return null;
  const publicId = typeof row.publicId === "string" && MODERATION_ID.test(row.publicId) ? row.publicId : null;
  const subjectType = row.subjectType === "profile" || row.subjectType === "project" || row.subjectType === "campaign" || row.subjectType === "release"
    ? row.subjectType
    : null;
  const subjectPublicId = boundedText(row.subjectPublicId, 3, 120);
  const summary = boundedText(row.summary, 8, 500);
  const state = row.state === "open" || row.state === "in_review" || row.state === "resolved" ? row.state : null;
  const createdAt = timestamp(row.createdAt), updatedAt = timestamp(row.updatedAt), resolvedAt = nullableTimestamp(row.resolvedAt);
  return publicId && subjectType && subjectPublicId && summary && state && createdAt && updatedAt && resolvedAt !== undefined
    ? { publicId, subjectType, subjectPublicId, summary, state, createdAt, updatedAt, resolvedAt }
    : null;
}

function parseDisputeCase(value: unknown): DisputeCase | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["publicId","subjectType","subjectPublicId","category","summary","state","resolutionNote","createdAt","updatedAt","resolvedAt"])) return null;
  const publicId = typeof row.publicId === "string" && DISPUTE_ID.test(row.publicId) ? row.publicId : null;
  const subjectType = row.subjectType === "funding_commitment" || row.subjectType === "release" ? row.subjectType : null;
  const subjectPublicId = typeof row.subjectPublicId === "string"
    && ((subjectType === "funding_commitment" && FUNDING_ID.test(row.subjectPublicId))
      || (subjectType === "release" && RELEASE_ID.test(row.subjectPublicId)))
    ? row.subjectPublicId
    : null;
  const category = row.category === "payment" || row.category === "refund" || row.category === "delivery"
    || row.category === "access" || row.category === "quality" || row.category === "other"
    ? row.category
    : null;
  const summary = boundedText(row.summary, 8, 240);
  const state = row.state === "open" || row.state === "in_review" || row.state === "resolved"
    || row.state === "rejected" || row.state === "withdrawn" ? row.state : null;
  const resolutionNote = nullableText(row.resolutionNote, 8, 2000);
  const createdAt = timestamp(row.createdAt), updatedAt = timestamp(row.updatedAt), resolvedAt = nullableTimestamp(row.resolvedAt);
  return publicId && subjectType && subjectPublicId && category && summary && state
    && resolutionNote !== undefined && createdAt && updatedAt && resolvedAt !== undefined
    ? { publicId, subjectType, subjectPublicId, category, summary, state, resolutionNote, createdAt, updatedAt, resolvedAt }
    : null;
}

function parseAppealCase(value: unknown): AppealCase | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["publicId","sourceType","sourcePublicId","state","decisionNote","createdAt","updatedAt","decidedAt"])) return null;
  const publicId = typeof row.publicId === "string" && APPEAL_ID.test(row.publicId) ? row.publicId : null;
  const sourceType = row.sourceType === "support_case" || row.sourceType === "consumer_dispute" ? row.sourceType : null;
  const sourcePublicId = typeof row.sourcePublicId === "string"
    && ((sourceType === "support_case" && SUPPORT_ID.test(row.sourcePublicId))
      || (sourceType === "consumer_dispute" && DISPUTE_ID.test(row.sourcePublicId)))
    ? row.sourcePublicId
    : null;
  const state = row.state === "open" || row.state === "in_review" || row.state === "upheld"
    || row.state === "overturned" || row.state === "closed" ? row.state : null;
  const decisionNote = nullableText(row.decisionNote, 8, 2000);
  const createdAt = timestamp(row.createdAt), updatedAt = timestamp(row.updatedAt), decidedAt = nullableTimestamp(row.decidedAt);
  return publicId && sourceType && sourcePublicId && state && decisionNote !== undefined
    && createdAt && updatedAt && decidedAt !== undefined
    ? { publicId, sourceType, sourcePublicId, state, decisionNote, createdAt, updatedAt, decidedAt }
    : null;
}

export function parseTrustCases(value: unknown): TrustCaseProjection | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["support","reports","disputes","appeals"])) return null;
  const support = parseList(row.support, parseSupportCase);
  const reports = parseList(row.reports, parseReportCase);
  const disputes = parseList(row.disputes, parseDisputeCase);
  const appeals = parseList(row.appeals, parseAppealCase);
  return support && reports && disputes && appeals ? { support, reports, disputes, appeals } : null;
}

export function parseSupportInput(subjectValue: unknown, bodyValue: unknown) {
  const subject = boundedText(subjectValue, 8, 160);
  const body = boundedText(bodyValue, 20, 4000);
  return subject && body ? { subject, body } : null;
}

export function parseReportInput(typeValue: unknown, targetValue: unknown, summaryValue: unknown, reasonValue: unknown) {
  const subjectType = typeValue === "profile" || typeValue === "project" || typeValue === "campaign" || typeValue === "release"
    ? typeValue
    : null;
  const subjectPublicId = boundedText(targetValue, 3, 120);
  const summary = boundedText(summaryValue, 8, 500);
  const reason = boundedText(reasonValue, 8, 1000);
  return subjectType && subjectPublicId && summary && reason ? { subjectType, subjectPublicId, summary, reason } : null;
}

export function parseDisputeInput(typeValue: unknown, targetValue: unknown, categoryValue: unknown, summaryValue: unknown, detailValue: unknown) {
  const subjectType = typeValue === "funding_commitment" || typeValue === "release" ? typeValue : null;
  const target = typeof targetValue === "string" ? targetValue.trim() : "";
  const subjectPublicId = subjectType === "funding_commitment" && FUNDING_ID.test(target)
    ? target
    : subjectType === "release" && RELEASE_ID.test(target)
      ? target
      : null;
  const category = categoryValue === "payment" || categoryValue === "refund" || categoryValue === "delivery"
    || categoryValue === "access" || categoryValue === "quality" || categoryValue === "other"
    ? categoryValue
    : null;
  const summary = boundedText(summaryValue, 8, 240);
  const detail = boundedText(detailValue, 20, 4000);
  return subjectType && subjectPublicId && category && summary && detail
    ? { subjectType, subjectPublicId, category, summary, detail }
    : null;
}

export function parseAppealInput(typeValue: unknown, sourceValue: unknown, reasonValue: unknown) {
  const sourceType = typeValue === "support_case" || typeValue === "consumer_dispute" ? typeValue : null;
  const source = typeof sourceValue === "string" ? sourceValue.trim() : "";
  const sourcePublicId = sourceType === "support_case" && SUPPORT_ID.test(source)
    ? source
    : sourceType === "consumer_dispute" && DISPUTE_ID.test(source)
      ? source
      : null;
  const reason = boundedText(reasonValue, 20, 4000);
  return sourceType && sourcePublicId && reason ? { sourceType, sourcePublicId, reason } : null;
}

export function parseCasePublicId(kind: "dispute" | "appeal", value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return (kind === "dispute" ? DISPUTE_ID : APPEAL_ID).test(normalized) ? normalized : null;
}

export function parseReviewReason(value: unknown) {
  return boundedText(value, 8, 2000);
}
