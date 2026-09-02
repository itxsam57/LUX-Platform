import type {
  V3Eligibility,
  V3EligibilityInput,
  VerificationCurrentState,
  VerificationProviderMode,
  VerificationProviderModeInput,
  VerificationStatus,
} from "./types";

const allowedTransitions: Record<VerificationStatus, ReadonlySet<VerificationStatus>> = {
  not_started: new Set(["not_started", "pending"]),
  pending: new Set(["pending", "needs_review", "verified", "rejected"]),
  needs_review: new Set(["needs_review", "verified", "rejected"]),
  verified: new Set(["verified", "expired", "revoked"]),
  rejected: new Set(["rejected", "pending"]),
  expired: new Set(["expired", "pending"]),
  revoked: new Set(["revoked", "pending"]),
};

export function canTransitionVerificationStatus(
  current: VerificationStatus,
  next: VerificationStatus,
): boolean {
  return allowedTransitions[current].has(next);
}

export function isVerificationCurrent(
  state: VerificationCurrentState,
  now: Date = new Date(),
): boolean {
  if (state.status !== "verified") return false;
  if (!state.expiresAt) return true;

  const expiresAt = Date.parse(state.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function evaluateV3Eligibility(input: V3EligibilityInput): V3Eligibility {
  const missing = (Object.keys(input) as Array<keyof V3EligibilityInput>)
    .filter((key) => !input[key]);

  return {
    eligible: missing.length === 0,
    missing,
  };
}

export function resolveVerificationProviderMode(
  input: VerificationProviderModeInput,
): VerificationProviderMode {
  if (input.environment === "production") {
    return input.approvedProviderConfigured ? "provider" : "unavailable";
  }

  if (input.syntheticEnabled) return "synthetic";
  return input.approvedProviderConfigured ? "provider" : "unavailable";
}

export function verificationSessionMatchesRuntime(
  session: {
    synthetic: boolean;
    providerKey: string;
  },
  runtime: {
    mode: VerificationProviderMode;
    providerKey: string | null;
  },
): boolean {
  if (runtime.mode === "unavailable") return false;

  if (session.synthetic) {
    return runtime.mode === "synthetic" && session.providerKey === "synthetic";
  }

  return runtime.mode === "provider"
    && runtime.providerKey !== null
    && session.providerKey === runtime.providerKey;
}