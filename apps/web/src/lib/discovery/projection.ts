import { applyCreatorDiversityCap, rankDiscoveryCandidates } from "./ranking";
import type { DiscoveryCandidate } from "./types";

export type DiscoveryProfile = {
  kind: "profile";
  publicKey: string;
  creatorKey: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  createdAt: string;
  followed: boolean;
  interestMatch: boolean;
  engagement: number;
  creatorCapable: boolean;
  followerCount: number;
};

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseDiscoveryProfiles(value: unknown): DiscoveryProfile[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (
      row.kind !== "profile"
      || typeof row.publicKey !== "string"
      || typeof row.creatorKey !== "string"
      || typeof row.handle !== "string"
      || typeof row.displayName !== "string"
      || typeof row.bio !== "string"
      || typeof row.createdAt !== "string"
    ) return [];

    return [{
      kind: "profile" as const,
      publicKey: row.publicKey,
      creatorKey: row.creatorKey,
      handle: row.handle,
      displayName: row.displayName,
      bio: row.bio,
      avatarUrl: typeof row.avatarUrl === "string" ? row.avatarUrl : null,
      createdAt: row.createdAt,
      followed: row.followed === true,
      interestMatch: row.interestMatch === true,
      engagement: finiteNumber(row.engagement),
      creatorCapable: row.creatorCapable === true,
      followerCount: finiteNumber(row.followerCount),
    }];
  });
}

export function rankDiscoveryProfiles(
  profiles: readonly DiscoveryProfile[],
  nowMs: number,
): DiscoveryProfile[] {
  const byKey = new Map(profiles.map((profile) => [profile.publicKey, profile]));
  const candidates: DiscoveryCandidate[] = profiles.map((profile) => ({
    kind: profile.kind,
    publicKey: profile.publicKey,
    creatorKey: profile.creatorKey,
    createdAt: profile.createdAt,
    followed: profile.followed,
    interestMatch: profile.interestMatch,
    engagement: profile.engagement,
    blocked: false,
    hidden: false,
  }));

  return applyCreatorDiversityCap(rankDiscoveryCandidates(candidates, { nowMs }), 3)
    .flatMap((candidate) => {
      const profile = byKey.get(candidate.publicKey);
      return profile ? [profile] : [];
    });
}
