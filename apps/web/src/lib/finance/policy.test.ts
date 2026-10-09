import { describe, expect, it } from "vitest";
import {
  parseEarnings,
  parseEarningsStatement,
  parseFinancePayoutQueue,
  parseFinanceHoldKind,
  parseFinanceIdempotencyKey,
  parseFinanceMonthStart,
  parseFinanceReason,
  parseFinanceResourceId,
  parseParticipantHandle,
  parseMyPayouts,
  parseMoneyMinor,
  parsePayoutCurrency,
  parseStatementDate,
} from "./policy";

describe("finance projections", () => {
  it("accepts only the allowlisted participant earnings projection", () => {
    const rows = parseEarnings([{
      projectPublicId: "prj0123456789abcdef01234567",
      projectTitle: "Example project",
      currency: "USD",
      restrictedMinor: 1250,
      availableMinor: 500,
      pendingPayoutMinor: 250,
      paidMinor: 1000,
      openHoldMinor: 0,
      payoutEligible: true,
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.availableMinor).toBe(500);
    expect(parseEarnings([{ ...rows[0], providerRef: "private-provider-id" }])).toEqual([]);
  });

  it("accepts statement entries without exposing internal ledger identifiers", () => {
    const statement = parseEarningsStatement({
      projectPublicId: "prj0123456789abcdef01234567",
      from: "2026-09-01",
      to: "2026-09-30",
      entries: [{
        journalPublicId: "jrn0123456789abcdef01234567",
        kind: "earnings_promotion",
        currency: "USD",
        account: "participant_available",
        side: "credit",
        amountMinor: 500,
        occurredAt: "2026-09-10T02:00:00.000Z",
      }],
    });
    expect(statement?.entries).toHaveLength(1);
    expect(parseEarningsStatement({ ...statement, projectId: "private-uuid" })).toBeNull();
  });

  it("accepts only the scoped finance queue projection", () => {
    const queue = parseFinancePayoutQueue({
      payouts: [{
        publicId: "pay0123456789abcdef01234567",
        projectPublicId: "prj0123456789abcdef01234567",
        participantHandle: "performer.one",
        amountMinor: 500,
        currency: "USD",
        state: "requested",
        attemptCount: 0,
        batchPublicId: null,
        createdAt: "2026-09-10T02:00:00.000Z",
      }],
      holds: [{
        publicId: "hld0123456789abcdef01234567",
        projectPublicId: "prj0123456789abcdef01234567",
        participantHandle: "performer.one",
        kind: "dispute",
        amountMinor: 200,
        currency: "USD",
        state: "open",
        reason: "Open dispute review.",
        createdAt: "2026-09-10T02:00:00.000Z",
      }],
      reconciliationCases: [{
        publicId: "fin0123456789abcdef01234567",
        projectPublicId: "prj0123456789abcdef01234567",
        payoutPublicId: "pay0123456789abcdef01234567",
        kind: "payout_amount_mismatch",
        expectedMinor: 500,
        observedMinor: 450,
        currency: "USD",
        state: "open",
        note: "Provider amount mismatch.",
        createdAt: "2026-09-10T02:00:00.000Z",
      }],
    });
    expect(queue?.payouts[0]?.participantHandle).toBe("performer.one");
    expect(parseFinancePayoutQueue({ ...queue, providerPayoutRef: "private" })).toBeNull();
  });

  it("accepts participant payout history without provider identifiers", () => {
    const payouts = parseMyPayouts([{
      publicId: "pay0123456789abcdef01234567",
      projectPublicId: "prj0123456789abcdef01234567",
      projectTitle: "Example project",
      amountMinor: 500,
      currency: "USD",
      state: "failed",
      attemptCount: 2,
      createdAt: "2026-09-10T02:00:00.000Z",
      paidAt: null,
    }]);
    expect(payouts).toHaveLength(1);
    expect(payouts[0]?.state).toBe("failed");
    expect(parseMyPayouts([{ ...payouts[0], providerPayoutRef: "private" }])).toEqual([]);
  });
});

describe("finance mutation validation", () => {
  it("parses positive safe minor-unit amounts", () => {
    expect(parseMoneyMinor("1250")).toBe(1250);
    expect(parseMoneyMinor("0")).toBeNull();
    expect(parseMoneyMinor("1.25")).toBeNull();
    expect(parseMoneyMinor(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
  });

  it("normalizes only ISO currency codes", () => {
    expect(parsePayoutCurrency(" usd ")).toBe("USD");
    expect(parsePayoutCurrency("USDT")).toBeNull();
    expect(parsePayoutCurrency("U$D")).toBeNull();
  });

  it("accepts only opaque finance resource IDs and bounded idempotency keys", () => {
    expect(parseFinanceResourceId("project", "prj0123456789abcdef01234567")).toBe("prj0123456789abcdef01234567");
    expect(parseFinanceResourceId("payout", "pay0123456789abcdef01234567")).toBe("pay0123456789abcdef01234567");
    expect(parseFinanceResourceId("hold", "hld0123456789abcdef01234567")).toBe("hld0123456789abcdef01234567");
    expect(parseFinanceResourceId("payout", "private-uuid")).toBeNull();
    expect(parseFinanceIdempotencyKey(" payout.request:abc-123 ")).toBe("payout.request:abc-123");
    expect(parseFinanceIdempotencyKey("short")).toBeNull();
    expect(parseFinanceIdempotencyKey("bad key with spaces")).toBeNull();
  });

  it("validates statement dates, finance months, handles, hold kinds, and reasons", () => {
    expect(parseStatementDate("2026-09-10")).toBe("2026-09-10");
    expect(parseStatementDate("2026-02-30")).toBeNull();
    expect(parseFinanceMonthStart("2026-09-01")).toBe("2026-09-01");
    expect(parseFinanceMonthStart("2026-09-10")).toBeNull();
    expect(parseParticipantHandle(" Performer.One ")).toBe("performer.one");
    expect(parseParticipantHandle("x")).toBeNull();
    expect(parseFinanceHoldKind(" chargeback ")).toBe("chargeback");
    expect(parseFinanceHoldKind("manual")).toBeNull();
    expect(parseFinanceReason(" Provider dispute review. ")).toBe("Provider dispute review.");
    expect(parseFinanceReason("x")).toBeNull();
    expect(parseFinanceReason("bad\u0000reason")).toBeNull();
  });
});
