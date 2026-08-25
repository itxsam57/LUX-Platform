import { describe, expect, it } from "vitest";
import {
  canTransitionVerificationStatus,
  evaluateV3Eligibility,
  isVerificationCurrent,
  resolveVerificationProviderMode,
} from "./policy";

describe("verification policy", () => {
  it("allows only explicit verification state transitions and idempotent re-application", () => {
    expect(canTransitionVerificationStatus("not_started", "pending")).toBe(true);
    expect(canTransitionVerificationStatus("pending", "needs_review")).toBe(true);
    expect(canTransitionVerificationStatus("pending", "verified")).toBe(true);
    expect(canTransitionVerificationStatus("pending", "rejected")).toBe(true);
    expect(canTransitionVerificationStatus("needs_review", "verified")).toBe(true);
    expect(canTransitionVerificationStatus("needs_review", "rejected")).toBe(true);
    expect(canTransitionVerificationStatus("verified", "expired")).toBe(true);
    expect(canTransitionVerificationStatus("verified", "revoked")).toBe(true);
    expect(canTransitionVerificationStatus("rejected", "pending")).toBe(true);
    expect(canTransitionVerificationStatus("expired", "pending")).toBe(true);
    expect(canTransitionVerificationStatus("revoked", "pending")).toBe(true);
    expect(canTransitionVerificationStatus("verified", "verified")).toBe(true);

    expect(canTransitionVerificationStatus("not_started", "verified")).toBe(false);
    expect(canTransitionVerificationStatus("pending", "revoked")).toBe(false);
    expect(canTransitionVerificationStatus("rejected", "verified")).toBe(false);
    expect(canTransitionVerificationStatus("expired", "verified")).toBe(false);
  });

  it("treats only unexpired verified state as current", () => {
    const now = new Date("2026-08-25T09:00:00.000Z");

    expect(isVerificationCurrent({
      status: "verified",
      expiresAt: "2026-08-26T09:00:00.000Z",
    }, now)).toBe(true);

    expect(isVerificationCurrent({
      status: "verified",
      expiresAt: "2026-08-25T08:59:59.000Z",
    }, now)).toBe(false);

    expect(isVerificationCurrent({
      status: "revoked",
      expiresAt: "2027-08-25T09:00:00.000Z",
    }, now)).toBe(false);

    expect(isVerificationCurrent({
      status: "expired",
      expiresAt: "2027-08-25T09:00:00.000Z",
    }, now)).toBe(false);
  });

  it("requires every canonical V3 prerequisite", () => {
    const complete = {
      v2Current: true,
      performerRecordActive: true,
      livenessCurrent: true,
      payoutOwnershipVerified: true,
      consentEducationAcknowledged: true,
    };

    expect(evaluateV3Eligibility(complete)).toEqual({ eligible: true, missing: [] });

    for (const key of Object.keys(complete) as Array<keyof typeof complete>) {
      expect(evaluateV3Eligibility({ ...complete, [key]: false })).toEqual({
        eligible: false,
        missing: [key],
      });
    }
  });

  it("fails closed in production without an approved provider and never permits synthetic production verification", () => {
    expect(resolveVerificationProviderMode({
      environment: "development",
      approvedProviderConfigured: false,
      syntheticEnabled: true,
    })).toBe("synthetic");

    expect(resolveVerificationProviderMode({
      environment: "test",
      approvedProviderConfigured: false,
      syntheticEnabled: true,
    })).toBe("synthetic");

    expect(resolveVerificationProviderMode({
      environment: "production",
      approvedProviderConfigured: false,
      syntheticEnabled: true,
    })).toBe("unavailable");

    expect(resolveVerificationProviderMode({
      environment: "production",
      approvedProviderConfigured: true,
      syntheticEnabled: true,
    })).toBe("provider");
  });
});
