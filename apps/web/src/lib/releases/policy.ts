export type ReleaseMetadataInput = {
  title: string;
  synopsis: string;
  posterAssetPublicId: string | null;
  previewAssetPublicId: string | null;
};

export type ReleaseLibraryItem = {
  publicId: string;
  title: string;
  synopsis: string;
  creatorHandle: string;
  deliveryVersion: number;
  deliverySha256: string;
  releasedAt: string;
  entitlementState: "active" | "revoked";
  playbackEligible: boolean;
  posterAvailable: boolean;
  previewAvailable: boolean;
  myRating: number | null;
  myReview: string | null;
};

export type ReleaseDetail = Omit<ReleaseLibraryItem, "entitlementState"> & {
  entitlementState: "active" | "revoked" | "none";
  ratingAverage: number | null;
  ratingCount: number;
};

export type PublicProfileRelease = {
  publicId: string;
  title: string;
  synopsis: string;
  deliveryVersion: number;
  deliverySha256: string;
  releasedAt: string;
  posterAvailable: boolean;
  previewAvailable: boolean;
};

export type CreatedRelease = {
  publicId: string;
  releasedAt: string;
};

export type ReleasePlaybackGrant = {
  playbackPath: string;
  expiresAt: string;
};

export type ReleaseAssetGrant = {
  assetPath: string;
  expiresAt: string;
};

const CONTROL = /[\u0000-\u001f\u007f]/;
const ASSET_ID = /^ast[0-9a-f]{24}$/;
const RELEASE_ID = /^rel[0-9a-f]{24}$/;
const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HASH = /^[0-9a-f]{64}$/;
const HANDLE = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function onlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedText(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max || CONTROL.test(normalized)) return null;
  return normalized;
}

function nullableBoundedText(value: unknown, min: number, max: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return boundedText(value, min, max) ?? undefined;
}

function nullableAssetId(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && ASSET_ID.test(value.trim()) ? value.trim() : undefined;
}

export function parseReleaseMetadata(value: unknown): ReleaseMetadataInput | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["title", "synopsis", "posterAssetPublicId", "previewAssetPublicId"])) return null;
  const title = boundedText(row.title, 2, 180);
  const synopsis = boundedText(row.synopsis, 3, 2000);
  const posterAssetPublicId = nullableAssetId(row.posterAssetPublicId);
  const previewAssetPublicId = nullableAssetId(row.previewAssetPublicId);
  if (!title || !synopsis || posterAssetPublicId === undefined || previewAssetPublicId === undefined) return null;
  return { title, synopsis, posterAssetPublicId, previewAssetPublicId };
}

export function parseDeviceId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return DEVICE_ID.test(normalized) ? normalized : null;
}

function timestamp(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function parseCreatedRelease(value: unknown): CreatedRelease | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["publicId", "releasedAt"])) return null;
  const publicId = typeof row.publicId === "string" && RELEASE_ID.test(row.publicId) ? row.publicId : null;
  const releasedAt = timestamp(row.releasedAt);
  return publicId && releasedAt ? { publicId, releasedAt } : null;
}

export function parseReleasePlaybackGrant(value: unknown): ReleasePlaybackGrant | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["playbackPath", "expiresAt"])) return null;
  const playbackPath = typeof row.playbackPath === "string" && /^\/playback\/[0-9a-f]{64}$/.test(row.playbackPath)
    ? row.playbackPath
    : null;
  const expiresAt = timestamp(row.expiresAt);
  return playbackPath && expiresAt ? { playbackPath, expiresAt } : null;
}

export function parseReleaseAssetGrant(value: unknown): ReleaseAssetGrant | null {
  const row = object(value);
  if (!row || !onlyKeys(row, ["assetPath", "expiresAt"])) return null;
  const assetPath = typeof row.assetPath === "string" && /^\/release-assets\/[0-9a-f]{64}$/.test(row.assetPath)
    ? row.assetPath
    : null;
  const expiresAt = timestamp(row.expiresAt);
  return assetPath && expiresAt ? { assetPath, expiresAt } : null;
}

export function parseReleaseReview(ratingValue: unknown, bodyValue: unknown) {
  const numeric = typeof ratingValue === "number" ? ratingValue : Number(ratingValue);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) return null;
  const body = nullableBoundedText(bodyValue, 3, 2000);
  if (body === undefined) return null;
  return { rating: numeric, body };
}

export function parseStolenCopyReport(urlValue: unknown, noteValue: unknown) {
  const urlText = boundedText(urlValue, 8, 2048);
  const note = boundedText(noteValue, 3, 2000);
  if (!urlText || !note) return null;
  try {
    const url = new URL(urlText);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname) return null;
    return { url: url.toString(), note };
  } catch {
    return null;
  }
}

