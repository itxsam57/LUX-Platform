export type EarningsRow = {
  projectPublicId: string;
  projectTitle: string;
  currency: string;
  restrictedMinor: number;
  availableMinor: number;
  pendingPayoutMinor: number;
  paidMinor: number;
  openHoldMinor: number;
  payoutEligible: boolean;
};

export type EarningsStatement = {
  projectPublicId: string;
  from: string;
  to: string;
  entries: Array<{
    journalPublicId: string;
    kind: string;
    currency: string;
    account: string;
    side: "debit" | "credit";
    amountMinor: number;
    occurredAt: string;
  }>;
};

export type FinancePayoutQueue = {
  payouts: Array<{
    publicId: string;
    projectPublicId: string;
    participantHandle: string;
    amountMinor: number;
    currency: string;
    state: "requested" | "processing" | "failed";
    attemptCount: number;
    batchPublicId: string | null;
    createdAt: string;
  }>;
  holds: Array<{
    publicId: string;
    projectPublicId: string;
    participantHandle: string;
    kind: "reserve" | "dispute" | "chargeback" | "campaign" | "verification";
    amountMinor: number;
    currency: string;
    state: "open";
    reason: string;
    createdAt: string;
  }>;
  reconciliationCases: Array<{
    publicId: string;
    projectPublicId: string;
    payoutPublicId: string | null;
    kind: string;
    expectedMinor: number | null;
    observedMinor: number | null;
    currency: string;
    state: "open";
    note: string | null;
    createdAt: string;
  }>;
};

export type MyPayout = {
  publicId: string;
  projectPublicId: string;
  projectTitle: string;
  amountMinor: number;
  currency: string;
  state: "requested" | "processing" | "paid" | "failed";
  attemptCount: number;
  createdAt: string;
  paidAt: string | null;
};

const CONTROL = /[\u0000-\u001f\u007f]/;
const PROJECT_ID = /^prj[0-9a-f]{24}$/;
const JOURNAL_ID = /^jrn[0-9a-f]{24}$/;
const PAYOUT_ID = /^pay[0-9a-f]{24}$/;
const BATCH_ID = /^pbt[0-9a-f]{24}$/;
const HOLD_ID = /^hld[0-9a-f]{24}$/;
const FINANCE_CASE_ID = /^fin[0-9a-f]{24}$/;
const HANDLE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_CODES = new Set(["participant_restricted", "agency_restricted", "participant_available", "payout_pending", "payout_settled"]);
const JOURNAL_KINDS = new Set(["payment_settlement", "payment_adjustment", "earnings_promotion", "earnings_hold", "earnings_hold_release", "payout_reservation", "payout_paid", "payout_failed", "payout_retry"]);
const PAYOUT_STATES = new Set(["requested", "processing", "failed"] as const);
const MY_PAYOUT_STATES = new Set(["requested", "processing", "paid", "failed"] as const);
const HOLD_KINDS = new Set(["reserve", "dispute", "chargeback", "campaign", "verification"] as const);

type FinanceResourceKind = "project" | "payout" | "hold";

const RESOURCE_PATTERNS: Record<FinanceResourceKind, RegExp> = {
  project: PROJECT_ID,
  payout: PAYOUT_ID,
  hold: HOLD_ID,
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max && !CONTROL.test(normalized) ? normalized : null;
}

