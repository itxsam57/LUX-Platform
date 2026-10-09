import type { ProviderBridgeHealth } from "../providers/bridge";

export type PayoutRecipientOnboardingRequest = {
  subjectId: string;
  returnUrl: string;
  idempotencyKey: string;
};

export type PayoutRecipientOnboardingSession = {
  providerKey: string;
  recipientReference: string;
  onboardingUrl: string;
  expiresAt: string;
};

export type NormalizedPayoutRecipientEvent = {
  providerKey: string;
  eventId: string;
  subjectId: string;
  recipientReference: string;
  state: "verified" | "restricted";
  ownershipVerified: boolean;
  occurredAt: string;
};

export type PayoutDispatchRequest = {
  payoutPublicId: string;
  recipientReference: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
};

export type PayoutDispatchResult = {
  providerKey: string;
  providerPayoutRef: string;
  state: "processing";
};

export type NormalizedPayoutProviderEvent = {
  providerKey: string;
  eventId: string;
  payoutPublicId: string;
  providerPayoutRef: string;
  state: "paid" | "failed";
  reportedAmountMinor: number;
  occurredAt: string;
};

export interface PayoutGatewayAdapter {
  readonly providerKey: string;
  readonly providerLabel: string;
  createRecipientOnboarding(input: PayoutRecipientOnboardingRequest): Promise<PayoutRecipientOnboardingSession>;
  verifyRecipientWebhook(input: { rawBody: string; signature: string | null }): Promise<NormalizedPayoutRecipientEvent>;
  dispatch(input: PayoutDispatchRequest): Promise<PayoutDispatchResult>;
  verifyWebhook(input: { rawBody: string; signature: string | null }): Promise<NormalizedPayoutProviderEvent>;
  health(): Promise<ProviderBridgeHealth>;
}
