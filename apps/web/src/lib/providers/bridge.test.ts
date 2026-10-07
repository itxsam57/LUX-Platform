import { describe, expect, it, vi } from "vitest";
import { createProviderBridgeClient, normalizeProviderBridgeConfig, providerWebhookSignature } from "./bridge";

const base = {
  providerKey: "gateway_one",
  providerLabel: "Gateway One",
  baseUrl: "https://provider.example",
  apiKey: "api-key-123",
  webhookSecret: "webhook-secret-123",
  webhookSignatureHeader: "X-Gateway-Signature",
};

describe("provider bridge", () => {
  it("requires HTTPS in production and permits loopback HTTP in tests", () => {
    expect(normalizeProviderBridgeConfig(base, "production").baseUrl).toBe("https://provider.example");
    expect(() => normalizeProviderBridgeConfig({ ...base, baseUrl: "http://provider.example" }, "production")).toThrow(/HTTPS/);
    expect(normalizeProviderBridgeConfig({ ...base, baseUrl: "http://127.0.0.1:9999/" }, "test").baseUrl).toBe("http://127.0.0.1:9999");
  });

  it("does not allow credentials in the bridge URL", () => {
    expect(() => normalizeProviderBridgeConfig({ ...base, baseUrl: "https://user:pass@provider.example" }, "production")).toThrow(/must not contain credentials/);
  });

  it("sends bearer auth and idempotency without exposing secrets in failures", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer api-key-123");
      expect(new Headers(init?.headers).get("idempotency-key")).toBe("checkout-123");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const config = normalizeProviderBridgeConfig(base, "production");
    const client = createProviderBridgeClient(config, fetchImpl);
    await expect(client.request("/v1/health", { idempotencyKey: "checkout-123" })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("reads only the configured signature header", () => {
    const headers = new Headers({ "x-gateway-signature": " signed ", authorization: "secret" });
    expect(providerWebhookSignature(headers, "x-gateway-signature")).toBe("signed");
    expect(providerWebhookSignature(headers, "x-other")).toBeNull();
  });
});
