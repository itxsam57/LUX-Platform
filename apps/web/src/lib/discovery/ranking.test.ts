import { describe, expect, it } from "vitest";
import { applyCreatorDiversityCap, rankDiscoveryCandidates } from "./ranking";
import type { DiscoveryCandidate } from "./types";

const now = Date.parse("2026-08-25T00:00:00Z");

function candidate(overrides: Partial<DiscoveryCandidate> & Pick<DiscoveryCandidate, "publicKey" | "creatorKey">): DiscoveryCandidate {
  return {
    kind: "profile",
    createdAt: "2026-08-24T00:00:00Z",
    followed: false,
    interestMatch: false,
    engagement: 0,
    blocked: false,
    hidden: false,
    ...overrides,
  };
}

describe("discovery ranking", () => {
  it("removes blocked and hidden candidates before scoring", () => {
    const result = rankDiscoveryCandidates([
      candidate({ publicKey: "safe", creatorKey: "safe" }),
      candidate({ publicKey: "blocked", creatorKey: "blocked", blocked: true, followed: true, engagement: 999 }),
      candidate({ publicKey: "hidden", creatorKey: "hidden", hidden: true, interestMatch: true, engagement: 999 }),
    ], { nowMs: now });

    expect(result.map((item) => item.publicKey)).toEqual(["safe"]);
  });

  it("prioritizes followed and explicit-interest signals with deterministic freshness", () => {
    const result = rankDiscoveryCandidates([
      candidate({ publicKey: "plain", creatorKey: "plain", createdAt: "2026-08-24T23:00:00Z", engagement: 3 }),
      candidate({ publicKey: "interest", creatorKey: "interest", interestMatch: true, createdAt: "2026-08-23T00:00:00Z" }),
      candidate({ publicKey: "followed", creatorKey: "followed", followed: true, createdAt: "2026-08-20T00:00:00Z" }),
    ], { nowMs: now });

    expect(result.map((item) => item.publicKey)).toEqual(["followed", "interest", "plain"]);
  });

  it("uses public key as a stable final tie breaker", () => {
    const result = rankDiscoveryCandidates([
      candidate({ publicKey: "zeta", creatorKey: "zeta" }),
      candidate({ publicKey: "alpha", creatorKey: "alpha" }),
    ], { nowMs: now });

    expect(result.map((item) => item.publicKey)).toEqual(["alpha", "zeta"]);
  });

  it("caps repeated creator entries without reordering remaining candidates", () => {
    const input = [
      candidate({ publicKey: "a-1", creatorKey: "a" }),
      candidate({ publicKey: "a-2", creatorKey: "a" }),
      candidate({ publicKey: "b-1", creatorKey: "b" }),
      candidate({ publicKey: "a-3", creatorKey: "a" }),
    ];

    expect(applyCreatorDiversityCap(input, 2).map((item) => item.publicKey)).toEqual(["a-1", "a-2", "b-1"]);
  });

  it("rejects a non-positive diversity cap", () => {
    expect(() => applyCreatorDiversityCap([], 0)).toThrow(/positive/i);
  });
});
