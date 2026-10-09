import { validateHandle } from "../profile/policy";

export type AgencyVerificationStatus = "pending" | "approved" | "rejected" | "revoked";
export type AgencyStaffRole = "owner" | "manager" | "agent" | "finance" | "viewer";
export type AgencyRepresentationStatus = "proposed" | "accepted" | "declined" | "revocation_pending" | "revoked";

export type AgencyScopes = {
  communications: boolean;
  opportunities: boolean;
  negotiations: boolean;
  projectAdmin: boolean;
  contractAdmin: boolean;
  earningsVisibility: boolean;
};

export type AgencyRepresentationTerms = AgencyScopes & {
  commissionBasisPoints: number;
  revocationNoticeDays: number;
};

export type AgencyActivity = {
  publicId: string;
  eventType: "proposed" | "accepted" | "declined" | "revocation_requested" | "revoked" | "opportunity_created" | "negotiation_updated" | "project_authority_changed";
  details: Record<string, unknown>;
  createdAt: string;
};

export type AgencyWorkspace = {
  agency: {
    publicId: string;
    displayName: string;
    jurisdictionCode: string;
    verificationStatus: AgencyVerificationStatus;
    staffRole: AgencyStaffRole;
  };
  staff: Array<{ handle: string; staffRole: AgencyStaffRole; active: boolean }>;
  representations: Array<{
    publicId: string;
    performerHandle: string;
    status: AgencyRepresentationStatus;
    scopes: AgencyScopes;
    commissionBasisPoints: number;
    revocationNoticeDays: number;
    acceptedAt: string | null;
    revocationEffectiveAt: string | null;
    activity: AgencyActivity[];
  }>;
  opportunities: Array<{
    publicId: string;
    agreementPublicId: string;
    performerHandle: string;
    title: string;
    summary: string;
    status: "open" | "negotiating" | "won" | "lost" | "withdrawn";
    createdAt: string;
    updatedAt: string;
    negotiationHistory: Array<{
      publicId: string;
      stage: "proposed" | "countered" | "accepted" | "declined" | "closed";
      note: string;
      createdAt: string;
    }>;
  }>;
};

export type PerformerAgencyRepresentation = {
  publicId: string;
  agencyPublicId: string;
  agencyName: string;
  agencyVerificationStatus: AgencyVerificationStatus;
  status: AgencyRepresentationStatus;
  scopes: AgencyScopes;
  commissionBasisPoints: number;
  revocationNoticeDays: number;
  termsHash: string;
  proposedAt: string;
  acceptedAt: string | null;
  revocationEffectiveAt: string | null;
  activity: AgencyActivity[];
};

export type AgencyEarningsStatement = {
  projectPublicId: string;
  projectTitle: string;
  currency: string;
  balanceMinor: number;
  commissionBasisPoints: number;
};

export type AgencyVerificationQueueRow = {
  agencyPublicId: string;
  displayName: string;
  jurisdictionCode: string;
  verificationStatus: AgencyVerificationStatus;
  verificationProvider: string | null;
  verificationReason: string | null;
  updatedAt: string;
};

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const AGENCY_ID = /^agy[0-9a-f]{24}$/;
const AGREEMENT_ID = /^agr[0-9a-f]{24}$/;
const ACTIVITY_ID = /^are[0-9a-f]{24}$/;
const OPPORTUNITY_ID = /^opp[0-9a-f]{24}$/;
const NEGOTIATION_ID = /^neg[0-9a-f]{24}$/;
const PROJECT_ID = /^prj[0-9a-f]{24}$/;
const SHA256 = /^[0-9a-f]{64}$/;

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

function timestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function nullableTimestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  return timestamp(value) ?? undefined;
}

function handle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return validateHandle(normalized) === null ? normalized : null;
}

