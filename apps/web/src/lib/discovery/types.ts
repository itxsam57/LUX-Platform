export type DiscoveryKind = "profile" | "demand" | "project" | "campaign";

export type DiscoveryCandidate = {
  kind: DiscoveryKind;
  publicKey: string;
  creatorKey: string;
  createdAt: string;
  followed: boolean;
  interestMatch: boolean;
  engagement: number;
  blocked: boolean;
  hidden: boolean;
};

export type RankedDiscoveryContext = {
  nowMs: number;
};
