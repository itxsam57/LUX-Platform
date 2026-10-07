import { describe, expect, it, vi } from "vitest";
import { normalizeProviderBridgeConfig } from "../providers/bridge";
import { createBridgePaymentGatewayAdapter } from "./bridge-gateway";

const config = normalizeProviderBridgeConfig({
  providerKey: "gateway_one",
  providerLabel: "Gateway One",
  baseUrl: "https://payments.example",
  apiKey: "api-key-123",
  webhookSecret: "webhook-secret-123",
  webhookSignatureHeader: "x-pay-signature",
}, "production");

describe("bridge payment gateway", () => {
  it("creates provider-hosted checkout sessions without collecting card data", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      checkoutReference: "checkout_123",
      checkoutUrl: "https://checkout.example/session/123",
      expiresAt: "2026-10-08T00:00:00.000Z",
    }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createBridgePaymentGatewayAdapter(config, fetchImpl);
    await expect(adapter.createCheckoutSession({
      commitmentPublicId: "fnd" + "a".repeat(24),
      amountMinor: 2500,
      currency: "USD",
      successUrl: "https://lux.example/app/funding/success",
      cancelUrl: "https://lux.example/app/funding/cancel",
      idempotencyKey: "checkout-123",
    })).resolves.toMatchObject({ providerKey: "gateway_one", checkoutReference: "checkout_123" });
  });

  it("normalizes only signed provider webhook results", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      eventId: "evt_123",
      commitmentPublicId: "fnd" + "a".repeat(24),
      customerRef: "cus_123",
      paymentMethodRef: "pm_123",
      transactionRef: "txn_123",
      state: "captured",
      authorizedMinor: 2500,
      capturedMinor: 2500,
      refundedMinor: 0,
      processingFeeMinor: 125,
      occurredAt: "2026-10-07T12:00:00.000Z",
    }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createBridgePaymentGatewayAdapter(config, fetchImpl);
    await expect(adapter.verifyWebhook({ rawBody: "{}", signature: "sig_123" })).resolves.toMatchObject({
      state: "captured",
      capturedMinor: 2500,
    });
    await expect(adapter.verifyWebhook({ rawBody: "{}", signature: null })).rejects.toThrow(/signature/);
  });
});
