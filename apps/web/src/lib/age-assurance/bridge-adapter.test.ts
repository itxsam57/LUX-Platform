import { describe, expect, it, vi } from "vitest";
import { normalizeProviderBridgeConfig } from "../providers/bridge";
import { createBridgeAgeAssuranceAdapter } from "./bridge-adapter";

const config = normalizeProviderBridgeConfig({
  providerKey: "age_one",
  providerLabel: "Age One",
  baseUrl: "https://age.example",
  apiKey: "api-key-123",
  webhookSecret: "webhook-secret-123",
  webhookSignatureHeader: "x-age-signature",
}, "production");

describe("bridge age assurance adapter", () => {
  it("creates hosted age assurance sessions", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      sessionReference: "age_session_123",
      launchUrl: "https://age-check.example/session/123",
      expiresAt: "2026-10-07T15:00:00.000Z",
    }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createBridgeAgeAssuranceAdapter(config, fetchImpl);
    await expect(adapter.createSession({
      subjectId: "26000000-0000-4000-8000-000000000001",
      jurisdictionCode: "PK",
      returnUrl: "https://lux.example/age-assurance",
      policyVersion: "lux-adult-v1",
    })).resolves.toMatchObject({ providerKey: "age_one" });
  });

  it("returns only normalized assurance facts", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      eventId: "evt_age_123",
      providerReference: "age_session_123",
      subjectId: "26000000-0000-4000-8000-000000000001",
      jurisdictionCode: "PK",
      status: "accepted",
      expiresAt: "2027-10-07T00:00:00.000Z",
      occurredAt: "2026-10-07T14:00:00.000Z",
    }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createBridgeAgeAssuranceAdapter(config, fetchImpl);
    const result = await adapter.verifyWebhook({ rawBody: "{}", signature: "sig" });
    expect(result.status).toBe("accepted");
    expect(JSON.stringify(result)).not.toMatch(/document|birth|dob|image/i);
  });
});
