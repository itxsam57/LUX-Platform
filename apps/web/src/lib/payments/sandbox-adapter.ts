import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CustomerReference,
  PaymentAdapter,
  PaymentMethodReference,
  PaymentTransaction,
  PaymentTransactionState,
  SyntheticWebhookEnvelope,
  SyntheticWebhookEvent,
  VerifiedPaymentWebhook,
} from "./types";

type IdempotentResult<T> = {
  fingerprint: string;
  result: T;
};

const paymentStates = new Set<PaymentTransactionState>([
  "authorized",
  "captured",
  "partially_refunded",
  "refunded",
  "failed",
]);

function cloneTransaction(transaction: PaymentTransaction): PaymentTransaction {
  return { ...transaction };
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function requireIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key) throw new Error("A payment idempotency key is required.");
  return key;
}

function readIdempotent<T>(
  store: Map<string, IdempotentResult<T>>,
  key: string,
  requestFingerprint: string,
): T | null {
  const existing = store.get(key);
  if (!existing) return null;
  if (existing.fingerprint !== requestFingerprint) {
    throw new Error("Payment idempotency key was reused for a different request.");
  }
  return existing.result;
}

function parseWebhookEvent(payload: string): SyntheticWebhookEvent {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new Error("Invalid sandbox webhook payload.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid sandbox webhook payload.");
  }

  const event = value as Record<string, unknown>;
  if (
    typeof event.eventId !== "string"
    || event.eventId.length === 0
    || typeof event.transactionRef !== "string"
    || !/^txn_sbx_[0-9a-f]{24}$/.test(event.transactionRef)
    || typeof event.state !== "string"
    || !paymentStates.has(event.state as PaymentTransactionState)
    || typeof event.occurredAt !== "string"
    || Number.isNaN(Date.parse(event.occurredAt))
  ) {
    throw new Error("Invalid sandbox webhook payload.");
  }

  return {
    eventId: event.eventId,
    transactionRef: event.transactionRef,
    state: event.state as PaymentTransactionState,
    occurredAt: event.occurredAt,
  };
}

