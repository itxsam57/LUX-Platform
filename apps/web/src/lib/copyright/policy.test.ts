import { describe, expect, it } from "vitest";
import {
  parseCopyrightCaseList,
  parseCopyrightEvidence,
  parseCopyrightIntakeList,
  parseCreatorRightsRegistry,
  parseCopyrightCaseMutation,
  parseCopyrightStaffCaseList,
  parseRightsRegistration,
  type CopyrightCaseSummary,
} from "./policy";

describe("copyright rights registration validation", () => {
  it("accepts bounded ownership evidence and content fingerprints", () => {
    expect(parseRightsRegistration({
      ownershipKind: "owner",
      licenceReference: "Contract LUX-2026-0042",
      ownershipEvidenceReference: "evidence:creator-contract-0042",
      contentSha256: "a".repeat(64),
      perceptualFingerprint: "phash:8f0a1134de89bc22",
    })).toEqual({
      ownershipKind: "owner",
      licenceReference: "Contract LUX-2026-0042",
      ownershipEvidenceReference: "evidence:creator-contract-0042",
      contentSha256: "a".repeat(64),
      perceptualFingerprint: "phash:8f0a1134de89bc22",
    });

    expect(parseRightsRegistration({
      ownershipKind: "borrowed",
      licenceReference: null,
      ownershipEvidenceReference: "evidence:creator-contract-0042",
      contentSha256: "a".repeat(64),
      perceptualFingerprint: "phash:8f0a1134de89bc22",
    })).toBeNull();
    expect(parseRightsRegistration({
      ownershipKind: "licensee",
      licenceReference: "Contract 1",
      ownershipEvidenceReference: "private/storage/path.pdf",
      contentSha256: "not-a-hash",
      perceptualFingerprint: "phash:8f0a1134de89bc22",
    })).toBeNull();
  });
});

describe("copyright case mutation validation", () => {
  it("requires an allowlisted lifecycle action and a meaningful reason", () => {
    expect(parseCopyrightCaseMutation({
      action: "submit_notice",
      reason: "Notice submitted to the reported host after evidence review.",
      noticeReference: "provider-case-1042",
    })).toEqual({
      action: "submit_notice",
      reason: "Notice submitted to the reported host after evidence review.",
      noticeReference: "provider-case-1042",
    });
    expect(parseCopyrightCaseMutation({ action: "delete_everywhere", reason: "Remove it." })).toBeNull();
    expect(parseCopyrightCaseMutation({ action: "confirm_removal", reason: "short" })).toBeNull();
  });
});