function parseLibraryItem(value: unknown): ReleaseLibraryItem | null {
  const row = object(value);
  if (!row || !onlyKeys(row, [
    "publicId", "title", "synopsis", "creatorHandle", "deliveryVersion", "deliverySha256", "releasedAt",
    "entitlementState", "playbackEligible", "posterAvailable", "previewAvailable", "myRating", "myReview",
  ])) return null;

  const publicId = typeof row.publicId === "string" && RELEASE_ID.test(row.publicId) ? row.publicId : null;
  const title = boundedText(row.title, 2, 180);
  const synopsis = boundedText(row.synopsis, 3, 2000);
  const creatorHandle = typeof row.creatorHandle === "string" && HANDLE.test(row.creatorHandle) ? row.creatorHandle : null;
  const deliveryVersion = typeof row.deliveryVersion === "number" && Number.isSafeInteger(row.deliveryVersion) && row.deliveryVersion > 0 ? row.deliveryVersion : null;
  const deliverySha256 = typeof row.deliverySha256 === "string" && HASH.test(row.deliverySha256) ? row.deliverySha256 : null;
  const releasedAt = timestamp(row.releasedAt);
  const entitlementState = row.entitlementState === "active" || row.entitlementState === "revoked" ? row.entitlementState : null;
  const myRating = row.myRating === null
    ? null
    : typeof row.myRating === "number" && Number.isInteger(row.myRating) && row.myRating >= 1 && row.myRating <= 5 ? row.myRating : undefined;
  const myReview = nullableBoundedText(row.myReview, 3, 2000);

  if (!publicId || !title || !synopsis || !creatorHandle || !deliveryVersion || !deliverySha256 || !releasedAt || !entitlementState
    || typeof row.playbackEligible !== "boolean" || typeof row.posterAvailable !== "boolean" || typeof row.previewAvailable !== "boolean"
    || myRating === undefined || myReview === undefined) return null;

  return {
    publicId,
    title,
    synopsis,
    creatorHandle,
    deliveryVersion,
    deliverySha256,
    releasedAt,
    entitlementState,
    playbackEligible: row.playbackEligible,
    posterAvailable: row.posterAvailable,
    previewAvailable: row.previewAvailable,
    myRating,
    myReview,
  };
}

export function parseReleaseLibrary(value: unknown): ReleaseLibraryItem[] {
  if (!Array.isArray(value)) return [];
  const parsed = value.map(parseLibraryItem);
  return parsed.every((item): item is ReleaseLibraryItem => item !== null) ? parsed : [];
}

export function parseReleaseDetail(value: unknown): ReleaseDetail | null {
  const row = object(value);
  if (!row || !onlyKeys(row, [
    "publicId", "title", "synopsis", "creatorHandle", "deliveryVersion", "deliverySha256", "releasedAt",
    "entitlementState", "playbackEligible", "posterAvailable", "previewAvailable", "myRating", "myReview",
    "ratingAverage", "ratingCount",
  ])) return null;

  const libraryCandidate = parseLibraryItem({
    publicId: row.publicId,
    title: row.title,
    synopsis: row.synopsis,
    creatorHandle: row.creatorHandle,
    deliveryVersion: row.deliveryVersion,
    deliverySha256: row.deliverySha256,
    releasedAt: row.releasedAt,
    entitlementState: row.entitlementState === "none" ? "revoked" : row.entitlementState,
    playbackEligible: row.playbackEligible,
    posterAvailable: row.posterAvailable,
    previewAvailable: row.previewAvailable,
    myRating: row.myRating,
    myReview: row.myReview,
  });
  if (!libraryCandidate) return null;
  if (row.entitlementState !== "active" && row.entitlementState !== "revoked" && row.entitlementState !== "none") return null;

  const ratingAverage = row.ratingAverage === null
    ? null
    : typeof row.ratingAverage === "number" && Number.isFinite(row.ratingAverage) && row.ratingAverage >= 1 && row.ratingAverage <= 5
      ? row.ratingAverage
      : undefined;
  const ratingCount = typeof row.ratingCount === "number" && Number.isSafeInteger(row.ratingCount) && row.ratingCount >= 0
    ? row.ratingCount
    : null;
  if (ratingAverage === undefined || ratingCount === null) return null;

  return {
    ...libraryCandidate,
    entitlementState: row.entitlementState,
    ratingAverage,
    ratingCount,
  };
}

function parsePublicProfileRelease(value: unknown): PublicProfileRelease | null {
  const row = object(value);
  if (!row || !onlyKeys(row, [
    "publicId", "title", "synopsis", "deliveryVersion", "deliverySha256", "releasedAt", "posterAvailable", "previewAvailable",
  ])) return null;
  const publicId = typeof row.publicId === "string" && RELEASE_ID.test(row.publicId) ? row.publicId : null;
  const title = boundedText(row.title, 2, 180);
  const synopsis = boundedText(row.synopsis, 3, 2000);
  const deliveryVersion = typeof row.deliveryVersion === "number" && Number.isSafeInteger(row.deliveryVersion) && row.deliveryVersion > 0 ? row.deliveryVersion : null;
  const deliverySha256 = typeof row.deliverySha256 === "string" && HASH.test(row.deliverySha256) ? row.deliverySha256 : null;
  const releasedAt = timestamp(row.releasedAt);
  if (!publicId || !title || !synopsis || !deliveryVersion || !deliverySha256 || !releasedAt
    || typeof row.posterAvailable !== "boolean" || typeof row.previewAvailable !== "boolean") return null;
  return {
    publicId,
    title,
    synopsis,
    deliveryVersion,
    deliverySha256,
    releasedAt,
    posterAvailable: row.posterAvailable,
    previewAvailable: row.previewAvailable,
  };
}

export function parsePublicProfileReleases(value: unknown): PublicProfileRelease[] {
  if (!Array.isArray(value)) return [];
  const parsed = value.map(parsePublicProfileRelease);
  return parsed.every((item): item is PublicProfileRelease => item !== null) ? parsed : [];
}
