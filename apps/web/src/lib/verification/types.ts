export type VerificationLevel = "v1" | "v2" | "v3";

export type VerificationStatus =
  | "not_started"
  | "pending"
  | "needs_review"
  | "verified"
  | "rejected"
  | "expired"
  | "revoked";

export type VerificationTargetLevel = Exclude<VerificationLevel, "v1">;

export type VerificationProviderEnvironment = "development" | "test" | "production";
export type VerificationProviderMode = "synthetic" | "provider" | "unavailable";

export type VerificationCurrentState = {
  status: VerificationStatus;
  expiresAt: string | null;
};

export type V3EligibilityInput = {
  v2Current: boolean;
  performerRecordActive: boolean;
  livenessCurrent: boolean;
  payoutOwnershipVerified: boolean;
  consentEducationAcknowledged: boolean;
};

export type V3Prerequisite = keyof V3EligibilityInput;

export type V3Eligibility = {
  eligible: boolean;
  missing: V3Prerequisite[];
};

export type VerificationProviderModeInput = {
  environment: VerificationProviderEnvironment;
  approvedProviderConfigured: boolean;
  syntheticEnabled: boolean;
};

export type VerificationSessionRequest = {
  subjectId: string;
  targetLevel: VerificationTargetLevel;
  returnUrl: string;
};

export type VerificationSessionDescriptor = {
  providerKey: string;
  providerLabel: string;
  sessionReference: string;
  launchUrl: string | null;
  expiresAt: string;
  synthetic: boolean;
};

export type VerificationNormalizedResult = {
  providerKey: string;
  providerReference: string;
  targetLevel: VerificationTargetLevel;
  status: Extract<VerificationStatus, "pending" | "needs_review" | "verified" | "rejected">;
  livenessPassed: boolean;
  riskScreenPassed: boolean;
  expiresAt: string | null;
  synthetic: boolean;
};

export type VerificationCallbackInput = {
  rawBody: string;
  signature: string | null;
};

export type VerificationProviderHealth = {
  providerKey: string;
  providerLabel: string;
  configured: boolean;
  healthy: boolean;
  synthetic: boolean;
};
