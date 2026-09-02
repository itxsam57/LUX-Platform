import { describe, expect, it } from "vitest";
import { resolvePaymentProviderMode } from "./adapter";
import { createSandboxPaymentAdapter } from "./sandbox-adapter";

describe("payment adapter boundary", () => {
  it("fails closed in production without an approved provider and never permits sandbox production payments", () => {
    expect(resolvePaymentProviderMode({ environment: "development", approvedProviderConfigured: false, sandboxEnabled: true })).toBe("sandbox");
    expect(resolvePaymentProviderMode({ environment: "test", approvedProviderConfigured: false, sandboxEnabled: true })).toBe("sandbox");
    expect(resolvePaymentProviderMode({ environment: "production", approvedProviderConfigured: false, sandboxEnabled: true })).toBe("unavailable");
    expect(resolvePaymentProviderMode({ environment: "production", approvedProviderConfigured: true, sandboxEnabled: true })).toBe("provider");
  });

  it("creates deterministic opaque customer and payment-method references without retaining raw card fields", async () => {
    const adapter = createSandboxPaymentAdapter({ webhookSecret: "slice-10-ci-secret" });
    const customer = await adapter.createCustomer({ accountPublicId: "acct_public_123", idempotencyKey: "customer-1" });
    const method = await adapter.tokenizePaymentMethod({ customerRef: customer.customerRef, syntheticMethodNonce: "sandbox-visa", idempotencyKey: "method-1" });

    expect(customer.customerRef).toMatch(/^cus_sbx_[0-9a-f]{24}$/);
    expect(method.paymentMethodRef).toMatch(/^pm_sbx_[0-9a-f]{24}$/);
    expect(JSON.stringify({ customer, method })).not.toMatch(/4242|cvv|pan|cardNumber/i);

    await expect(adapter.tokenizePaymentMethod({
      customerRef: customer.customerRef,
      syntheticMethodNonce: "sandbox-visa",
      idempotencyKey: "method-raw",
      pan: "4242424242424242",
      cvv: "123",
    } as never)).rejects.toThrow(/raw card/i);
  });

  it("makes authorization and capture idempotent while preserving requested versus captured state", async () => {
    const adapter = createSandboxPaymentAdapter({ webhookSecret: "slice-10-ci-secret" });
    const customer = await adapter.createCustomer({ accountPublicId: "acct_public_456", idempotencyKey: "customer-2" });
    const method = await adapter.tokenizePaymentMethod({ customerRef: customer.customerRef, syntheticMethodNonce: "sandbox-visa", idempotencyKey: "method-2" });
    const input = {
      customerRef: customer.customerRef,
      paymentMethodRef: method.paymentMethodRef,
      amountMinor: 2500,
      currency: "USD",
      capture: false,
      idempotencyKey: "authorize-1",
    } as const;

    const first = await adapter.authorizeOrCharge(input);
    const retry = await adapter.authorizeOrCharge(input);
    expect(retry).toEqual(first);
    expect(first.transactionRef).toMatch(/^txn_sbx_[0-9a-f]{24}$/);
    expect(first.state).toBe("authorized");
    expect(first.authorizedMinor).toBe(2500);
    expect(first.capturedMinor).toBe(0);

    const captured = await adapter.capture({ transactionRef: first.transactionRef, idempotencyKey: "capture-1" });
    const captureRetry = await adapter.capture({ transactionRef: first.transactionRef, idempotencyKey: "capture-1" });
    expect(captureRetry).toEqual(captured);
    expect(captured.state).toBe("captured");
    expect(captured.capturedMinor).toBe(2500);
  });

  it("makes refunds idempotent and never refunds more than captured value", async () => {
    const adapter = createSandboxPaymentAdapter({ webhookSecret: "slice-10-ci-secret" });
    const customer = await adapter.createCustomer({ accountPublicId: "acct_public_789", idempotencyKey: "customer-3" });
    const method = await adapter.tokenizePaymentMethod({ customerRef: customer.customerRef, syntheticMethodNonce: "sandbox-visa", idempotencyKey: "method-3" });
    const charged = await adapter.authorizeOrCharge({ customerRef: customer.customerRef, paymentMethodRef: method.paymentMethodRef, amountMinor: 4000, currency: "USD", capture: true, idempotencyKey: "charge-1" });

    const refunded = await adapter.refund({ transactionRef: charged.transactionRef, amountMinor: 1500, idempotencyKey: "refund-1" });
    const retry = await adapter.refund({ transactionRef: charged.transactionRef, amountMinor: 1500, idempotencyKey: "refund-1" });
    expect(retry).toEqual(refunded);
    expect(refunded.refundedMinor).toBe(1500);
    expect(refunded.state).toBe("partially_refunded");

    await expect(adapter.refund({ transactionRef: charged.transactionRef, amountMinor: 3000, idempotencyKey: "refund-too-much" })).rejects.toThrow(/captured/i);
  });

  it("verifies deterministic signed sandbox webhooks and exposes no secret in normalized events", async () => {
    const adapter = createSandboxPaymentAdapter({ webhookSecret: "slice-10-ci-secret" });
    const envelope = adapter.createSyntheticWebhook({
      eventId: "evt-1",
      transactionRef: "txn_sbx_0123456789abcdef01234567",
      state: "captured",
      occurredAt: "2026-08-31T12:00:00.000Z",
    });
    const verified = await adapter.verifyWebhook(envelope);
    expect(verified).toEqual({
      eventId: "evt-1",
      transactionRef: "txn_sbx_0123456789abcdef01234567",
      state: "captured",
      occurredAt: "2026-08-31T12:00:00.000Z",
      synthetic: true,
    });
    expect(JSON.stringify(verified)).not.toContain("slice-10-ci-secret");

    await expect(adapter.verifyWebhook({ ...envelope, signature: `${envelope.signature}tampered` })).rejects.toThrow(/signature/i);
  });

  it("returns the durable sandbox transaction view by opaque reference", async () => {
    const adapter = createSandboxPaymentAdapter({ webhookSecret: "slice-10-ci-secret" });
    const customer = await adapter.createCustomer({ accountPublicId: "acct_public_999", idempotencyKey: "customer-4" });
    const method = await adapter.tokenizePaymentMethod({ customerRef: customer.customerRef, syntheticMethodNonce: "sandbox-visa", idempotencyKey: "method-4" });
    const charged = await adapter.authorizeOrCharge({ customerRef: customer.customerRef, paymentMethodRef: method.paymentMethodRef, amountMinor: 9900, currency: "EUR", capture: true, idempotencyKey: "charge-2" });
    expect(await adapter.getTransaction(charged.transactionRef)).toEqual(charged);
  });
});
