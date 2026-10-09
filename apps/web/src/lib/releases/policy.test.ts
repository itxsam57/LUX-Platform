import { describe, expect, it } from "vitest";
import {
  parseCreatedRelease,
  parseDeviceId,
  parsePublicProfileReleases,
  parseReleaseAssetGrant,
  parseReleaseDetail,
  parseReleaseLibrary,
  parseReleaseMetadata,
  parseReleasePlaybackGrant,
  parseReleaseReview,
  parseStolenCopyReport,
} from "./policy";

describe("release mutation validation", () => {
  it("accepts bounded release metadata and opaque asset identifiers only", () => {
    expect(parseReleaseMetadata({
      title: "Approved release",
      synopsis: "The final approved cut.",
      posterAssetPublicId: "ast0123456789abcdef01234567",
      previewAssetPublicId: "ast89abcdef0123456701234567",
    })).toEqual({
      title: "Approved release",
      synopsis: "The final approved cut.",
      posterAssetPublicId: "ast0123456789abcdef01234567",
      previewAssetPublicId: "ast89abcdef0123456701234567",
    });
    expect(parseReleaseMetadata({ title: "x", synopsis: "valid synopsis" })).toBeNull();
    expect(parseReleaseMetadata({ title: "Valid title", synopsis: "ok", posterAssetPublicId: "bucket/private.mov" })).toBeNull();
  });

  it("requires stable bounded device ids for playback session limits", () => {
    expect(parseDeviceId(" browser-device.1234 ")).toBe("browser-device.1234");
    expect(parseDeviceId("short")).toBeNull();
    expect(parseDeviceId("device/unsafe/value")).toBeNull();
  });

  it("validates entitled reviews and stolen-copy reports before RPC calls", () => {
    expect(parseReleaseReview("5", "  Excellent final cut. ")).toEqual({ rating: 5, body: "Excellent final cut." });
    expect(parseReleaseReview("0", "nope")).toBeNull();
    expect(parseReleaseReview("4", "x\ncontrol")).toBeNull();
    expect(parseStolenCopyReport("https://example.com/copied-release", "Looks like the full release.")).toEqual({
      url: "https://example.com/copied-release",
      note: "Looks like the full release.",
    });
    expect(parseStolenCopyReport("javascript:alert(1)", "valid note")).toBeNull();
  });

  it("accepts only opaque release creation and short-lived access projections", () => {
    expect(parseCreatedRelease({
      publicId: "rel0123456789abcdef01234567",
      releasedAt: "2026-09-10T02:00:00.000Z",
    })).toEqual({
      publicId: "rel0123456789abcdef01234567",
      releasedAt: "2026-09-10T02:00:00.000Z",
    });
    expect(parseCreatedRelease({
      publicId: "rel0123456789abcdef01234567",
      releasedAt: "2026-09-10T02:00:00.000Z",
      deliveryVersionId: "private-uuid",
    })).toBeNull();

    expect(parseReleasePlaybackGrant({
      playbackPath: `/playback/${"a".repeat(64)}`,
      expiresAt: "2026-09-10T02:10:00.000Z",
    })).toEqual({
      playbackPath: `/playback/${"a".repeat(64)}`,
      expiresAt: "2026-09-10T02:10:00.000Z",
    });
    expect(parseReleasePlaybackGrant({
      playbackPath: "https://storage.example/private.mp4",
      expiresAt: "2026-09-10T02:10:00.000Z",
    })).toBeNull();

    expect(parseReleaseAssetGrant({
      assetPath: `/release-assets/${"b".repeat(64)}`,
      expiresAt: "2026-09-10T02:05:00.000Z",
    })).toEqual({
      assetPath: `/release-assets/${"b".repeat(64)}`,
      expiresAt: "2026-09-10T02:05:00.000Z",
    });
    expect(parseReleaseAssetGrant({
      assetPath: `/release-assets/${"b".repeat(64)}`,
      expiresAt: "2026-09-10T02:05:00.000Z",
      objectPath: "project/private/poster.jpg",
    })).toBeNull();
  });
});

describe("release projections", () => {
  it("accepts only the allowlisted fan-library projection", () => {
    const library = parseReleaseLibrary([{
      publicId: "rel0123456789abcdef01234567",
      title: "Approved release",
      synopsis: "The final approved cut.",
      creatorHandle: "creator",
      deliveryVersion: 3,
      deliverySha256: "a".repeat(64),
      releasedAt: "2026-09-10T00:00:00.000Z",
      entitlementState: "active",
      playbackEligible: true,
      posterAvailable: true,
      previewAvailable: false,
      myRating: 5,
      myReview: "Excellent final cut.",
    }]);
    expect(library).toHaveLength(1);
    expect(library[0]?.playbackEligible).toBe(true);
    expect(parseReleaseLibrary([{ ...library[0], objectPath: "private/release.mp4" }])).toEqual([]);
  });

  it("accepts only the allowlisted release detail projection", () => {
    const detail = parseReleaseDetail({
      publicId: "rel0123456789abcdef01234567",
      title: "Approved release",
      synopsis: "The final approved cut.",
      creatorHandle: "creator",
      deliveryVersion: 3,
      deliverySha256: "b".repeat(64),
      releasedAt: "2026-09-10T00:00:00.000Z",
      entitlementState: "active",
      playbackEligible: true,
      posterAvailable: true,
      previewAvailable: true,
      myRating: 4,
      myReview: "Strong final cut.",
      ratingAverage: 4.5,
      ratingCount: 2,
    });
    expect(detail?.ratingAverage).toBe(4.5);
    expect(detail?.ratingCount).toBe(2);
    expect(parseReleaseDetail({ ...detail, objectPath: "project/private/final.mp4" })).toBeNull();
    expect(parseReleaseDetail({ ...detail, entitlementState: "admin" })).toBeNull();

    expect(parseReleaseDetail({
      ...detail,
      entitlementState: "none",
      playbackEligible: false,
      myRating: null,
      myReview: null,
    })?.entitlementState).toBe("none");
  });

  it("accepts only the public released-work projection", () => {
    const works = parsePublicProfileReleases([{
      publicId: "rel89abcdef0123456701234567",
      title: "Released work",
      synopsis: "A release visible from a permitted public profile.",
      deliveryVersion: 2,
      deliverySha256: "c".repeat(64),
      releasedAt: "2026-09-10T01:00:00.000Z",
      posterAvailable: true,
      previewAvailable: false,
    }]);
    expect(works).toHaveLength(1);
    expect(parsePublicProfileReleases([{ ...works[0], creatorUserId: "12000000-0000-0000-0000-000000000001" }])).toEqual([]);
  });
});
