import type { AppRole } from "@/lib/auth/policy";

export const ADMIN_QUEUE_KEYS = [
  "users",
  "roles",
  "verification",
  "projects",
  "campaigns",
  "moderation",
  "review",
  "copyright",
  "finance",
  "payouts",
  "support",
  "configuration",
  "audit",
  "incidents",
] as const;

export type AdminQueueKey = (typeof ADMIN_QUEUE_KEYS)[number];

const STAFF_QUEUE_ACCESS: Record<Extract<AppRole, "reviewer" | "moderator" | "finance" | "copyright" | "support" | "super_admin">, ReadonlySet<AdminQueueKey>> = {
  reviewer: new Set(["verification", "review"]),
  moderator: new Set(["moderation"]),
  finance: new Set(["finance", "payouts"]),
  copyright: new Set(["copyright"]),
  support: new Set(["users", "support"]),
  super_admin: new Set(ADMIN_QUEUE_KEYS),
};

export const CRITICAL_ADMIN_ACTIONS = [
  "open_incident",
  "resolve_incident",
  "place_legal_hold",
  "release_legal_hold",
  "apply_abuse_hold",
  "release_abuse_hold",
] as const;

export type CriticalAdminAction = (typeof CRITICAL_ADMIN_ACTIONS)[number];

export type CriticalAdminActionInput = {
  action: CriticalAdminAction;
  targetPublicId: string;
  reason: string;
};

const ADMIN_OVERVIEW_KEYS = [
  "users",
  "pendingRoles",
  "verification",
  "projects",
  "campaigns",
  "moderation",
  "review",
  "copyright",
  "finance",
  "payouts",
  "support",
  "incidents",
  "legalHolds",
  "abuseHolds",
] as const;

export type AdminOverview = Record<(typeof ADMIN_OVERVIEW_KEYS)[number], number>;

const ADMIN_QUEUE_ROW_KEYS = new Set([
  "kind",
  "publicId",
  "handle",
  "displayName",
  "visibility",
  "createdAt",
  "role",
  "status",
  "requestedAt",
  "reviewedAt",
  "level",
  "expiresAt",
  "updatedAt",
  "state",
  "title",
  "category",
  "projectPublicId",
  "subjectType",
  "subjectPublicId",
  "summary",
  "deliveryPublicId",
  "stage",
  "noticeStatus",
  "repeatInfringer",
  "caseKind",
  "currency",
  "expectedMinor",
  "observedMinor",
  "amountMinor",
  "attemptCount",
  "requesterHandle",
  "subject",
  "key",
  "revision",
  "eventType",
  "outcome",
  "routeKey",
  "targetRole",
  "actorHandle",
]);

const ADMIN_QUEUE_KINDS = new Set([
  "user",
  "role",
  "verification",
  "project",
  "campaign",
  "moderation",
  "review",
  "copyright",
  "finance",
  "payout",
  "support",
  "configuration",
  "audit",
]);

export type AdminQueueRow = Readonly<Record<string, string | number | boolean | null>>;

export type OperationalSearchResult = {
  kind: string;
  label: string;
  publicId: string | null;
  handle: string | null;
  state: string | null;
  path: string | null;
};

export type OperationalIncident = {
  publicId: string;
  scopeKey: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  state: "open" | "resolved";
  openedAt: string;
  resolvedAt: string | null;
};

export type OperationalHold = {
  publicId: string;
  targetPublicId: string;
  state: "active" | "released";
  reason: string;
  placedAt: string;
  releasedAt: string | null;
};

export type OperationalIncidentProjection = {
  incidents: OperationalIncident[];
  legalHolds: OperationalHold[];
  abuseHolds: OperationalHold[];
};

export type OperationalRateLimit = {
  key: string;
  maxRequests: number;
  windowSeconds: number;
  enabled: boolean;
  revision: number;
  updatedAt: string;
};

export type AuditExplorerRow = {
  eventType: string;
  outcome: string;
  routeKey: string | null;
  targetRole: string | null;
  actorHandle: string | null;
  createdAt: string;
};

export type OperationalRateLimitUpdate = {
  key: string;
  maxRequests: number;
  windowSeconds: number;
  enabled: boolean;
  reason: string;
};

export function isAdminQueueKey(value: unknown): value is AdminQueueKey {
  return typeof value === "string" && ADMIN_QUEUE_KEYS.includes(value as AdminQueueKey);
}

export function staffCanAccessAdminQueue(role: AppRole | null, queue: AdminQueueKey): boolean {
  if (!role || !(role in STAFF_QUEUE_ACCESS)) return false;
  return STAFF_QUEUE_ACCESS[role as keyof typeof STAFF_QUEUE_ACCESS].has(queue);
}

export function parseOperationalSearch(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 120) return null;
  return normalized;
}

