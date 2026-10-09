import { describe, expect, it, vi } from "vitest";
import { normalizeProviderBridgeConfig } from "../providers/bridge";
import { createBridgePayoutGatewayAdapter } from "./bridge-gateway";

const config = normalizeProviderBridgeConfig({
  providerKey: "payout_one",
  providerLabel: "Payout One",
  baseUrl: "https://payouts.example",
  apiKey: "api-key-123",
  webhookSecret: "webhook-secret-123",
  webhookSignatureHeader: "x-payout-signature",
}, "production");

describe("bridge payout gateway", () => {
  it("creates hosted recipient onboarding without collecting bank details", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      recipientReference: "recipient_123",
      onboardingUrl: "https://connect.example/onboarding/123",
      expiresAt: "2026-10-08T00:00:00.000Z",
    }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createBridgePayoutGatewayAdapter(config, fetchImpl);
    const session = await adapter.createRecipientOnboarding({
      subjectId: "26000000-0000-4000-8000-000000000001",
      returnUrl: "https://lux.example/app/earnings",
      idempotencyKey: "recipient-onboarding-123",
    });
    expect(session).toMatchObject({
      providerKey: "payout_one",
      recipientReference: "recipient_123",
    });
    expect(JSON.stringify(session)).not.toMatch(/accountNumber|routing|iban|bank/i);
  });

  it("normalizes recipient ownership callbacks without KYC evidence", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      eventId: "evt_recipient_123",
      subjectId: "26000000-0000-4000-8000-000000000001",
      recipientReference: "recipient_123",
      state: "verified",
      ownershipVerified: true,
      occurredAt: "2026-10-07T12:30:00.000Z",
    }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createBridgePayoutGatewayAdapter(config, fetchImpl);
    const event = await adapter.verifyRecipientWebhook({ rawBody: "{}", signature: "sig" });
    expect(event).toMatchObject({ state: "verified", ownershipVerified: true });
    expect(JSON.stringify(event)).not.toMatch(/document|bank|accountNumber|routing|iban/i);
  });

  it("dispatches by opaque recipient reference and idempotent payout id", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      providerPayoutRef: "po_123",
      state: "processing",
    }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createBridgePayoutGatewayAdapter(config, fetchImpl);
    await expect(adapter.dispatch({
      payoutPublicId: "pay" + "a".repeat(24),
      recipientReference: "recipient_123",
      amountMinor: 5000,
      currency: "USD",
      idempotencyKey: "pay-20261007-1",
    })).resolves.toEqual({ providerKey: "payout_one", providerPayoutRef: "po_123", state: "processing" });
  });

  it("normalizes final provider payout events", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      eventId: "evt_123",
      payoutPublicId: "pay" + "a".repeat(24),
      providerPayoutRef: "po_123",
      state: "paid",
      reportedAmountMinor: 5000,
      occurredAt: "2026-10-07T13:00:00.000Z",
    }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createBridgePayoutGatewayAdapter(config, fetchImpl);
    await expect(adapter.verifyWebhook({ rawBody: "{}", signature: "sig" })).resolves.toMatchObject({ state: "paid", reportedAmountMinor: 5000 });
  });
});
