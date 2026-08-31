export type PaymentProviderEnvironment = "test" | "development" | "production";
export type PaymentProviderMode = "sandbox" | "provider" | "unavailable";
export type PaymentTransactionState = "authorized" | "captured" | "partially_refunded" | "refunded" | "failed";

export type CustomerReference = { customerRef: string };
export type PaymentMethodReference = { paymentMethodRef: string; customerRef: string };

export type PaymentTransaction = {
  transactionRef: string;
  state: PaymentTransactionState;
  amountMinor: number;
  currency: string;
  authorizedMinor: number;
  capturedMinor: number;
  refundedMinor: number;
  synthetic: boolean;
};

export type SyntheticWebhookEvent = {
  eventId: string;
  transactionRef: string;
  state: PaymentTransactionState;
  occurredAt: string;
};

export type SyntheticWebhookEnvelope = {
  payload: string;
  signature: string;
};

export type VerifiedPaymentWebhook = SyntheticWebhookEvent & { synthetic: boolean };

export interface PaymentAdapter {
  createCustomer(input: { accountPublicId: string; idempotencyKey: string }): Promise<CustomerReference>;
  tokenizePaymentMethod(input: { customerRef: string; syntheticMethodNonce: string; idempotencyKey: string }): Promise<PaymentMethodReference>;
  authorizeOrCharge(input: { customerRef: string; paymentMethodRef: string; amountMinor: number; currency: string; capture: boolean; idempotencyKey: string }): Promise<PaymentTransaction>;
  capture(input: { transactionRef: string; idempotencyKey: string }): Promise<PaymentTransaction>;
  refund(input: { transactionRef: string; amountMinor: number; idempotencyKey: string }): Promise<PaymentTransaction>;
  verifyWebhook(envelope: SyntheticWebhookEnvelope): Promise<VerifiedPaymentWebhook>;
  getTransaction(transactionRef: string): Promise<PaymentTransaction | null>;
}