export function parseCriticalAdminAction(value: unknown): CriticalAdminActionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const action = record.action;
  const targetPublicId = typeof record.targetPublicId === "string" ? record.targetPublicId.trim() : "";
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";

  if (
    typeof action !== "string"
    || !CRITICAL_ADMIN_ACTIONS.includes(action as CriticalAdminAction)
    || targetPublicId.length < 8
    || targetPublicId.length > 120
    || reason.length < 8
    || reason.length > 1000
    || record.confirmation !== "CONFIRM"
  ) return null;

  return {
    action: action as CriticalAdminAction,
    targetPublicId,
    reason,
  };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeText(value: unknown, max = 1000): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

function nullableText(value: unknown, max = 1000): string | null | undefined {
  if (value === null || value === undefined) return null;
  const parsed = safeText(value, max);
  return parsed ?? undefined;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function safeInternalPath(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > 512 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return undefined;
  return value;
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(record).every((key) => allowed.has(key));
}

export function parseAdminOverview(value: unknown): AdminOverview | null {
  const record = objectRecord(value);
  if (!record || Object.keys(record).length !== ADMIN_OVERVIEW_KEYS.length) return null;
  const result = {} as AdminOverview;
  for (const key of ADMIN_OVERVIEW_KEYS) {
    const parsed = nonNegativeInteger(record[key]);
    if (parsed === null) return null;
    result[key] = parsed;
  }
  return result;
}

export function parseAdminQueueRows(value: unknown): AdminQueueRow[] {
  if (!Array.isArray(value) || value.length > 200) return [];
  const result: AdminQueueRow[] = [];
  for (const candidate of value) {
    const record = objectRecord(candidate);
    if (!record || !hasOnlyKeys(record, ADMIN_QUEUE_ROW_KEYS)) continue;
    const kind = safeText(record.kind, 40);
    if (!kind || !ADMIN_QUEUE_KINDS.has(kind)) continue;
    const normalized: Record<string, string | number | boolean | null> = { kind };
    let invalid = false;
    for (const [key, raw] of Object.entries(record)) {
      if (key === "kind") continue;
      if (raw === null) {
        normalized[key] = null;
      } else if (typeof raw === "boolean") {
        normalized[key] = raw;
      } else if (typeof raw === "number" && Number.isSafeInteger(raw)) {
        normalized[key] = raw;
      } else if (typeof raw === "string" && raw.length <= 1000 && !/[\u0000-\u001f\u007f]/.test(raw)) {
        normalized[key] = raw;
      } else {
        invalid = true;
        break;
      }
    }
    if (!invalid) result.push(normalized);
  }
  return result;
}

export function parseOperationalSearchResults(value: unknown): OperationalSearchResult[] {
  if (!Array.isArray(value) || value.length > 200) return [];
  const results: OperationalSearchResult[] = [];
  const allowed = new Set(["kind", "label", "publicId", "handle", "state", "path"]);
  for (const candidate of value) {
    const record = objectRecord(candidate);
    if (!record || !hasOnlyKeys(record, allowed)) continue;
    const kind = safeText(record.kind, 40);
    const label = safeText(record.label, 500);
    const publicId = nullableText(record.publicId, 120);
    const handle = nullableText(record.handle, 30);
    const state = nullableText(record.state, 80);
    const path = safeInternalPath(record.path);
    if (!kind || !label || publicId === undefined || handle === undefined || state === undefined || path === undefined) continue;
    results.push({ kind, label, publicId, handle, state, path });
  }
  return results;
}

function parseIncidentList(value: unknown): OperationalIncident[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const allowed = new Set(["publicId", "scopeKey", "severity", "summary", "state", "openedAt", "resolvedAt"]);
  const result: OperationalIncident[] = [];
  for (const candidate of value) {
    const record = objectRecord(candidate);
    if (!record || !hasOnlyKeys(record, allowed)) return null;
    const publicId = safeText(record.publicId, 120);
    const scopeKey = safeText(record.scopeKey, 120);
    const severity = safeText(record.severity, 20);
    const summary = safeText(record.summary, 1000);
    const state = safeText(record.state, 20);
    const openedAt = safeText(record.openedAt, 64);
    const resolvedAt = nullableText(record.resolvedAt, 64);
    if (!publicId || !scopeKey || !summary || !openedAt || resolvedAt === undefined
      || !severity || !["low", "medium", "high", "critical"].includes(severity)
      || !state || !["open", "resolved"].includes(state)) return null;
    result.push({
      publicId,
      scopeKey,
      severity: severity as OperationalIncident["severity"],
      summary,
      state: state as OperationalIncident["state"],
      openedAt,
      resolvedAt,
    });
  }
  return result;
}

function parseHoldList(value: unknown): OperationalHold[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const allowed = new Set(["publicId", "targetPublicId", "state", "reason", "placedAt", "releasedAt"]);
  const result: OperationalHold[] = [];
  for (const candidate of value) {
    const record = objectRecord(candidate);
    if (!record || !hasOnlyKeys(record, allowed)) return null;
    const publicId = safeText(record.publicId, 120);
    const targetPublicId = safeText(record.targetPublicId, 120);
    const reason = safeText(record.reason, 1000);
    const state = safeText(record.state, 20);
    const placedAt = safeText(record.placedAt, 64);
    const releasedAt = nullableText(record.releasedAt, 64);
    if (!publicId || !targetPublicId || !reason || !placedAt || releasedAt === undefined || !state || !["active", "released"].includes(state)) return null;
    result.push({ publicId, targetPublicId, reason, state: state as OperationalHold["state"], placedAt, releasedAt });
  }
  return result;
}

export function parseOperationalIncidents(value: unknown): OperationalIncidentProjection | null {
  const record = objectRecord(value);
  if (!record || !hasOnlyKeys(record, new Set(["incidents", "legalHolds", "abuseHolds"]))) return null;
  const incidents = parseIncidentList(record.incidents);
  const legalHolds = parseHoldList(record.legalHolds);
  const abuseHolds = parseHoldList(record.abuseHolds);
  if (!incidents || !legalHolds || !abuseHolds) return null;
  return { incidents, legalHolds, abuseHolds };
}

export function parseOperationalRateLimits(value: unknown): OperationalRateLimit[] {
  if (!Array.isArray(value) || value.length > 100) return [];
  const allowed = new Set(["key", "maxRequests", "windowSeconds", "enabled", "revision", "updatedAt"]);
  const result: OperationalRateLimit[] = [];
  for (const candidate of value) {
    const record = objectRecord(candidate);
    if (!record || !hasOnlyKeys(record, allowed)) continue;
    const key = safeText(record.key, 64);
    const maxRequests = positiveInteger(record.maxRequests);
    const windowSeconds = positiveInteger(record.windowSeconds);
    const revision = positiveInteger(record.revision);
    const updatedAt = safeText(record.updatedAt, 64);
    if (!key || !maxRequests || maxRequests > 10000 || !windowSeconds || windowSeconds > 86400 || !revision || !updatedAt || typeof record.enabled !== "boolean") continue;
    result.push({ key, maxRequests, windowSeconds, enabled: record.enabled, revision, updatedAt });
  }
  return result;
}

export function parseAuditExplorerRows(value: unknown): AuditExplorerRow[] {
  if (!Array.isArray(value) || value.length > 200) return [];
  const allowed = new Set(["eventType", "outcome", "routeKey", "targetRole", "actorHandle", "createdAt"]);
  const result: AuditExplorerRow[] = [];
  for (const candidate of value) {
    const record = objectRecord(candidate);
    if (!record || !hasOnlyKeys(record, allowed)) continue;
    const eventType = safeText(record.eventType, 120);
    const outcome = safeText(record.outcome, 40);
    const routeKey = nullableText(record.routeKey, 160);
    const targetRole = nullableText(record.targetRole, 40);
    const actorHandle = nullableText(record.actorHandle, 30);
    const createdAt = safeText(record.createdAt, 64);
    if (!eventType || !outcome || routeKey === undefined || targetRole === undefined || actorHandle === undefined || !createdAt) continue;
    result.push({ eventType, outcome, routeKey, targetRole, actorHandle, createdAt });
  }
  return result;
}

export function parseOperationalRateLimitUpdate(value: unknown): OperationalRateLimitUpdate | null {
  const record = objectRecord(value);
  if (!record) return null;
  const key = typeof record.key === "string" ? record.key.trim().toLowerCase() : "";
  const maxRequests = typeof record.maxRequests === "string" ? Number(record.maxRequests) : record.maxRequests;
  const windowSeconds = typeof record.windowSeconds === "string" ? Number(record.windowSeconds) : record.windowSeconds;
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  const enabled = record.enabled === true || record.enabled === "true";
  const disabled = record.enabled === false || record.enabled === "false";

  if (
    !/^[a-z][a-z0-9_.:-]{2,63}$/.test(key)
    || !Number.isSafeInteger(maxRequests) || Number(maxRequests) < 1 || Number(maxRequests) > 10000
    || !Number.isSafeInteger(windowSeconds) || Number(windowSeconds) < 1 || Number(windowSeconds) > 86400
    || (!enabled && !disabled)
    || reason.length < 8 || reason.length > 1000 || /[\u0000-\u001f\u007f]/.test(reason)
    || record.confirmation !== "CONFIRM"
  ) return null;

  return {
    key,
    maxRequests: Number(maxRequests),
    windowSeconds: Number(windowSeconds),
    enabled,
    reason,
  };
}
