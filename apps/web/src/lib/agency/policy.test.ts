import { describe, expect, it } from "vitest";
import {
  parseAgencyEarningsStatements,
  parseAgencyNegotiationInput,
  parseAgencyOpportunityInput,
  parseAgencyProfileInput,
  parseAgencyRepresentationDecision,
  parseAgencyRepresentationInvite,
  parseAgencyRepresentationRevocation,
  parseAgencyRepresentationTerms,
  parseAgencyStaffMutation,
  parseAgencyVerificationReview,
  parseAgencyVerificationSubmission,
  parseAgencyVerificationQueue,
  parseAgencyWorkspace,
  parseMyAgencyRepresentations,
} from "./policy";

const scopes = {
  communications: true,
  opportunities: true,
  negotiations: true,
  projectAdmin: true,
  contractAdmin: false,
  earningsVisibility: true,
};

const activity = {
  publicId: "are0123456789abcdef01234567",
  eventType: "accepted",
  details: { termsHash: "a".repeat(64) },
  createdAt: "2026-09-10T04:00:00.000Z",
};

describe("agency action input validation", () => {
  it("normalizes profile and accepted representation terms", () => {
    expect(parseAgencyProfileInput({ displayName: "  North Star Agency  ", jurisdictionCode: "pk" })).toEqual({
      displayName: "North Star Agency",
      jurisdictionCode: "PK",
    });
    expect(parseAgencyRepresentationTerms({
      ...scopes,
      commissionBasisPoints: 1250,
      revocationNoticeDays: 14,
    })).toEqual({ ...scopes, commissionBasisPoints: 1250, revocationNoticeDays: 14 });
    expect(parseAgencyRepresentationTerms({
      communications: false,
      opportunities: false,
      negotiations: false,
      projectAdmin: false,
      contractAdmin: false,
      earningsVisibility: false,
      commissionBasisPoints: 0,
      revocationNoticeDays: 0,
    })).toBeNull();
    expect(parseAgencyRepresentationTerms({ ...scopes, earningsVisibility: false, commissionBasisPoints: 500, revocationNoticeDays: 0 })).toBeNull();
  });

  it("bounds staff, opportunity, negotiation, response, and revocation mutations", () => {
    expect(parseAgencyStaffMutation({ handle: "performer_one", staffRole: "agent", reason: "Joining the active roster.", enabled: true })).toEqual({
      handle: "performer_one",
      staffRole: "agent",
      reason: "Joining the active roster.",
      enabled: true,
    });
    expect(parseAgencyOpportunityInput({ agreementPublicId: "agr0123456789abcdef01234567", title: "Feature role", summary: "Negotiating a bounded feature appearance." })).not.toBeNull();
    expect(parseAgencyNegotiationInput({ opportunityPublicId: "opp0123456789abcdef01234567", stage: "countered", note: "Countered on schedule and fee." })).not.toBeNull();
    expect(parseAgencyRepresentationDecision({ agreementPublicId: "agr0123456789abcdef01234567", decision: "accept" })).not.toBeNull();
    expect(parseAgencyRepresentationRevocation({ agreementPublicId: "agr0123456789abcdef01234567", reason: "Ending representation under the agreed notice period." })).not.toBeNull();
    expect(parseAgencyStaffMutation({ handle: "bad-handle", staffRole: "owner", reason: "No.", enabled: true })).toBeNull();
  });

  it("bounds representation invites and verification mutations", () => {
    expect(parseAgencyRepresentationInvite({
      performerHandle: " Performer_One ",
      terms: { ...scopes, commissionBasisPoints: 1250, revocationNoticeDays: 14 },
    })).toEqual({
      performerHandle: "performer_one",
      terms: { ...scopes, commissionBasisPoints: 1250, revocationNoticeDays: 14 },
    });
    expect(parseAgencyVerificationSubmission({
      agencyPublicId: "agy0123456789abcdef01234567",
      provider: "  provider.key  ",
      evidenceReference: "  provider-case-123  ",
    })).toEqual({
      agencyPublicId: "agy0123456789abcdef01234567",
      provider: "provider.key",
      evidenceReference: "provider-case-123",
    });
    expect(parseAgencyVerificationReview({
      agencyPublicId: "agy0123456789abcdef01234567",
      decision: "approved",
      reason: "Provider verification passed.",
    })).toEqual({
      agencyPublicId: "agy0123456789abcdef01234567",
      decision: "approved",
      reason: "Provider verification passed.",
    });
    expect(parseAgencyVerificationSubmission({
      agencyPublicId: "agy0123456789abcdef01234567",
      provider: "bad provider",
      evidenceReference: "provider-case-123",
    })).toBeNull();
  });
});

