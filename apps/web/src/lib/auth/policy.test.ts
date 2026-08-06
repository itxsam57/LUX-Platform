import { describe, expect, it } from "vitest";
import {
  adultAccessSatisfied,
  canAccessWorkspace,
  isSelfRequestableRole,
  isStaffRole,
  normalizeEmail,
  normalizeJurisdiction,
  normalizeNextPath,
  parseViewerContext,
  routeForRole,
  validateEmail,
  validateJurisdiction,
  validatePassword,
  type ViewerContext,
} from "./policy";

const baseContext: ViewerContext = {
  userId: "10000000-0000-0000-0000-000000000001",
  emailVerified: true,
  sessionValid: true,
  activeRole: "fan",
  ageAssurance: {
    method: "self_attestation",
    status: "accepted",
    jurisdictionCode: "PK",
    policyVersion: "viewer-policy-v1",
    assuredAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2027-08-01T00:00:00.000Z",
  },
  memberships: [{
    id: "30000000-0000-0000-0000-000000000001",
    role: "fan",
    status: "approved",
    requestedAt: "2026-08-01T00:00:00.000Z",
    reviewedAt: "2026-08-01T00:00:00.000Z",
  }],
};

describe("auth policy", () => {
  it("normalizes and validates email without changing account semantics", () => {
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
    expect(validateEmail("user@example.com")).toBeNull();
    expect(validateEmail("not-an-email")).toBe("Enter a valid email address.");
  });

  it("enforces the password contract", () => {
    expect(validatePassword("Short1")).toBe("Use at least 12 characters.");
    expect(validatePassword("alllowercase123")).toBe("Include uppercase, lowercase, and a number.");
    expect(validatePassword("StrongPassword123", "strong@example.com")).toBe(
      "Do not include your email name in the password.",
    );
    expect(validatePassword("UnrelatedPass123", "person@example.com")).toBeNull();
  });

  it("accepts only safe internal next paths", () => {
    expect(normalizeNextPath("/workspace/creator?tab=overview")).toBe("/workspace/creator?tab=overview");
    expect(normalizeNextPath("https://evil.example/steal")).toBe("/workspace");
    expect(normalizeNextPath("//evil.example/steal")).toBe("/workspace");
    expect(normalizeNextPath("/workspace\\evil")).toBe("/workspace");
  });

  it("separates self-requestable and staff roles", () => {
    expect(isSelfRequestableRole("creator")).toBe(true);
    expect(isSelfRequestableRole("agency")).toBe(true);
    expect(isSelfRequestableRole("moderator")).toBe(false);
    expect(isStaffRole("super_admin")).toBe(true);
    expect(isStaffRole("creator")).toBe(false);
  });

  it("maps each role to its isolated route family", () => {
    expect(routeForRole("fan")).toBe("/workspace/fan");
    expect(routeForRole("creator")).toBe("/workspace/creator");
    expect(routeForRole("agency")).toBe("/workspace/agency");
    expect(routeForRole("support")).toBe("/workspace/staff");
  });

  it("normalizes jurisdiction codes", () => {
    expect(normalizeJurisdiction(" pk ")).toBe("PK");
    expect(validateJurisdiction("PK")).toBeNull();
    expect(validateJurisdiction("PAK")).toContain("two-letter");
  });

  it("requires provider evidence when provider mode is active", () => {
    expect(adultAccessSatisfied(baseContext, "self_attestation", new Date("2026-08-05"))).toBe(true);
    expect(adultAccessSatisfied(baseContext, "provider_required", new Date("2026-08-05"))).toBe(false);
    expect(adultAccessSatisfied({
      ageAssurance: { ...baseContext.ageAssurance!, method: "provider" },
    }, "provider_required", new Date("2026-08-05"))).toBe(true);
  });

  it("rejects expired age assurance", () => {
    expect(adultAccessSatisfied({
      ageAssurance: { ...baseContext.ageAssurance!, expiresAt: "2026-01-01T00:00:00.000Z" },
    }, "self_attestation", new Date("2026-08-05"))).toBe(false);
  });

  it("requires exact active workspace instead of merged membership permissions", () => {
    const creatorMembershipContext: ViewerContext = {
      ...baseContext,
      memberships: [
        ...baseContext.memberships,
        {
          id: "30000000-0000-0000-0000-000000000002",
          role: "creator",
          status: "approved",
          requestedAt: "2026-08-01T00:00:00.000Z",
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
    };

    expect(canAccessWorkspace(creatorMembershipContext, "fan", "self_attestation")).toBe(true);
    expect(canAccessWorkspace(creatorMembershipContext, "creator", "self_attestation")).toBe(false);
    expect(canAccessWorkspace({ ...creatorMembershipContext, activeRole: "creator" }, "creator", "self_attestation")).toBe(true);
    expect(canAccessWorkspace({ ...creatorMembershipContext, activeRole: "creator" }, "staff", "self_attestation")).toBe(false);
  });

  it("blocks unverified and revoked sessions", () => {
    expect(canAccessWorkspace({ ...baseContext, emailVerified: false }, "fan", "self_attestation")).toBe(false);
    expect(canAccessWorkspace({ ...baseContext, sessionValid: false }, "fan", "self_attestation")).toBe(false);
  });

  it("parses the database viewer-context contract and drops malformed memberships", () => {
    const parsed = parseViewerContext({
      user_id: baseContext.userId,
      email_verified: true,
      session_valid: true,
      active_role: "fan",
      age_assurance: {
        method: "self_attestation",
        status: "accepted",
        jurisdiction_code: "PK",
        policy_version: "viewer-policy-v1",
        assured_at: "2026-08-01T00:00:00.000Z",
        expires_at: null,
      },
      memberships: [
        {
          id: "30000000-0000-0000-0000-000000000001",
          role: "fan",
          status: "approved",
          requested_at: "2026-08-01T00:00:00.000Z",
          reviewed_at: null,
        },
        { id: "bad", role: "owner", status: "approved" },
      ],
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.memberships).toHaveLength(1);
    expect(parsed?.activeRole).toBe("fan");
  });

  it("returns null for an invalid viewer-context payload", () => {
    expect(parseViewerContext(null)).toBeNull();
    expect(parseViewerContext({ email_verified: true })).toBeNull();
  });
});
