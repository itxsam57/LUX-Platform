import type {
  PaymentAdapter,
  PaymentMethodReference,
  PaymentTransaction,
  SyntheticWebhookEnvelope,
  SyntheticWebhookEvent,
  VerifiedPaymentWebhook,
} from "./types";

function pendingTransaction(state: PaymentTransaction["state"]): PaymentTransaction {
  return {
    transactionRef: "txn_pending",
    state,
    amountMinor: 0,
    currency: "USD",
    authorizedMinor: 0,
    capturedMinor: 0,
    refundedMinor: 0,
    synthetic: true,
  };
}

export function createSandboxPaymentAdapter({ webhookSecret }: { webhookSecret: string }): PaymentAdapter & {
  createSyntheticWebhook(event: SyntheticWebhookEvent): SyntheticWebhookEnvelope;
} {
  void webhookSecret;
  return {
    async createCustomer() {
      return { customerRef: "cus_pending" };
    },
    async tokenizePaymentMethod(input): Promise<PaymentMethodReference> {
      const unsafe = input as unknown as Record<string, unknown>;
      if (unsafe.pan || unsafe.cvv || unsafe.cardNumber) throw new Error("Raw card data is not accepted.");
      return { customerRef: input.customerRef, paymentMethodRef: "pm_pending" };
    },
    async authorizeOrCharge(input) {
      return { ...pendingTransaction(input.capture ? "captured" : "authorized"), amountMinor: input.amountMinor, currency: input.currency };
    },
    async capture() {
      return pendingTransaction("captured");
    },
    async refund() {
      return pendingTransaction("partially_refunded");
    },
    createSyntheticWebhook(event) {
      return { payload: JSON.stringify(event), signature: "pending" };
    },
    async verifyWebhook(envelope): Promise<VerifiedPaymentWebhook> {
      return { ...(JSON.parse(envelope.payload) as SyntheticWebhookEvent), synthetic: true };
    },
    async getTransaction() {
      return null;
    },
  };
}
