import { describe, expect, it, vi } from "vitest";
import { normalizeProviderBridgeConfig } from "../providers/bridge";
import { createBridgeModerationAdapter, createLocalModerationAdapter } from "./adapter";

describe("moderation adapters", () => {
  it("keeps the local adapter explicit and normalized", async () => {
    const adapter = createLocalModerationAdapter();
    await expect(adapter.screen({
      subject: "demand",
      contentHash: "a".repeat(64),
      text: "Public-safe validated demand text.",
    })).resolves.toEqual({
      providerKey: "lux_local",
      decision: "allow",
      labels: [],
      providerReference: null,
    });
  });

  it("normalizes bridge decisions without persisting raw evidence", async () => {
    const config = normalizeProviderBridgeConfig({
      providerKey: "moderation_one",
      providerLabel: "Moderation One",
      baseUrl: "https://moderation.example",
      apiKey: "api-key-123",
      webhookSecret: "webhook-secret-123",
      webhookSignatureHeader: "x-mod-signature",
    }, "production");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      decision: "review",
      labels: ["policy_review"],
      providerReference: "screen_123",
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await createBridgeModerationAdapter(config, fetchImpl).screen({
      subject: "offer",
      contentHash: "b".repeat(64),
      text: "Offer text sent only to the configured moderation provider.",
    });
    expect(result).toEqual({
      providerKey: "moderation_one",
      decision: "review",
      labels: ["policy_review"],
      providerReference: "screen_123",
    });
  });
});
