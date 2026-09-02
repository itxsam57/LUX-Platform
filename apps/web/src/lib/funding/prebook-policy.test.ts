import { describe, expect, it } from "vitest";
import {
  canCreatePrebook,
  normalizePrebookRequest,
  type PrebookEligibilityInput,
  type PrebookRequestInput,
  type SupporterVisibility,
} from "./prebook-policy";

const now = new Date("2026-08-30T00:00:00.000Z");

const eligible: PrebookEligibilityInput = {
  campaignState: "published",
  deadline: "2026-10-30T00:00:00.000Z",
  paymentEnvironmentEligible: true,
  projectRestricted: false,
};

const request: PrebookRequestInput = {
  amountMinor: 5_000,
  supporterVisibility: "default",
  badgeChoice: "founding-supporter",
  idempotencyKey: "prebook:fixture-001",
};

describe("pre-book eligibility", () => {
  it("allows a published, unrestricted campaign before its deadline", () => {
    expect(canCreatePrebook(eligible, now)).toBe(true);
  });

  it.each(["draft", "review_ready", "funding_closed", "cancelled"] as const)(
    "rejects campaign state %s",
    (campaignState) => {
      expect(canCreatePrebook({ ...eligible, campaignState }, now)).toBe(false);
    },
  );

  it("rejects an expired campaign", () => {
    expect(
      canCreatePrebook({ ...eligible, deadline: now.toISOString() }, now),
    ).toBe(false);
  });

  it("fails closed for project restrictions or payment-environment ineligibility", () => {
    expect(canCreatePrebook({ ...eligible, projectRestricted: true }, now)).toBe(false);
    expect(
      canCreatePrebook({ ...eligible, paymentEnvironmentEligible: false }, now),
    ).toBe(false);
  });
});

describe("pre-book request normalization", () => {
  it("resolves default supporter visibility from the existing privacy preference", () => {
    expect(normalizePrebookRequest(request, true)).toEqual({
      amountMinor: 5_000,
      supporterAnonymous: true,
      badgeChoice: "founding-supporter",
      idempotencyKey: "prebook:fixture-001",
    });
    expect(normalizePrebookRequest(request, false).supporterAnonymous).toBe(false);
  });

  it("allows an explicit anonymous or public override", () => {
    expect(
      normalizePrebookRequest({ ...request, supporterVisibility: "anonymous" }, false)
        .supporterAnonymous,
    ).toBe(true);
    expect(
      normalizePrebookRequest({ ...request, supporterVisibility: "public" }, true)
        .supporterAnonymous,
    ).toBe(false);
  });

  it("accepts only positive safe-integer amounts", () => {
    expect(() => normalizePrebookRequest({ ...request, amountMinor: 0 }, true)).toThrow(
      "invalid_prebook_amount",
    );
    expect(() =>
      normalizePrebookRequest(
        { ...request, amountMinor: Number.MAX_SAFE_INTEGER + 1 },
        true,
      ),
    ).toThrow("invalid_prebook_amount");
  });

  it("rejects an unsupported visibility value", () => {
    expect(() =>
      normalizePrebookRequest(
        {
          ...request,
          supporterVisibility: "friends" as unknown as SupporterVisibility,
        },
        true,
      ),
    ).toThrow("invalid_supporter_visibility");
  });

  it("requires a bounded opaque idempotency key", () => {
    expect(() =>
      normalizePrebookRequest({ ...request, idempotencyKey: "short" }, true),
    ).toThrow("invalid_prebook_idempotency_key");
    expect(() =>
      normalizePrebookRequest({ ...request, idempotencyKey: "x".repeat(129) }, true),
    ).toThrow("invalid_prebook_idempotency_key");
  });

  it("normalizes an optional badge choice without awarding a badge", () => {
    expect(
      normalizePrebookRequest({ ...request, badgeChoice: "  early-supporter  " }, true)
        .badgeChoice,
    ).toBe("early-supporter");
    expect(normalizePrebookRequest({ ...request, badgeChoice: null }, true).badgeChoice).toBeNull();
    expect(() =>
      normalizePrebookRequest({ ...request, badgeChoice: "x".repeat(65) }, true),
    ).toThrow("invalid_badge_choice");
  });
});