function nonNegativeMinor(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function positiveMinor(value: unknown) {
  const parsed = nonNegativeMinor(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function timestamp(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function isoDate(value: unknown) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function currency(value: unknown) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : null;
}

function parseList<T>(value: unknown, parser: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parser);
  return parsed.every((entry): entry is T => entry !== null) ? parsed : null;
}

export function parseMoneyMinor(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parsePayoutCurrency(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function parseFinanceResourceId(kind: FinanceResourceKind, value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return RESOURCE_PATTERNS[kind].test(normalized) ? normalized : null;
}

export function parseFinanceIdempotencyKey(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 8 && normalized.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)
    ? normalized
    : null;
}

export function parseStatementDate(value: unknown) {
  return isoDate(value);
}

export function parseFinanceMonthStart(value: unknown) {
  const normalized = isoDate(value);
  return normalized?.endsWith("-01") ? normalized : null;
}

export function parseParticipantHandle(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return HANDLE.test(normalized) ? normalized : null;
}

export function parseFinanceHoldKind(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return HOLD_KINDS.has(normalized as FinancePayoutQueue["holds"][number]["kind"])
    ? normalized as FinancePayoutQueue["holds"][number]["kind"]
    : null;
}

export function parseFinanceReason(value: unknown) {
  const normalized = boundedText(value, 1000);
  return normalized && normalized.length >= 3 ? normalized : null;
}

export function parseMyPayouts(value: unknown): MyPayout[] {
  const parsed = parseList(value, (entry) => {
    const item = object(entry);
    if (!item || !onlyKeys(item, ["publicId", "projectPublicId", "projectTitle", "amountMinor", "currency", "state", "attemptCount", "createdAt", "paidAt"])) return null;
    const publicId = typeof item.publicId === "string" && PAYOUT_ID.test(item.publicId) ? item.publicId : null;
    const projectPublicId = typeof item.projectPublicId === "string" && PROJECT_ID.test(item.projectPublicId) ? item.projectPublicId : null;
    const projectTitle = boundedText(item.projectTitle, 180);
    const amountMinor = positiveMinor(item.amountMinor), currencyValue = currency(item.currency);
    const state = typeof item.state === "string" && MY_PAYOUT_STATES.has(item.state as MyPayout["state"]) ? item.state as MyPayout["state"] : null;
    const attemptCount = positiveMinor(item.attemptCount), createdAt = timestamp(item.createdAt);
    const paidAt = item.paidAt === null ? null : timestamp(item.paidAt);
    return publicId && projectPublicId && projectTitle && amountMinor && currencyValue && state && attemptCount && createdAt && paidAt !== null ||
      publicId && projectPublicId && projectTitle && amountMinor && currencyValue && state && attemptCount && createdAt && item.paidAt === null
      ? { publicId, projectPublicId, projectTitle, amountMinor, currency: currencyValue, state, attemptCount, createdAt, paidAt: item.paidAt === null ? null : paidAt as string }
      : null;
  });
  return parsed ?? [];
}

export function parseEarnings(value: unknown): EarningsRow[] {
  const parsed = parseList(value, (entry) => {
    const row = object(entry);
    if (!row || !onlyKeys(row, ["projectPublicId", "projectTitle", "currency", "restrictedMinor", "availableMinor", "pendingPayoutMinor", "paidMinor", "openHoldMinor", "payoutEligible"])) return null;
    const projectPublicId = typeof row.projectPublicId === "string" && PROJECT_ID.test(row.projectPublicId) ? row.projectPublicId : null;
    const projectTitle = boundedText(row.projectTitle, 180);
    const currencyValue = currency(row.currency);
    const restrictedMinor = nonNegativeMinor(row.restrictedMinor), availableMinor = nonNegativeMinor(row.availableMinor);
    const pendingPayoutMinor = nonNegativeMinor(row.pendingPayoutMinor), paidMinor = nonNegativeMinor(row.paidMinor), openHoldMinor = nonNegativeMinor(row.openHoldMinor);
    if (!projectPublicId || !projectTitle || !currencyValue || restrictedMinor === null || availableMinor === null || pendingPayoutMinor === null || paidMinor === null || openHoldMinor === null || typeof row.payoutEligible !== "boolean") return null;
    return { projectPublicId, projectTitle, currency: currencyValue, restrictedMinor, availableMinor, pendingPayoutMinor, paidMinor, openHoldMinor, payoutEligible: row.payoutEligible };
  });
  return parsed ?? [];
}

export function parseEarningsStatement(value: unknown): EarningsStatement | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["projectPublicId", "from", "to", "entries"])) return null;
  const projectPublicId = typeof row.projectPublicId === "string" && PROJECT_ID.test(row.projectPublicId) ? row.projectPublicId : null;
  const from = isoDate(row.from), to = isoDate(row.to);
  const entries = parseList(row.entries, (entry) => {
    const item = object(entry);
    if (!item || !onlyKeys(item, ["journalPublicId", "kind", "currency", "account", "side", "amountMinor", "occurredAt"])) return null;
    const journalPublicId = typeof item.journalPublicId === "string" && JOURNAL_ID.test(item.journalPublicId) ? item.journalPublicId : null;
    const kind = typeof item.kind === "string" && JOURNAL_KINDS.has(item.kind) ? item.kind : null;
    const currencyValue = currency(item.currency);
    const account = typeof item.account === "string" && ACCOUNT_CODES.has(item.account) ? item.account : null;
    const side = item.side === "debit" ? "debit" as const : item.side === "credit" ? "credit" as const : null;
    const amountMinor = positiveMinor(item.amountMinor), occurredAt = timestamp(item.occurredAt);
    return journalPublicId && kind && currencyValue && account && side && amountMinor && occurredAt
      ? { journalPublicId, kind, currency: currencyValue, account, side, amountMinor, occurredAt }
      : null;
  });
  return projectPublicId && from && to && entries ? { projectPublicId, from, to, entries } : null;
}

