import type { ProviderBridgeConfig, ProviderFetch } from "../providers/bridge";
import { createProviderBridgeClient } from "../providers/bridge";

export type ModerationSubject = "demand" | "offer";
export type ModerationDecision = "allow" | "review" | "block";

export type ModerationRequest = {
  subject: ModerationSubject;
  contentHash: string;
  text: string;
};

export type ModerationResult = {
  providerKey: string;
  decision: ModerationDecision;
  labels: string[];
  providerReference: string | null;
};

export interface ModerationAdapter {
  readonly providerKey: string;
  screen(input: ModerationRequest): Promise<ModerationResult>;
}

const HASH = /^[0-9a-f]{64}$/;
const LABEL = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,254}$/;

function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error("invalid_moderation_labels");
  const labels = value.map((item) => typeof item === "string" ? item.trim().toLowerCase() : "");
  if (labels.some((item) => !LABEL.test(item))) throw new Error("invalid_moderation_labels");
  return [...new Set(labels)];
}

export function createLocalModerationAdapter(): ModerationAdapter {
  return {
    providerKey: "lux_local",
    async screen(input) {
      if (!HASH.test(input.contentHash) || !["demand","offer"].includes(input.subject) || !input.text.trim()) {
        throw new Error("invalid_moderation_request");
      }
      return { providerKey: "lux_local", decision: "allow", labels: [], providerReference: null };
    },
  };
}

export function createBridgeModerationAdapter(
  config: ProviderBridgeConfig,
  fetchImpl?: ProviderFetch,
): ModerationAdapter {
  const client = createProviderBridgeClient(config, fetchImpl);
  return {
    providerKey: config.providerKey,
    async screen(input) {
      if (!HASH.test(input.contentHash) || !["demand","offer"].includes(input.subject) || !input.text.trim()) {
        throw new Error("invalid_moderation_request");
      }
      const raw = await client.request<Record<string,unknown>>("/v1/moderation/screen", {
        body: input,
        idempotencyKey: `moderation:${input.contentHash}`,
      });
      const decision = raw.decision === "allow" || raw.decision === "review" || raw.decision === "block" ? raw.decision : null;
      const providerReference = raw.providerReference === null || raw.providerReference === undefined
        ? null
        : typeof raw.providerReference === "string" && REFERENCE.test(raw.providerReference) ? raw.providerReference : undefined;
      if (!decision || providerReference === undefined) throw new Error("invalid_moderation_response");
      return { providerKey: config.providerKey, decision, labels: normalizeLabels(raw.labels ?? []), providerReference };
    },
  };
}
