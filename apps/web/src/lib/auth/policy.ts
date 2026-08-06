export const APP_ROLES = [
  "fan",
  "creator",
  "agency",
  "reviewer",
  "moderator",
  "finance",
  "copyright",
  "support",
  "super_admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type MembershipStatus = "requested" | "approved" | "rejected" | "revoked";
export type AgeAssuranceMode = "self_attestation" | "provider_required";
export type AgeAssuranceMethod = "self_attestation" | "provider";
export type AgeAssuranceStatus = "accepted" | "rejected" | "revoked" | "expired";

export type WorkspaceMembership = {
  id: string;
  role: AppRole;
  status: MembershipStatus;
  requestedAt: string;
  reviewedAt: string | null;
};

export type ViewerAgeAssurance = {
  method: AgeAssuranceMethod;
  status: AgeAssuranceStatus;
  jurisdictionCode: string;
  policyVersion: string;
  assuredAt: string;
  expiresAt: string | null;
};

export type ViewerContext = {
  userId: string;
  emailVerified: boolean;
  sessionValid: boolean;
  activeRole: AppRole | null;
  ageAssurance: ViewerAgeAssurance | null;
  memberships: WorkspaceMembership[];
};

export type AuthActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"email" | "password" | "jurisdiction", string>>;
};

export const INITIAL_AUTH_STATE: AuthActionState = { status: "idle", message: "" };
export const VIEWER_POLICY_VERSION = "viewer-policy-v1";

const SELF_REQUESTABLE_ROLES = new Set<AppRole>(["creator", "agency"]);
const STAFF_ROLES = new Set<AppRole>([
  "reviewer",
  "moderator",
  "finance",
  "copyright",
  "support",
  "super_admin",
]);

const ROLE_ROUTES: Record<AppRole, string> = {
  fan: "/workspace/fan",
  creator: "/workspace/creator",
  agency: "/workspace/agency",
  reviewer: "/workspace/staff",
  moderator: "/workspace/staff",
  finance: "/workspace/staff",
  copyright: "/workspace/staff",
  support: "/workspace/staff",
  super_admin: "/workspace/staff",
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function isStaffRole(role: AppRole | null): boolean {
  return role !== null && STAFF_ROLES.has(role);
}

export function isSelfRequestableRole(role: AppRole): boolean {
  return SELF_REQUESTABLE_ROLES.has(role);
}

export function routeForRole(role: AppRole): string {
  return ROLE_ROUTES[role];
}

export function normalizeNextPath(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value !== "string") return "/workspace";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return "/workspace";
  }

  try {
    const parsed = new URL(trimmed, "http://lux.local");
    if (parsed.origin !== "http://lux.local") return "/workspace";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/workspace";
  }
}

export function normalizeEmail(value: FormDataEntryValue | string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateEmail(email: string): string | null {
  if (email.length < 3 || email.length > 254) return "Enter a valid email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string, email = ""): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 128) return "Use no more than 128 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Include uppercase, lowercase, and a number.";
  }

  const emailLocalPart = email.split("@")[0]?.toLowerCase();
  if (emailLocalPart && emailLocalPart.length >= 4 && password.toLowerCase().includes(emailLocalPart)) {
    return "Do not include your email name in the password.";
  }
  return null;
}

export function normalizeJurisdiction(value: FormDataEntryValue | string | null | undefined): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function validateJurisdiction(code: string): string | null {
  return /^[A-Z]{2}$/.test(code) ? null : "Use a two-letter country code, such as PK, GB, or US.";
}

export function adultAccessSatisfied(
  context: Pick<ViewerContext, "ageAssurance">,
  mode: AgeAssuranceMode,
  now = new Date(),
): boolean {
  const assurance = context.ageAssurance;
  if (!assurance || assurance.status !== "accepted") return false;
  if (assurance.expiresAt && new Date(assurance.expiresAt).getTime() <= now.getTime()) return false;
  return mode === "self_attestation" || assurance.method === "provider";
}

export function canAccessWorkspace(
  context: ViewerContext,
  requiredRole: AppRole | "staff",
  mode: AgeAssuranceMode,
): boolean {
  if (!context.emailVerified || !context.sessionValid || !adultAccessSatisfied(context, mode)) return false;
  if (requiredRole === "staff") return isStaffRole(context.activeRole);
  return context.activeRole === requiredRole;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

export function parseViewerContext(value: unknown): ViewerContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const userId = readString(record.user_id);
  if (!userId) return null;

  const activeRoleValue = record.active_role;
  const activeRole = activeRoleValue === null || activeRoleValue === undefined
    ? null
    : isAppRole(activeRoleValue) ? activeRoleValue : null;

  const rawMemberships = Array.isArray(record.memberships) ? record.memberships : [];
  const memberships = rawMemberships.flatMap((item): WorkspaceMembership[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const membership = item as Record<string, unknown>;
    const id = readString(membership.id);
    const role = membership.role;
    const status = membership.status;
    const requestedAt = readString(membership.requested_at);
    if (
      !id
      || !isAppRole(role)
      || !["requested", "approved", "rejected", "revoked"].includes(String(status))
      || !requestedAt
    ) return [];

    return [{
      id,
      role,
      status: status as MembershipStatus,
      requestedAt,
      reviewedAt: readString(membership.reviewed_at),
    }];
  });

  let ageAssurance: ViewerAgeAssurance | null = null;
  if (record.age_assurance && typeof record.age_assurance === "object" && !Array.isArray(record.age_assurance)) {
    const age = record.age_assurance as Record<string, unknown>;
    const method = age.method;
    const status = age.status;
    const jurisdictionCode = readString(age.jurisdiction_code);
    const policyVersion = readString(age.policy_version);
    const assuredAt = readString(age.assured_at);
    if (
      (method === "self_attestation" || method === "provider")
      && ["accepted", "rejected", "revoked", "expired"].includes(String(status))
      && jurisdictionCode
      && policyVersion
      && assuredAt
    ) {
      ageAssurance = {
        method,
        status: status as AgeAssuranceStatus,
        jurisdictionCode,
        policyVersion,
        assuredAt,
        expiresAt: readString(age.expires_at),
      };
    }
  }

  return {
    userId,
    emailVerified: readBoolean(record.email_verified),
    sessionValid: readBoolean(record.session_valid),
    activeRole,
    ageAssurance,
    memberships,
  };
}