export function parseFinancePayoutQueue(value: unknown): FinancePayoutQueue | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["payouts", "holds", "reconciliationCases"])) return null;
  const payouts = parseList(row.payouts, (entry) => {
    const item = object(entry);
    if (!item || !onlyKeys(item, ["publicId", "projectPublicId", "participantHandle", "amountMinor", "currency", "state", "attemptCount", "batchPublicId", "createdAt"])) return null;
    const publicId = typeof item.publicId === "string" && PAYOUT_ID.test(item.publicId) ? item.publicId : null;
    const projectPublicId = typeof item.projectPublicId === "string" && PROJECT_ID.test(item.projectPublicId) ? item.projectPublicId : null;
    const participantHandle = typeof item.participantHandle === "string" && HANDLE.test(item.participantHandle) ? item.participantHandle : null;
    const amountMinor = positiveMinor(item.amountMinor), currencyValue = currency(item.currency);
    const state = typeof item.state === "string" && PAYOUT_STATES.has(item.state as "requested" | "processing" | "failed") ? item.state as "requested" | "processing" | "failed" : null;
    const attemptCount = nonNegativeMinor(item.attemptCount);
    const batchPublicId = item.batchPublicId === null ? null : typeof item.batchPublicId === "string" && BATCH_ID.test(item.batchPublicId) ? item.batchPublicId : undefined;
    const createdAt = timestamp(item.createdAt);
    return publicId && projectPublicId && participantHandle && amountMinor && currencyValue && state && attemptCount !== null && batchPublicId !== undefined && createdAt
      ? { publicId, projectPublicId, participantHandle, amountMinor, currency: currencyValue, state, attemptCount, batchPublicId, createdAt }
      : null;
  });
  const holds = parseList(row.holds, (entry) => {
    const item = object(entry);
    if (!item || !onlyKeys(item, ["publicId", "projectPublicId", "participantHandle", "kind", "amountMinor", "currency", "state", "reason", "createdAt"])) return null;
    const publicId = typeof item.publicId === "string" && HOLD_ID.test(item.publicId) ? item.publicId : null;
    const projectPublicId = typeof item.projectPublicId === "string" && PROJECT_ID.test(item.projectPublicId) ? item.projectPublicId : null;
    const participantHandle = typeof item.participantHandle === "string" && HANDLE.test(item.participantHandle) ? item.participantHandle : null;
    const kind = typeof item.kind === "string" && HOLD_KINDS.has(item.kind as FinancePayoutQueue["holds"][number]["kind"]) ? item.kind as FinancePayoutQueue["holds"][number]["kind"] : null;
    const amountMinor = positiveMinor(item.amountMinor), currencyValue = currency(item.currency), reason = boundedText(item.reason, 1000), createdAt = timestamp(item.createdAt);
    return publicId && projectPublicId && participantHandle && kind && amountMinor && currencyValue && item.state === "open" && reason && createdAt
      ? { publicId, projectPublicId, participantHandle, kind, amountMinor, currency: currencyValue, state: "open" as const, reason, createdAt }
      : null;
  });
  const reconciliationCases = parseList(row.reconciliationCases, (entry) => {
    const item = object(entry);
    if (!item || !onlyKeys(item, ["publicId", "projectPublicId", "payoutPublicId", "kind", "expectedMinor", "observedMinor", "currency", "state", "note", "createdAt"])) return null;
    const publicId = typeof item.publicId === "string" && FINANCE_CASE_ID.test(item.publicId) ? item.publicId : null;
    const projectPublicId = typeof item.projectPublicId === "string" && PROJECT_ID.test(item.projectPublicId) ? item.projectPublicId : null;
    const payoutPublicId = item.payoutPublicId === null ? null : typeof item.payoutPublicId === "string" && PAYOUT_ID.test(item.payoutPublicId) ? item.payoutPublicId : undefined;
    const kind = boundedText(item.kind, 64), currencyValue = currency(item.currency), createdAt = timestamp(item.createdAt);
    const expectedMinor = item.expectedMinor === null ? null : nonNegativeMinor(item.expectedMinor);
    const observedMinor = item.observedMinor === null ? null : nonNegativeMinor(item.observedMinor);
    const note = item.note === null ? null : boundedText(item.note, 1000);
    if (!publicId || !projectPublicId || payoutPublicId === undefined || !kind || expectedMinor === null && item.expectedMinor !== null || observedMinor === null && item.observedMinor !== null || !currencyValue || item.state !== "open" || note === null && item.note !== null || !createdAt) return null;
    return { publicId, projectPublicId, payoutPublicId, kind, expectedMinor, observedMinor, currency: currencyValue, state: "open" as const, note, createdAt };
  });
  return payouts && holds && reconciliationCases ? { payouts, holds, reconciliationCases } : null;
}
