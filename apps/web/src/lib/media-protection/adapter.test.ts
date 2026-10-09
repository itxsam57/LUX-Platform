import { describe, expect, it, vi } from "vitest";
import { normalizeProviderBridgeConfig } from "../providers/bridge";
import { createBridgeMediaProtectionAdapter } from "./adapter";

const config = normalizeProviderBridgeConfig({
  providerKey: "protect_one",
  providerLabel: "Protect One",
  baseUrl: "https://protect.example",
  apiKey: "api-key-123",
  webhookSecret: "webhook-secret-123",
  webhookSignatureHeader: "x-protect-signature",
}, "production");

describe("media protection adapter", () => {
  it("normalizes provider fingerprints", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      providerReference: "fingerprint_123",
      perceptualFingerprint: "phash:8f0a1134de89bc22",
    }), { status: 200 })) as unknown as typeof fetch;
    await expect(createBridgeMediaProtectionAdapter(config, fetchImpl).fingerprint({
      releasePublicId: "rel" + "a".repeat(24),
      bucket: "production-assets",
      objectPath: "prj/source/final.mp4",
      contentSha256: "b".repeat(64),
    })).resolves.toMatchObject({ perceptualFingerprint: "phash:8f0a1134de89bc22" });
  });

  it("normalizes watermark completion references", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      providerReference: "watermark_job_123",
      watermarkReference: "watermark_123",
    }), { status: 200 })) as unknown as typeof fetch;
    await expect(createBridgeMediaProtectionAdapter(config, fetchImpl).watermark({
      releasePublicId: "rel" + "a".repeat(24),
      rightsPublicId: "crg" + "b".repeat(24),
      watermarkJobPublicId: "cwm" + "c".repeat(24),
      bucket: "production-assets",
      objectPath: "prj/source/final.mp4",
      contentSha256: "d".repeat(64),
      perceptualFingerprint: "phash:8f0a1134de89bc22",
    })).resolves.toMatchObject({ watermarkReference: "watermark_123" });
  });
});
