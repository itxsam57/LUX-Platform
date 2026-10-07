import type { PaymentTransactionState } from "./types";
import type { ProviderBridgeHealth } from "../providers/bridge";

export type PaymentCheckoutRequest = {
  commitmentPublicId: string;
  amountMinor: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

export type PaymentCheckoutSession = {
  providerKey: string;
  checkoutReference: string;
  checkoutUrl: string;
  expiresAt: string;
};

export type NormalizedPaymentProviderEvent = {
  providerKey: string;
  eventId: string;
  commitmentPublicId: string;
  customerRef: string;
  paymentMethodRef: string;
  transactionRef: string;
  state: PaymentTransactionState;
  authorizedMinor: number;
  capturedMinor: number;
  refundedMinor: number;
  processingFeeMinor: number;
  occurredAt: string;
};

export interface PaymentGatewayAdapter {
  readonly providerKey: string;
  readonly providerLabel: string;
  createCheckoutSession(input: PaymentCheckoutRequest): Promise<PaymentCheckoutSession>;
  verifyWebhook(input: { rawBody: string; signature: string | null }): Promise<NormalizedPaymentProviderEvent>;
  health(): Promise<ProviderBridgeHealth>;
}