export function createSandboxPaymentAdapter({ webhookSecret }: { webhookSecret: string }): PaymentAdapter & {
  createSyntheticWebhook(event: SyntheticWebhookEvent): SyntheticWebhookEnvelope;
} {
  if (!webhookSecret.trim()) throw new Error("Sandbox webhook secret is required.");

  const customers = new Set<string>();
  const paymentMethods = new Map<string, string>();
  const transactions = new Map<string, PaymentTransaction>();
  const customerRequests = new Map<string, IdempotentResult<CustomerReference>>();
  const methodRequests = new Map<string, IdempotentResult<PaymentMethodReference>>();
  const transactionRequests = new Map<string, IdempotentResult<PaymentTransaction>>();
  const captureRequests = new Map<string, IdempotentResult<PaymentTransaction>>();
  const refundRequests = new Map<string, IdempotentResult<PaymentTransaction>>();

  function opaqueReference(prefix: "cus_sbx" | "pm_sbx" | "txn_sbx", parts: string[]): string {
    const digest = createHmac("sha256", webhookSecret)
      .update(`${prefix}\0${parts.join("\0")}`)
      .digest("hex")
      .slice(0, 24);
    return `${prefix}_${digest}`;
  }

  function sign(payload: string): string {
    return createHmac("sha256", webhookSecret).update(payload).digest("hex");
  }

  return {
    async createCustomer(input) {
      const key = requireIdempotencyKey(input.idempotencyKey);
      const requestFingerprint = fingerprint({ accountPublicId: input.accountPublicId });
      const existing = readIdempotent(customerRequests, key, requestFingerprint);
      if (existing) return { ...existing };

      const customerRef = opaqueReference("cus_sbx", [input.accountPublicId, key]);
      const result = { customerRef };
      customers.add(customerRef);
      customerRequests.set(key, { fingerprint: requestFingerprint, result });
      return { ...result };
    },

    async tokenizePaymentMethod(input): Promise<PaymentMethodReference> {
      const unsafeInput = input as unknown as Record<string, unknown>;
      const allowedFields = new Set(["customerRef", "syntheticMethodNonce", "idempotencyKey"]);
      if (Object.keys(unsafeInput).some((key) => !allowedFields.has(key))) {
        throw new Error("Raw card data is not accepted by the sandbox adapter.");
      }
      if (!customers.has(input.customerRef)) throw new Error("Unknown sandbox customer reference.");
      if (!input.syntheticMethodNonce.trim()) throw new Error("Synthetic payment method nonce is required.");

      const key = requireIdempotencyKey(input.idempotencyKey);
      const requestFingerprint = fingerprint({
        customerRef: input.customerRef,
        syntheticMethodNonce: input.syntheticMethodNonce,
      });
      const existing = readIdempotent(methodRequests, key, requestFingerprint);
      if (existing) return { ...existing };

      const paymentMethodRef = opaqueReference("pm_sbx", [
        input.customerRef,
        input.syntheticMethodNonce,
        key,
      ]);
      const result = { customerRef: input.customerRef, paymentMethodRef };
      paymentMethods.set(paymentMethodRef, input.customerRef);
      methodRequests.set(key, { fingerprint: requestFingerprint, result });
      return { ...result };
    },

    async authorizeOrCharge(input) {
      if (!customers.has(input.customerRef)) throw new Error("Unknown sandbox customer reference.");
      if (paymentMethods.get(input.paymentMethodRef) !== input.customerRef) {
        throw new Error("Payment method does not belong to the sandbox customer.");
      }
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new Error("Payment amount must be a positive safe integer.");
      }
      const currency = input.currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Payment currency must be an ISO-style three-letter code.");

      const key = requireIdempotencyKey(input.idempotencyKey);
      const requestFingerprint = fingerprint({
        customerRef: input.customerRef,
        paymentMethodRef: input.paymentMethodRef,
        amountMinor: input.amountMinor,
        currency,
        capture: input.capture,
      });
      const existing = readIdempotent(transactionRequests, key, requestFingerprint);
      if (existing) return cloneTransaction(existing);

      const transactionRef = opaqueReference("txn_sbx", [requestFingerprint, key]);
      const transaction: PaymentTransaction = {
        transactionRef,
        state: input.capture ? "captured" : "authorized",
        amountMinor: input.amountMinor,
        currency,
        authorizedMinor: input.amountMinor,
        capturedMinor: input.capture ? input.amountMinor : 0,
        refundedMinor: 0,
        synthetic: true,
      };
      transactions.set(transactionRef, transaction);
      transactionRequests.set(key, { fingerprint: requestFingerprint, result: transaction });
      return cloneTransaction(transaction);
    },

    async capture(input) {
      const key = requireIdempotencyKey(input.idempotencyKey);
      const requestFingerprint = fingerprint({ transactionRef: input.transactionRef });
      const existing = readIdempotent(captureRequests, key, requestFingerprint);
      if (existing) return cloneTransaction(existing);

      const current = transactions.get(input.transactionRef);
      if (!current) throw new Error("Unknown sandbox transaction reference.");
      if (current.state !== "authorized" && current.state !== "captured") {
        throw new Error("Only an authorized sandbox transaction can be captured.");
      }

      const captured: PaymentTransaction = current.state === "captured"
        ? cloneTransaction(current)
        : {
          ...current,
          state: "captured",
          capturedMinor: current.amountMinor,
        };
      transactions.set(input.transactionRef, captured);
      captureRequests.set(key, { fingerprint: requestFingerprint, result: captured });
      return cloneTransaction(captured);
    },

    async refund(input) {
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new Error("Refund amount must be a positive safe integer.");
      }

      const key = requireIdempotencyKey(input.idempotencyKey);
      const requestFingerprint = fingerprint({
        transactionRef: input.transactionRef,
        amountMinor: input.amountMinor,
      });
      const existing = readIdempotent(refundRequests, key, requestFingerprint);
      if (existing) return cloneTransaction(existing);

      const current = transactions.get(input.transactionRef);
      if (!current) throw new Error("Unknown sandbox transaction reference.");
      const nextRefundedMinor = current.refundedMinor + input.amountMinor;
      if (current.capturedMinor <= 0 || nextRefundedMinor > current.capturedMinor) {
        throw new Error("Refund cannot exceed the captured sandbox amount.");
      }

      const refunded: PaymentTransaction = {
        ...current,
        refundedMinor: nextRefundedMinor,
        state: nextRefundedMinor === current.capturedMinor ? "refunded" : "partially_refunded",
      };
      transactions.set(input.transactionRef, refunded);
      refundRequests.set(key, { fingerprint: requestFingerprint, result: refunded });
      return cloneTransaction(refunded);
    },

    createSyntheticWebhook(event) {
      const payload = JSON.stringify(event);
      return { payload, signature: sign(payload) };
    },

    async verifyWebhook(envelope): Promise<VerifiedPaymentWebhook> {
      const expected = Buffer.from(sign(envelope.payload), "utf8");
      const actual = Buffer.from(envelope.signature, "utf8");
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        throw new Error("Invalid sandbox webhook signature.");
      }
      return { ...parseWebhookEvent(envelope.payload), synthetic: true };
    },

    async getTransaction(transactionRef) {
      const transaction = transactions.get(transactionRef);
      return transaction ? cloneTransaction(transaction) : null;
    },
  };
}
