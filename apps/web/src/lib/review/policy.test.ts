import { describe, expect, it } from "vitest";
import {
  canApprovePlatformReview,
  parseFinalCutDecision,
  parsePlatformReviewDecision,
  parseProcessingReviewUpdate,
  parseReviewChecklistUpdate,
  parseDeliveryReviewContext,
  parseDeliveryReviewQueue,
  parseFinalCutReviewContext,
  parseReviewDecisionNote,
} from "./policy";

describe("canApprovePlatformReview", () => {
  const ready = {
    processingState: "ready" as const,
    checklist: [
      { key: "legality", state: "pass" as const },
      { key: "consent", state: "pass" as const },
      { key: "copyright", state: "pass" as const },
      { key: "quality", state: "pass" as const },
    ],
    finalCutApprovals: [
      { required: true, state: "approved" as const },
      { required: true, state: "approved" as const },
    ],
  };

  it("allows approval only when processing, checklist, and required final-cut approvals are complete", () => {
    expect(canApprovePlatformReview(ready)).toBe(true);
    expect(canApprovePlatformReview({ ...ready, processingState: "processing" })).toBe(false);
    expect(canApprovePlatformReview({
      ...ready,
      checklist: ready.checklist.map((item) => item.key === "copyright" ? { ...item, state: "fail" as const } : item),
    })).toBe(false);
    expect(canApprovePlatformReview({
      ...ready,
      finalCutApprovals: [{ required: true, state: "pending" }, { required: false, state: "pending" }],
    })).toBe(false);
  });
});

describe("parseReviewDecisionNote", () => {
  it("requires a bounded human reason for review decisions", () => {
    expect(parseReviewDecisionNote("  Rights evidence confirmed.  ")).toBe("Rights evidence confirmed.");
    expect(parseReviewDecisionNote(" ")).toBeNull();
    expect(parseReviewDecisionNote("x\ncontrol")).toBeNull();
    expect(parseReviewDecisionNote("x".repeat(2001))).toBeNull();
  });
});

describe("review mutation validation", () => {
  it("accepts only canonical depicted-person final-cut decisions", () => {
    expect(parseFinalCutDecision("approved")).toBe("approved");
    expect(parseFinalCutDecision("changes_requested")).toBe("changes_requested");
    expect(parseFinalCutDecision("pending")).toBeNull();
    expect(parseFinalCutDecision("approve")).toBeNull();
  });

  it("accepts only bounded reviewer mutations", () => {
    expect(parsePlatformReviewDecision("approve")).toBe("approve");
    expect(parsePlatformReviewDecision("hold")).toBe("hold");
    expect(parsePlatformReviewDecision("approved")).toBeNull();
    expect(parseReviewChecklistUpdate("pass")).toBe("pass");
    expect(parseReviewChecklistUpdate("pending")).toBeNull();
    expect(parseProcessingReviewUpdate("ready")).toBe("ready");
    expect(parseProcessingReviewUpdate("uploaded")).toBe("uploaded");
    expect(parseProcessingReviewUpdate("unknown")).toBeNull();
  });
});

describe("review RPC projections", () => {
  const delivery = {
    publicId: "fdv0123456789abcdef01234567",
    version: 2,
    sha256: "a".repeat(64),
    processingState: "ready",
    status: "in_review",
    releaseReady: false,
    submittedAt: "2026-09-10T00:00:00.000Z",
  };

  it("accepts the canonical creator/reviewer projection and rejects internal identifiers", () => {
    const context = parseDeliveryReviewContext({
      project: { publicId: "prj0123456789abcdef01234567", title: "Project", state: "contract_locked" },
      contract: {
        version: 3,
        termsHash: "b".repeat(64),
        body: { finalCutApprovalRequired: true },
        participants: [{ handle: "performer", role: "performer", depicted: true, accepted: true, consentRecorded: true }],
      },
      current: {
        ...delivery,
        assetPublicId: "ast0123456789abcdef01234567",
        processingNote: "Scan complete",
        finalCutApprovals: [{ handle: "performer", state: "approved", note: "Approved", respondedAt: "2026-09-10T00:01:00.000Z" }],
        checklist: [{ key: "quality", label: "Technical quality", required: true, state: "pass", note: "Passed", checkedAt: "2026-09-10T00:02:00.000Z" }],
      },
      deliveries: [delivery],
      reviewHistory: [{ deliveryPublicId: delivery.publicId, version: 2, decision: "hold", reason: "Manual check", reviewerHandle: "reviewer", createdAt: "2026-09-10T00:03:00.000Z" }],
      creatorResponses: [{ deliveryPublicId: delivery.publicId, version: 2, body: "Updated evidence", createdAt: "2026-09-10T00:04:00.000Z" }],
    });
    expect(context?.current?.assetPublicId).toBe("ast0123456789abcdef01234567");
    expect(parseDeliveryReviewContext({ ...context, current: { ...context?.current, id: "00000000-0000-0000-0000-000000000000" } })).toBeNull();
  });

  it("accepts personal final-cut and reviewer queue projections", () => {
    expect(parseFinalCutReviewContext({
      projectPublicId: "prj0123456789abcdef01234567",
      projectTitle: "Project",
      delivery: {
        publicId: delivery.publicId,
        version: delivery.version,
        sha256: delivery.sha256,
        processingState: delivery.processingState,
        reviewStatus: "in_review",
        submittedAt: delivery.submittedAt,
      },
      contract: { termsHash: "b".repeat(64), finalCutApprovalRequired: true },
      approval: { state: "pending", note: null, respondedAt: null },
    })?.approval.state).toBe("pending");
    expect(parseDeliveryReviewQueue([{
      projectPublicId: "prj0123456789abcdef01234567",
      title: "Project",
      deliveryPublicId: delivery.publicId,
      version: delivery.version,
      sha256: delivery.sha256,
      processingState: delivery.processingState,
      status: delivery.status,
      releaseReady: delivery.releaseReady,
      finalCutBlockers: 1,
      checklistBlockers: 2,
      submittedAt: delivery.submittedAt,
    }])).toHaveLength(1);
  });
});
