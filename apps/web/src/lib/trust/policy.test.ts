import { describe, expect, it } from "vitest";
import {
  parseAppealInput,
  parseCasePublicId,
  parseDisputeInput,
  parseReportInput,
  parseSupportInput,
  parseTrustCases,
} from "./policy";

const now = new Date().toISOString();

describe("trust policy", () => {
  it("parses a safe trust projection", () => {
    expect(parseTrustCases({
      support: [{ publicId: "sup" + "a".repeat(24), subject: "Account help", state: "open", createdAt: now, updatedAt: now, resolvedAt: null }],
      reports: [{ publicId: "mod" + "b".repeat(24), subjectType: "campaign", subjectPublicId: "cmp" + "c".repeat(24), summary: "Misleading campaign", state: "in_review", createdAt: now, updatedAt: now, resolvedAt: null }],
      disputes: [{ publicId: "dsp" + "d".repeat(24), subjectType: "funding_commitment", subjectPublicId: "fnd" + "e".repeat(24), category: "refund", summary: "Refund did not arrive", state: "resolved", resolutionNote: "Refund has been completed.", createdAt: now, updatedAt: now, resolvedAt: now }],
      appeals: [{ publicId: "apl" + "f".repeat(24), sourceType: "consumer_dispute", sourcePublicId: "dsp" + "d".repeat(24), state: "upheld", decisionNote: "Decision reviewed and upheld.", createdAt: now, updatedAt: now, decidedAt: now }],
    })?.disputes[0].category).toBe("refund");
  });

  it("rejects unknown projected keys", () => {
    expect(parseTrustCases({ support: [], reports: [], disputes: [], appeals: [], providerReference: "private" })).toBeNull();
  });

  it("validates support text bounds", () => {
    expect(parseSupportInput("Need account help", "I cannot access the expected account workflow.")).toEqual({
      subject: "Need account help",
      body: "I cannot access the expected account workflow.",
    });
    expect(parseSupportInput("short", "too short")).toBeNull();
  });

  it("validates report subject types", () => {
    expect(parseReportInput("release", "rel" + "a".repeat(24), "Copied release", "This release appears to violate platform rules.")?.subjectType).toBe("release");
    expect(parseReportInput("unknown", "x", "Copied release", "This release appears to violate platform rules.")).toBeNull();
  });

  it("requires owned-resource public-id shapes for disputes", () => {
    expect(parseDisputeInput("funding_commitment", "fnd" + "a".repeat(24), "payment", "Payment status issue", "The payment state shown to me does not match what I expected.")?.category).toBe("payment");
    expect(parseDisputeInput("funding_commitment", "rel" + "a".repeat(24), "payment", "Payment status issue", "The payment state shown to me does not match what I expected.")).toBeNull();
  });

  it("requires final-case id shapes for appeals", () => {
    expect(parseAppealInput("support_case", "sup" + "a".repeat(24), "I am appealing because the resolution did not address the documented issue.")?.sourceType).toBe("support_case");
    expect(parseAppealInput("support_case", "dsp" + "a".repeat(24), "I am appealing because the resolution did not address the documented issue.")).toBeNull();
  });

  it("parses staff review ids", () => {
    expect(parseCasePublicId("dispute", "dsp" + "1".repeat(24))).toBe("dsp" + "1".repeat(24));
    expect(parseCasePublicId("appeal", "dsp" + "1".repeat(24))).toBeNull();
  });
});