function integer(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function verificationStatus(value: unknown): AgencyVerificationStatus | null {
  return value === "pending" || value === "approved" || value === "rejected" || value === "revoked" ? value : null;
}

function representationStatus(value: unknown): AgencyRepresentationStatus | null {
  return value === "proposed" || value === "accepted" || value === "declined" || value === "revocation_pending" || value === "revoked" ? value : null;
}

function staffRole(value: unknown): AgencyStaffRole | null {
  return value === "owner" || value === "manager" || value === "agent" || value === "finance" || value === "viewer" ? value : null;
}

function parseScopes(value: unknown): AgencyScopes | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["communications", "opportunities", "negotiations", "projectAdmin", "contractAdmin", "earningsVisibility"])) return null;
  if (typeof row.communications !== "boolean" || typeof row.opportunities !== "boolean" || typeof row.negotiations !== "boolean"
    || typeof row.projectAdmin !== "boolean" || typeof row.contractAdmin !== "boolean" || typeof row.earningsVisibility !== "boolean") return null;
  return {
    communications: row.communications,
    opportunities: row.opportunities,
    negotiations: row.negotiations,
    projectAdmin: row.projectAdmin,
    contractAdmin: row.contractAdmin,
    earningsVisibility: row.earningsVisibility,
  };
}

export function parseAgencyProfileInput(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["displayName", "jurisdictionCode"])) return null;
  const displayName = boundedText(row.displayName, 2, 120);
  const jurisdictionCode = typeof row.jurisdictionCode === "string" ? row.jurisdictionCode.trim().toUpperCase() : "";
  if (!displayName || !/^[A-Z]{2}$/.test(jurisdictionCode)) return null;
  return { displayName, jurisdictionCode };
}

export function parseAgencyVerificationSubmission(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["agencyPublicId", "provider", "evidenceReference"])) return null;
  const agencyPublicId = typeof row.agencyPublicId === "string" && AGENCY_ID.test(row.agencyPublicId.trim()) ? row.agencyPublicId.trim() : null;
  const provider = typeof row.provider === "string" ? row.provider.trim().toLowerCase() : "";
  const evidenceReference = boundedText(row.evidenceReference, 8, 220);
  if (!agencyPublicId || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(provider) || !evidenceReference) return null;
  return { agencyPublicId, provider, evidenceReference };
}

export function parseAgencyVerificationReview(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["agencyPublicId", "decision", "reason"])) return null;
  const agencyPublicId = typeof row.agencyPublicId === "string" && AGENCY_ID.test(row.agencyPublicId.trim()) ? row.agencyPublicId.trim() : null;
  const decision = row.decision === "approved" || row.decision === "rejected" || row.decision === "revoked" ? row.decision : null;
  const reason = boundedText(row.reason, 3, 500);
  return agencyPublicId && decision && reason ? { agencyPublicId, decision, reason } : null;
}

export function parseAgencyRepresentationTerms(value: unknown): AgencyRepresentationTerms | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["communications", "opportunities", "negotiations", "projectAdmin", "contractAdmin", "earningsVisibility", "commissionBasisPoints", "revocationNoticeDays"])) return null;
  const scopes = parseScopes({
    communications: row.communications,
    opportunities: row.opportunities,
    negotiations: row.negotiations,
    projectAdmin: row.projectAdmin,
    contractAdmin: row.contractAdmin,
    earningsVisibility: row.earningsVisibility,
  });
  const commissionBasisPoints = integer(row.commissionBasisPoints, 0, 5000);
  const revocationNoticeDays = integer(row.revocationNoticeDays, 0, 90);
  if (!scopes || commissionBasisPoints === null || revocationNoticeDays === null) return null;
  if (!Object.values(scopes).some(Boolean) || (commissionBasisPoints > 0 && !scopes.earningsVisibility)) return null;
  return { ...scopes, commissionBasisPoints, revocationNoticeDays };
}

export function parseAgencyRepresentationInvite(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["performerHandle", "terms"])) return null;
  const performerHandle = handle(row.performerHandle);
  const terms = parseAgencyRepresentationTerms(row.terms);
  return performerHandle && terms ? { performerHandle, terms } : null;
}

export function parseAgencyStaffMutation(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["handle", "staffRole", "reason", "enabled"])) return null;
  const normalizedHandle = handle(row.handle);
  const role = row.staffRole === "manager" || row.staffRole === "agent" || row.staffRole === "finance" || row.staffRole === "viewer" ? row.staffRole : null;
  const reason = boundedText(row.reason, 3, 500);
  if (!normalizedHandle || !role || !reason || typeof row.enabled !== "boolean") return null;
  return { handle: normalizedHandle, staffRole: role, reason, enabled: row.enabled };
}