describe("copyright case projections", () => {
  const caseRow: CopyrightCaseSummary = {
    publicId: "cpy0123456789abcdef01234567",
    releasePublicId: "rel0123456789abcdef01234567",
    releaseTitle: "Approved release",
    stage: "notice_submitted",
    reportedUrl: "https://example.com/copied-release",
    evidencePackageAvailable: true,
    sourceMatchState: "possible_session_match",
    noticeStatus: "submitted",
    removalConfirmedAt: null,
    recurrenceCount: 0,
    openedAt: "2026-09-10T03:00:00.000Z",
    updatedAt: "2026-09-10T03:15:00.000Z",
  };

  it("accepts only the privacy-safe rights-owner case projection", () => {
    expect(parseCopyrightCaseList([caseRow])).toEqual([caseRow]);
    expect(parseCopyrightCaseList([{ ...caseRow, purchaserUserId: "12000000-0000-0000-0000-000000000001" }])).toEqual([]);
    expect(parseCopyrightCaseList([{ ...caseRow, evidenceObjectPath: "private/evidence.json" }])).toEqual([]);
    expect(parseCopyrightCaseList([{ ...caseRow, stage: "universal_deleted" }])).toEqual([]);
  });

  it("accepts the staff queue metadata without accepting identity fields", () => {
    const staffRow = {
      ...caseRow,
      reportPublicId: "lkr0123456789abcdef01234567",
      rightsRegistered: true,
      repeatInfringerFlag: false,
    };
    expect(parseCopyrightStaffCaseList([staffRow])).toEqual([staffRow]);
    expect(parseCopyrightStaffCaseList([{ ...staffRow, reporterUserId: "13000000-0000-0000-0000-000000000001" }])).toEqual([]);
    expect(parseCopyrightStaffCaseList([{ ...staffRow, purchaserUserId: "13000000-0000-0000-0000-000000000002" }])).toEqual([]);
  });

  it("accepts only an audited evidence projection without actor identities or storage paths", () => {
    const evidence = {
      casePublicId: caseRow.publicId,
      releasePublicId: caseRow.releasePublicId,
      releaseTitle: caseRow.releaseTitle,
      reportedUrl: caseRow.reportedUrl,
      reportNote: "Copied release observed by a viewer.",
      reportCreatedAt: caseRow.openedAt,
      ownershipKind: "owner",
      licenceReference: null,
      ownershipEvidenceReference: "evidence:creator-contract-0042",
      contentSha256: "a".repeat(64),
      perceptualFingerprint: "phash:8f0a1134de89bc22",
      sourceMatchState: "possible_session_match",
      sourceMatchFingerprint: "b".repeat(64),
      noticeReference: "provider-case-1042",
      noticeDocumentReference: "evidence:copyright-notice-0123456789abcdef01234567",
      noticeDocumentSha256: "d".repeat(64),
      evidencePackageReference: "evidence:copyright-package-0123456789abcdef01234567",
      evidencePackageSha256: "c".repeat(64),
      removalConfirmedAt: null,
      recurrenceCount: 0,
      noticeHistory: [{
        recordPublicId: "cnt0123456789abcdef01234567",
        eventType: "submitted",
        documentReference: "evidence:copyright-notice-0123456789abcdef01234567",
        documentSha256: "d".repeat(64),
        submissionReference: "provider-case-1042",
        createdAt: caseRow.updatedAt,
      }],
      history: [{
        eventPublicId: "cev0123456789abcdef01234567",
        eventType: "submit_notice",
        stageAfter: "notice_submitted",
        reason: "Notice submitted after evidence review.",
        noticeReference: "provider-case-1042",
        evidenceReference: null,
        createdAt: caseRow.updatedAt,
      }],
    };
    expect(parseCopyrightEvidence(evidence)).toEqual(evidence);
    expect(parseCopyrightEvidence({ ...evidence, actorUserId: "13000000-0000-0000-0000-000000000003" })).toBeNull();
    expect(parseCopyrightEvidence({ ...evidence, evidenceObjectPath: "private/copyright/case.json" })).toBeNull();
  });

  it("accepts the creator rights registry without private evidence fields", () => {
    const registryRow = {
      releasePublicId: caseRow.releasePublicId,
      releaseTitle: caseRow.releaseTitle,
      releasedAt: caseRow.openedAt,
      rightsPublicId: "crg0123456789abcdef01234567",
      ownershipKind: "owner",
      registeredAt: caseRow.updatedAt,
      watermarkState: "queued",
    };
    expect(parseCreatorRightsRegistry([registryRow])).toEqual([registryRow]);
    expect(parseCreatorRightsRegistry([{ ...registryRow, ownershipEvidenceReference: "evidence:private-rights" }])).toEqual([]);
  });

  it("accepts the staff intake queue without reporter identity", () => {
    const intakeRow = {
      reportPublicId: "lkr0123456789abcdef01234567",
      releasePublicId: caseRow.releasePublicId,
      releaseTitle: caseRow.releaseTitle,
      reportedUrl: caseRow.reportedUrl,
      reportCreatedAt: caseRow.openedAt,
      casePublicId: null,
    };
    expect(parseCopyrightIntakeList([intakeRow])).toEqual([intakeRow]);
    expect(parseCopyrightIntakeList([{ ...intakeRow, reporterUserId: "13000000-0000-0000-0000-000000000004" }])).toEqual([]);
  });
});
