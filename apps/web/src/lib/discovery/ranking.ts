import type { DiscoveryCandidate, RankedDiscoveryContext } from "./types";

const FOLLOWED_WEIGHT = 40;
const INTEREST_WEIGHT = 25;
const MAX_FRESHNESS_WEIGHT = 20;
const MAX_ENGAGEMENT_WEIGHT = 10;
const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function score(candidate: DiscoveryCandidate, context: RankedDiscoveryContext): number {
  const createdAtMs = Date.parse(candidate.createdAt);
  const ageMs = Number.isFinite(createdAtMs) ? Math.max(0, context.nowMs - createdAtMs) : FRESHNESS_WINDOW_MS;
  const freshness = Math.max(0, MAX_FRESHNESS_WEIGHT * (1 - Math.min(ageMs, FRESHNESS_WINDOW_MS) / FRESHNESS_WINDOW_MS));
  const engagement = Math.max(0, Math.min(MAX_ENGAGEMENT_WEIGHT, candidate.engagement));

  return (candidate.followed ? FOLLOWED_WEIGHT : 0)
    + (candidate.interestMatch ? INTEREST_WEIGHT : 0)
    + freshness
    + engagement;
}

export function rankDiscoveryCandidates(
  candidates: readonly DiscoveryCandidate[],
  context: RankedDiscoveryContext,
): DiscoveryCandidate[] {
  return candidates
    .filter((candidate) => !candidate.blocked && !candidate.hidden)
    .map((candidate) => ({ candidate, score: score(candidate, context) }))
    .sort((left, right) => right.score - left.score || left.candidate.publicKey.localeCompare(right.candidate.publicKey))
    .map(({ candidate }) => candidate);
}

export function applyCreatorDiversityCap(
  candidates: readonly DiscoveryCandidate[],
  maxPerCreator: number,
): DiscoveryCandidate[] {
  if (!Number.isInteger(maxPerCreator) || maxPerCreator <= 0) {
    throw new Error("Creator diversity cap must be a positive integer.");
  }

  const counts = new Map<string, number>();
  const output: DiscoveryCandidate[] = [];

  for (const candidate of candidates) {
    const count = counts.get(candidate.creatorKey) ?? 0;
    if (count >= maxPerCreator) continue;
    counts.set(candidate.creatorKey, count + 1);
    output.push(candidate);
  }

  return output;
}