export function parseAgencyOpportunityInput(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["agreementPublicId", "title", "summary"])) return null;
  const agreementPublicId = typeof row.agreementPublicId === "string" && AGREEMENT_ID.test(row.agreementPublicId.trim()) ? row.agreementPublicId.trim() : null;
  const title = boundedText(row.title, 3, 120);
  const summary = boundedText(row.summary, 10, 1200);
  return agreementPublicId && title && summary ? { agreementPublicId, title, summary } : null;
}

export function parseAgencyNegotiationInput(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["opportunityPublicId", "stage", "note"])) return null;
  const opportunityPublicId = typeof row.opportunityPublicId === "string" && OPPORTUNITY_ID.test(row.opportunityPublicId.trim()) ? row.opportunityPublicId.trim() : null;
  const stage = row.stage === "proposed" || row.stage === "countered" || row.stage === "accepted" || row.stage === "declined" || row.stage === "closed" ? row.stage : null;
  const note = boundedText(row.note, 3, 1200);
  return opportunityPublicId && stage && note ? { opportunityPublicId, stage, note } : null;
}

export function parseAgencyRepresentationDecision(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["agreementPublicId", "decision"])) return null;
  const agreementPublicId = typeof row.agreementPublicId === "string" && AGREEMENT_ID.test(row.agreementPublicId.trim()) ? row.agreementPublicId.trim() : null;
  const decision = row.decision === "accept" || row.decision === "decline" ? row.decision : null;
  return agreementPublicId && decision ? { agreementPublicId, decision } : null;
}

export function parseAgencyRepresentationRevocation(value: unknown) {
  const row = object(value);
  if (!row || !onlyKeys(row, ["agreementPublicId", "reason"])) return null;
  const agreementPublicId = typeof row.agreementPublicId === "string" && AGREEMENT_ID.test(row.agreementPublicId.trim()) ? row.agreementPublicId.trim() : null;
  const reason = boundedText(row.reason, 3, 500);
  return agreementPublicId && reason ? { agreementPublicId, reason } : null;
}

function parseActivityDetails(eventType: AgencyActivity["eventType"], value: unknown): Record<string, unknown> | null {
  const row = object(value);
  if (!row) return null;
  if (eventType === "proposed") return parseAgencyRepresentationTerms(row);
  if (eventType === "accepted") return onlyKeys(row, ["termsHash"]) && typeof row.termsHash === "string" && SHA256.test(row.termsHash) ? { termsHash: row.termsHash } : null;
  if (eventType === "declined") return Object.keys(row).length === 0 ? {} : null;
  if (eventType === "revocation_requested" || eventType === "revoked") {
    if (!onlyKeys(row, ["reason", "effectiveAt", "noticeDays"])) return null;
    const reason = boundedText(row.reason, 3, 500);
    const effectiveAt = timestamp(row.effectiveAt);
    const noticeDays = row.noticeDays === undefined ? undefined : integer(row.noticeDays, 0, 90);
    if (!reason || !effectiveAt || noticeDays === null) return null;
    return noticeDays === undefined ? { reason, effectiveAt } : { reason, effectiveAt, noticeDays };
  }
  if (eventType === "opportunity_created") {
    if (!onlyKeys(row, ["opportunityPublicId", "title"])) return null;
    const opportunityPublicId = typeof row.opportunityPublicId === "string" && OPPORTUNITY_ID.test(row.opportunityPublicId) ? row.opportunityPublicId : null;
    const title = boundedText(row.title, 3, 120);
    return opportunityPublicId && title ? { opportunityPublicId, title } : null;
  }
  if (eventType === "negotiation_updated") {
    if (!onlyKeys(row, ["opportunityPublicId", "stage"])) return null;
    const opportunityPublicId = typeof row.opportunityPublicId === "string" && OPPORTUNITY_ID.test(row.opportunityPublicId) ? row.opportunityPublicId : null;
    const stage = row.stage === "proposed" || row.stage === "countered" || row.stage === "accepted" || row.stage === "declined" || row.stage === "closed" ? row.stage : null;
    return opportunityPublicId && stage ? { opportunityPublicId, stage } : null;
  }
  if (!onlyKeys(row, ["projectPublicId", "enabled"])) return null;
  const projectPublicId = typeof row.projectPublicId === "string" && PROJECT_ID.test(row.projectPublicId) ? row.projectPublicId : null;
  return projectPublicId && typeof row.enabled === "boolean" ? { projectPublicId, enabled: row.enabled } : null;
}