describe("agency RPC projections", () => {
  const workspace = {
    agency: {
      publicId: "agy0123456789abcdef01234567",
      displayName: "North Star Agency",
      jurisdictionCode: "PK",
      verificationStatus: "approved",
      staffRole: "owner",
    },
    staff: [{ handle: "agency_owner", staffRole: "owner", active: true }],
    representations: [{
      publicId: "agr0123456789abcdef01234567",
      performerHandle: "performer_one",
      status: "accepted",
      scopes,
      commissionBasisPoints: 1250,
      revocationNoticeDays: 14,
      acceptedAt: "2026-09-10T03:00:00.000Z",
      revocationEffectiveAt: null,
      activity: [activity],
    }],
    opportunities: [{
      publicId: "opp0123456789abcdef01234567",
      agreementPublicId: "agr0123456789abcdef01234567",
      performerHandle: "performer_one",
      title: "Feature role",
      summary: "Negotiating a bounded feature appearance.",
      status: "negotiating",
      createdAt: "2026-09-10T03:30:00.000Z",
      updatedAt: "2026-09-10T04:00:00.000Z",
      negotiationHistory: [{
        publicId: "neg0123456789abcdef01234567",
        stage: "countered",
        note: "Countered on schedule and fee.",
        createdAt: "2026-09-10T04:00:00.000Z",
      }],
    }],
  };

  it("accepts the tenant-scoped agency workspace and rejects privacy expansion", () => {
    expect(parseAgencyWorkspace(workspace)).toEqual(workspace);
    expect(parseAgencyWorkspace({ ...workspace, ownerUserId: "12000000-0000-0000-0000-000000000001" })).toBeNull();
    expect(parseAgencyWorkspace({
      ...workspace,
      representations: [{ ...workspace.representations[0], activity: [{ ...activity, actorUserId: "12000000-0000-0000-0000-000000000002" }] }],
    })).toBeNull();
  });

  it("accepts performer-visible representation history without agency private storage fields", () => {
    const performerRow = {
      publicId: "agr0123456789abcdef01234567",
      agencyPublicId: "agy0123456789abcdef01234567",
      agencyName: "North Star Agency",
      agencyVerificationStatus: "approved",
      status: "accepted",
      scopes,
      commissionBasisPoints: 1250,
      revocationNoticeDays: 14,
      termsHash: "a".repeat(64),
      proposedAt: "2026-09-10T02:00:00.000Z",
      acceptedAt: "2026-09-10T03:00:00.000Z",
      revocationEffectiveAt: null,
      activity: [activity],
    };
    expect(parseMyAgencyRepresentations([performerRow])).toEqual([performerRow]);
    expect(parseMyAgencyRepresentations([{ ...performerRow, verificationEvidenceReference: "private/agency/document.pdf" }])).toEqual([]);
  });

  it("accepts only explicit agency ledger statements", () => {
    const row = {
      projectPublicId: "prj0123456789abcdef01234567",
      projectTitle: "Feature One",
      currency: "USD",
      balanceMinor: 125000,
      commissionBasisPoints: 1250,
    };
    expect(parseAgencyEarningsStatements([row])).toEqual([row]);
    expect(parseAgencyEarningsStatements([{ ...row, accountOwnerUserId: "12000000-0000-0000-0000-000000000003" }])).toEqual([]);
  });

  it("accepts only the reviewer-safe agency verification queue projection", () => {
    const row = {
      agencyPublicId: "agy0123456789abcdef01234567",
      displayName: "North Star Agency",
      jurisdictionCode: "PK",
      verificationStatus: "pending",
      verificationProvider: "provider.key",
      verificationReason: null,
      updatedAt: "2026-09-10T04:00:00.000Z",
    };
    expect(parseAgencyVerificationQueue([row])).toEqual([row]);
    expect(parseAgencyVerificationQueue([{ ...row, ownerUserId: "12000000-0000-0000-0000-000000000004" }])).toEqual([]);
    expect(parseAgencyVerificationQueue([{ ...row, evidenceReference: "provider-case-123" }])).toEqual([]);
  });
});
