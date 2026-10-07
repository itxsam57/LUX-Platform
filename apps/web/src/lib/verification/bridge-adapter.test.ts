import { describe, expect, it, vi } from "vitest";
import { normalizeProviderBridgeConfig } from "../providers/bridge";
import { createBridgeVerificationAdapter } from "./bridge-adapter";

const config = normalizeProviderBridgeConfig({
  providerKey: "identity_one",
  providerLabel: "Identity One",
  baseUrl: "https://identity.example",
  apiKey: "api-key-123",
  webhookSecret: "webhook-secret-123",
  webhookSignatureHeader: "x-id-signature",
}, "production");

describe("bridge verification adapter", () => {
  it("creates an external verification launch session", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      sessionReference: "verify_123",
      launchUrl: "https://verify.example/session/123",
      expiresAt: "2026-10-07T14:00:00.000Z",
    }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createBridgeVerificationAdapter(config, fetchImpl);
    await expect(adapter.createSession({
      subjectId: "user-123",
      targetLevel: "v2",
      returnUrl: "https://lux.example/settings/verification",
    })).resolves.toMatchObject({ providerKey: "identity_one", synthetic: false });
  });

  it("normalizes verified provider callbacks without raw evidence", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      eventId: "evt_123",
      sessionReference: "verify_123",
      occurredAt: "2026-10-07T14:00:00.000Z",
      result: {
        providerReference: "verify_123",
        targetLevel: "v2",
        status: "verified",
        livenessPassed: true,
        riskScreenPassed: true,
        expiresAt: "2027-10-07T00:00:00.000Z",
      },
    }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createBridgeVerificationAdapter(config, fetchImpl);
    const callback = await adapter.verifyAndNormalizeCallback({ rawBody: "{}", signature: "sig" });
    expect(callback.result).toEqual({
      providerKey: "identity_one",
      providerReference: "verify_123",
      targetLevel: "v2",
      status: "verified",
      livenessPassed: true,
      riskScreenPassed: true,
      expiresAt: "2027-10-07T00:00:00.000Z",
      synthetic: false,
    });
    expect(JSON.stringify(callback)).not.toMatch(/document|selfie|image|dob/i);
  });
});