function parseActivity(value: unknown): AgencyActivity | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["publicId", "eventType", "details", "createdAt"])) return null;
  const publicId = typeof row.publicId === "string" && ACTIVITY_ID.test(row.publicId) ? row.publicId : null;
  const eventTypes: AgencyActivity["eventType"][] = ["proposed", "accepted", "declined", "revocation_requested", "revoked", "opportunity_created", "negotiation_updated", "project_authority_changed"];
  const eventType = typeof row.eventType === "string" && eventTypes.includes(row.eventType as AgencyActivity["eventType"]) ? row.eventType as AgencyActivity["eventType"] : null;
  const createdAt = timestamp(row.createdAt);
  const details = eventType ? parseActivityDetails(eventType, row.details) : null;
  return publicId && eventType && details && createdAt ? { publicId, eventType, details, createdAt } : null;
}

function parseActivityList(value: unknown): AgencyActivity[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const rows = value.map(parseActivity);
  return rows.every((row): row is AgencyActivity => row !== null) ? rows : null;
}

export function parseAgencyWorkspace(value: unknown): AgencyWorkspace | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["agency", "staff", "representations", "opportunities"])) return null;
  const agency = object(row.agency);
  if (!agency || !onlyKeys(agency, ["publicId", "displayName", "jurisdictionCode", "verificationStatus", "staffRole"])) return null;
  const agencyPublicId = typeof agency.publicId === "string" && AGENCY_ID.test(agency.publicId) ? agency.publicId : null;
  const displayName = boundedText(agency.displayName, 2, 120);
  const jurisdictionCode = typeof agency.jurisdictionCode === "string" && /^[A-Z]{2}$/.test(agency.jurisdictionCode) ? agency.jurisdictionCode : null;
  const agencyVerificationStatus = verificationStatus(agency.verificationStatus);
  const actorStaffRole = staffRole(agency.staffRole);
  if (!agencyPublicId || !displayName || !jurisdictionCode || !agencyVerificationStatus || !actorStaffRole) return null;

  if (!Array.isArray(row.staff) || row.staff.length > 250) return null;
  const staff = row.staff.map((value) => {
    const item = object(value);
    if (!item || !onlyKeys(item, ["handle", "staffRole", "active"])) return null;
    const itemHandle = handle(item.handle);
    const itemRole = staffRole(item.staffRole);
    return itemHandle && itemRole && typeof item.active === "boolean" ? { handle: itemHandle, staffRole: itemRole, active: item.active } : null;
  });
  if (!staff.every((item): item is NonNullable<typeof item> => item !== null)) return null;

  if (!Array.isArray(row.representations) || row.representations.length > 1000) return null;
  const representations = row.representations.map((value) => {
    const item = object(value);
    if (!item || !onlyKeys(item, ["publicId", "performerHandle", "status", "scopes", "commissionBasisPoints", "revocationNoticeDays", "acceptedAt", "revocationEffectiveAt", "activity"])) return null;
    const publicId = typeof item.publicId === "string" && AGREEMENT_ID.test(item.publicId) ? item.publicId : null;
    const performerHandle = handle(item.performerHandle);
    const status = representationStatus(item.status);
    const itemScopes = parseScopes(item.scopes);
    const commissionBasisPoints = integer(item.commissionBasisPoints, 0, 5000);
    const revocationNoticeDays = integer(item.revocationNoticeDays, 0, 90);
    const acceptedAt = nullableTimestamp(item.acceptedAt);
    const revocationEffectiveAt = nullableTimestamp(item.revocationEffectiveAt);
    const activity = parseActivityList(item.activity);
    if (!publicId || !performerHandle || !status || !itemScopes || commissionBasisPoints === null || revocationNoticeDays === null || acceptedAt === undefined || revocationEffectiveAt === undefined || !activity) return null;
    return { publicId, performerHandle, status, scopes: itemScopes, commissionBasisPoints, revocationNoticeDays, acceptedAt, revocationEffectiveAt, activity };
  });
  if (!representations.every((item): item is NonNullable<typeof item> => item !== null)) return null;

  if (!Array.isArray(row.opportunities) || row.opportunities.length > 2000) return null;
  const opportunities = row.opportunities.map((value) => {
    const item = object(value);
    if (!item || !onlyKeys(item, ["publicId", "agreementPublicId", "performerHandle", "title", "summary", "status", "createdAt", "updatedAt", "negotiationHistory"])) return null;
    const publicId = typeof item.publicId === "string" && OPPORTUNITY_ID.test(item.publicId) ? item.publicId : null;
    const agreementPublicId = typeof item.agreementPublicId === "string" && AGREEMENT_ID.test(item.agreementPublicId) ? item.agreementPublicId : null;
    const performerHandle = handle(item.performerHandle);
    const title = boundedText(item.title, 3, 120);
    const summary = boundedText(item.summary, 10, 1200);
    const statuses = ["open", "negotiating", "won", "lost", "withdrawn"] as const;
    const status = typeof item.status === "string" && statuses.includes(item.status as typeof statuses[number]) ? item.status as typeof statuses[number] : null;
    const createdAt = timestamp(item.createdAt);
    const updatedAt = timestamp(item.updatedAt);
    if (!Array.isArray(item.negotiationHistory) || item.negotiationHistory.length > 1000) return null;
    const negotiationHistory = item.negotiationHistory.map((historyValue) => {
      const history = object(historyValue);
      if (!history || !onlyKeys(history, ["publicId", "stage", "note", "createdAt"])) return null;
      const historyPublicId = typeof history.publicId === "string" && NEGOTIATION_ID.test(history.publicId) ? history.publicId : null;
      const stages = ["proposed", "countered", "accepted", "declined", "closed"] as const;
      const stage = typeof history.stage === "string" && stages.includes(history.stage as typeof stages[number]) ? history.stage as typeof stages[number] : null;
      const note = boundedText(history.note, 3, 1200);
      const historyCreatedAt = timestamp(history.createdAt);
      return historyPublicId && stage && note && historyCreatedAt ? { publicId: historyPublicId, stage, note, createdAt: historyCreatedAt } : null;
    });
    if (!publicId || !agreementPublicId || !performerHandle || !title || !summary || !status || !createdAt || !updatedAt || !negotiationHistory.every((history): history is NonNullable<typeof history> => history !== null)) return null;
    return { publicId, agreementPublicId, performerHandle, title, summary, status, createdAt, updatedAt, negotiationHistory };
  });
  if (!opportunities.every((item): item is NonNullable<typeof item> => item !== null)) return null;

  return {
    agency: { publicId: agencyPublicId, displayName, jurisdictionCode, verificationStatus: agencyVerificationStatus, staffRole: actorStaffRole },
    staff,
    representations,
    opportunities,
  };
}

