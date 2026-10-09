import type { ProviderBridgeConfig, ProviderFetch } from "../providers/bridge";
import { createProviderBridgeClient } from "../providers/bridge";
import type { PaymentGatewayAdapter, PaymentCheckoutRequest, PaymentCheckoutSession, NormalizedPaymentProviderEvent } from "./gateway";
import type { PaymentTransactionState } from "./types";

const STATES = new Set<PaymentTransactionState>(["authorized","captured","partially_refunded","refunded","failed"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,254}$/;
const COMMITMENT = /^fnd[0-9a-f]{24}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function safeRef(value: unknown) {
  return typeof value === "string" && ID.test(value) ? value : null;
}
function safeMinor(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function safeDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}
function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createBridgePaymentGatewayAdapter(
  config: ProviderBridgeConfig,
  fetchImpl?: ProviderFetch,
): PaymentGatewayAdapter {
  const client = createProviderBridgeClient(config, fetchImpl);
  return {
    providerKey: config.providerKey,
    providerLabel: config.providerLabel,

    async createCheckoutSession(input: PaymentCheckoutRequest): Promise<PaymentCheckoutSession> {
      if (!COMMITMENT.test(input.commitmentPublicId)
        || !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1
        || !/^[A-Z]{3}$/.test(input.currency)
        || input.idempotencyKey.trim().length < 8) {
        throw new Error("Invalid checkout request.");
      }
      const raw = object(await client.request("/v1/payments/checkout", {
        body: input,
        idempotencyKey: input.idempotencyKey,
      }));
      const checkoutReference = safeRef(raw?.checkoutReference);
      const checkoutUrl = safeHttpsUrl(raw?.checkoutUrl);
      const expiresAt = safeDate(raw?.expiresAt);
      if (!checkoutReference || !checkoutUrl || !expiresAt) throw new Error("Invalid payment provider checkout response.");
      return {
        providerKey: config.providerKey,
        checkoutReference,
        checkoutUrl,
        expiresAt,
      };
    },

    async verifyWebhook(input): Promise<NormalizedPaymentProviderEvent> {
      if (!input.signature?.trim() || !input.rawBody) throw new Error("Payment webhook signature is required.");
      const raw = object(await client.request("/v1/payments/webhooks/verify", {
        body: {
          rawBody: input.rawBody,
          signature: input.signature,
          webhookSecret: config.webhookSecret,
        },
      }));
      const eventId = safeRef(raw?.eventId);
      const commitmentPublicId = typeof raw?.commitmentPublicId === "string" && COMMITMENT.test(raw.commitmentPublicId) ? raw.commitmentPublicId : null;
      const customerRef = safeRef(raw?.customerRef);
      const paymentMethodRef = safeRef(raw?.paymentMethodRef);
      const transactionRef = safeRef(raw?.transactionRef);
      const state = typeof raw?.state === "string" && STATES.has(raw.state as PaymentTransactionState) ? raw.state as PaymentTransactionState : null;
      const authorizedMinor = safeMinor(raw?.authorizedMinor);
      const capturedMinor = safeMinor(raw?.capturedMinor);
      const refundedMinor = safeMinor(raw?.refundedMinor);
      const processingFeeMinor = safeMinor(raw?.processingFeeMinor);
      const occurredAt = safeDate(raw?.occurredAt);
      if (!eventId || !commitmentPublicId || !customerRef || !paymentMethodRef || !transactionRef || !state
        || authorizedMinor === null || capturedMinor === null || refundedMinor === null || processingFeeMinor === null || !occurredAt) {
        throw new Error("Invalid normalized payment webhook.");
      }
      return {
        providerKey: config.providerKey,
        eventId,
        commitmentPublicId,
        customerRef,
        paymentMethodRef,
        transactionRef,
        state,
        authorizedMinor,
        capturedMinor,
        refundedMinor,
        processingFeeMinor,
        occurredAt,
      };
    },

    async health() {
      const raw = object(await client.request("/v1/health"));
      return {
        providerKey: config.providerKey,
        providerLabel: config.providerLabel,
        configured: true,
        healthy: raw?.healthy === true,
      };
    },
  };
}
