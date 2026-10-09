import type { ProviderBridgeHealth } from "../providers/bridge";

export type AgeAssuranceSessionRequest = {
  subjectId: string;
  jurisdictionCode: string;
  returnUrl: string;
  policyVersion: string;
};

export type AgeAssuranceSession = {
  providerKey: string;
  sessionReference: string;
  launchUrl: string;
  expiresAt: string;
};

export type AgeAssuranceResult = {
  eventId: string;
  providerKey: string;
  providerReference: string;
  subjectId: string;
  jurisdictionCode: string;
  status: "accepted" | "rejected";
  expiresAt: string | null;
  occurredAt: string;
};

export interface AgeAssuranceAdapter {
  readonly providerKey: string;
  readonly providerLabel: string;
  createSession(input: AgeAssuranceSessionRequest): Promise<AgeAssuranceSession>;
  verifyWebhook(input: { rawBody: string; signature: string | null }): Promise<AgeAssuranceResult>;
  health(): Promise<ProviderBridgeHealth>;
}