function parsePerformerRepresentation(value: unknown): PerformerAgencyRepresentation | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["publicId", "agencyPublicId", "agencyName", "agencyVerificationStatus", "status", "scopes", "commissionBasisPoints", "revocationNoticeDays", "termsHash", "proposedAt", "acceptedAt", "revocationEffectiveAt", "activity"])) return null;
  const publicId = typeof row.publicId === "string" && AGREEMENT_ID.test(row.publicId) ? row.publicId : null;
  const agencyPublicId = typeof row.agencyPublicId === "string" && AGENCY_ID.test(row.agencyPublicId) ? row.agencyPublicId : null;
  const agencyName = boundedText(row.agencyName, 2, 120);
  const agencyVerificationStatus = verificationStatus(row.agencyVerificationStatus);
  const status = representationStatus(row.status);
  const scopes = parseScopes(row.scopes);
  const commissionBasisPoints = integer(row.commissionBasisPoints, 0, 5000);
  const revocationNoticeDays = integer(row.revocationNoticeDays, 0, 90);
  const termsHash = typeof row.termsHash === "string" && SHA256.test(row.termsHash) ? row.termsHash : null;
  const proposedAt = timestamp(row.proposedAt);
  const acceptedAt = nullableTimestamp(row.acceptedAt);
  const revocationEffectiveAt = nullableTimestamp(row.revocationEffectiveAt);
  const activity = parseActivityList(row.activity);
  if (!publicId || !agencyPublicId || !agencyName || !agencyVerificationStatus || !status || !scopes || commissionBasisPoints === null || revocationNoticeDays === null || !termsHash || !proposedAt || acceptedAt === undefined || revocationEffectiveAt === undefined || !activity) return null;
  return { publicId, agencyPublicId, agencyName, agencyVerificationStatus, status, scopes, commissionBasisPoints, revocationNoticeDays, termsHash, proposedAt, acceptedAt, revocationEffectiveAt, activity };
}

export function parseMyAgencyRepresentations(value: unknown): PerformerAgencyRepresentation[] {
  if (!Array.isArray(value) || value.length > 1000) return [];
  return value.map(parsePerformerRepresentation).filter((row): row is PerformerAgencyRepresentation => row !== null);
}

export function parseAgencyEarningsStatements(value: unknown): AgencyEarningsStatement[] {
  if (!Array.isArray(value) || value.length > 5000) return [];
  return value.map((value) => {
    const row = object(value);
    if (!row || !onlyKeys(row, ["projectPublicId", "projectTitle", "currency", "balanceMinor", "commissionBasisPoints"])) return null;
    const projectPublicId = typeof row.projectPublicId === "string" && PROJECT_ID.test(row.projectPublicId) ? row.projectPublicId : null;
    const projectTitle = boundedText(row.projectTitle, 2, 180);
    const currency = typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null;
    const balanceMinor = integer(row.balanceMinor, -9_000_000_000_000_000, 9_000_000_000_000_000);
    const commissionBasisPoints = integer(row.commissionBasisPoints, 0, 5000);
    return projectPublicId && projectTitle && currency && balanceMinor !== null && commissionBasisPoints !== null
      ? { projectPublicId, projectTitle, currency, balanceMinor, commissionBasisPoints }
      : null;
  }).filter((row): row is AgencyEarningsStatement => row !== null);
}

export function parseAgencyVerificationQueue(value: unknown): AgencyVerificationQueueRow[] {
  if (!Array.isArray(value) || value.length > 1000) return [];
  return value.map((value) => {
    const row = object(value);
    if (!row || !onlyKeys(row, ["agencyPublicId", "displayName", "jurisdictionCode", "verificationStatus", "verificationProvider", "verificationReason", "updatedAt"])) return null;
    const agencyPublicId = typeof row.agencyPublicId === "string" && AGENCY_ID.test(row.agencyPublicId) ? row.agencyPublicId : null;
    const displayName = boundedText(row.displayName, 2, 120);
    const jurisdictionCode = typeof row.jurisdictionCode === "string" && /^[A-Z]{2}$/.test(row.jurisdictionCode) ? row.jurisdictionCode : null;
    const status = verificationStatus(row.verificationStatus);
    const verificationProvider = row.verificationProvider === null
      ? null
      : typeof row.verificationProvider === "string" && /^[a-z0-9][a-z0-9._-]{1,63}$/.test(row.verificationProvider)
        ? row.verificationProvider
        : undefined;
    const verificationReason = row.verificationReason === null
      ? null
      : boundedText(row.verificationReason, 3, 500) ?? undefined;
    const updatedAt = timestamp(row.updatedAt);
    if (!agencyPublicId || !displayName || !jurisdictionCode || !status || verificationProvider === undefined || verificationReason === undefined || !updatedAt) return null;
    return {
      agencyPublicId,
      displayName,
      jurisdictionCode,
      verificationStatus: status,
      verificationProvider,
      verificationReason,
      updatedAt,
    };
  }).filter((row): row is AgencyVerificationQueueRow => row !== null);
}
