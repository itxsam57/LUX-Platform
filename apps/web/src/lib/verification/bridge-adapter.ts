import type { ProviderBridgeConfig, ProviderFetch } from "../providers/bridge";
import { createProviderBridgeClient } from "../providers/bridge";
import type { VerificationAdapter } from "./adapter";
import type {
  VerificationCallbackInput,
  VerificationNormalizedResult,
  VerificationSessionDescriptor,
  VerificationSessionRequest,
  VerificationStatus,
  VerificationTargetLevel,
} from "./types";

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,511}$/;
const RESULT_STATES = new Set<Extract<VerificationStatus, "pending" | "needs_review" | "verified" | "rejected">>([
  "pending","needs_review","verified","rejected",
]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function safeReference(value: unknown) {
  return typeof value === "string" && SAFE_REF.test(value) ? value : null;
}
function safeDate(value: unknown, nullable = false): string | null {
  if (nullable && (value === null || value === undefined)) return null;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}
function level(value: unknown): VerificationTargetLevel | null {
  return value === "v2" || value === "v3" ? value : null;
}

export type NormalizedVerificationCallback = {
  eventId: string;
  sessionReference: string;
  occurredAt: string;
  result: VerificationNormalizedResult;
};

export function createBridgeVerificationAdapter(
  config: ProviderBridgeConfig,
  fetchImpl?: ProviderFetch,
): VerificationAdapter & {
  verifyAndNormalizeCallback(input: VerificationCallbackInput): Promise<NormalizedVerificationCallback>;
} {
  const client = createProviderBridgeClient(config, fetchImpl);

  function parseResult(value: unknown): VerificationNormalizedResult {
    const raw = object(value);
    const providerReference = safeReference(raw?.providerReference);
    const targetLevel = level(raw?.targetLevel);
    const status = typeof raw?.status === "string" && RESULT_STATES.has(raw.status as VerificationNormalizedResult["status"])
      ? raw.status as VerificationNormalizedResult["status"]
      : null;
    const expiresAt = safeDate(raw?.expiresAt, true);
    if (!providerReference || !targetLevel || !status
      || typeof raw?.livenessPassed !== "boolean"
      || typeof raw?.riskScreenPassed !== "boolean"
      || (raw?.expiresAt !== null && raw?.expiresAt !== undefined && !expiresAt)) {
      throw new Error("Invalid normalized verification result.");
    }
    return {
      providerKey: config.providerKey,
      providerReference,
      targetLevel,
      status,
      livenessPassed: raw.livenessPassed,
      riskScreenPassed: raw.riskScreenPassed,
      expiresAt,
      synthetic: false,
    };
  }

  return {
    providerKey: config.providerKey,
    providerLabel: config.providerLabel,
    synthetic: false,

    async createSession(request: VerificationSessionRequest): Promise<VerificationSessionDescriptor> {
      if (!request.subjectId.trim() || !/^https:\/\//.test(request.returnUrl)) {
        throw new Error("Invalid verification session request.");
      }
      const raw = object(await client.request("/v1/identity/sessions", {
        body: request,
        idempotencyKey: `identity:${request.subjectId}:${request.targetLevel}`,
      }));
      const sessionReference = safeReference(raw?.sessionReference);
      const launchUrl = typeof raw?.launchUrl === "string" && /^https:\/\//.test(raw.launchUrl) ? raw.launchUrl : null;
      const expiresAt = safeDate(raw?.expiresAt);
      if (!sessionReference || !launchUrl || !expiresAt) throw new Error("Invalid verification provider session response.");
      return {
        providerKey: config.providerKey,
        providerLabel: config.providerLabel,
        sessionReference,
        launchUrl,
        expiresAt,
        synthetic: false,
      };
    },

    async getResult(sessionReference: string): Promise<VerificationNormalizedResult> {
      if (!safeReference(sessionReference)) throw new Error("Invalid verification session reference.");
      return parseResult(await client.request("/v1/identity/results", {
        body: { sessionReference },
      }));
    },

    async verifyCallback(input: VerificationCallbackInput): Promise<boolean> {
      try {
        await this.verifyAndNormalizeCallback(input);
        return true;
      } catch {
        return false;
      }
    },

    async verifyAndNormalizeCallback(input: VerificationCallbackInput): Promise<NormalizedVerificationCallback> {
      if (!input.signature?.trim() || !input.rawBody) throw new Error("Verification callback signature is required.");
      const raw = object(await client.request("/v1/identity/webhooks/verify", {
        body: {
          rawBody: input.rawBody,
          signature: input.signature,
          webhookSecret: config.webhookSecret,
        },
      }));
      const eventId = safeReference(raw?.eventId);
      const sessionReference = safeReference(raw?.sessionReference);
      const occurredAt = safeDate(raw?.occurredAt);
      if (!eventId || !sessionReference || !occurredAt) throw new Error("Invalid verification callback.");
      return { eventId, sessionReference, occurredAt, result: parseResult(raw?.result) };
    },

    async health() {
      const raw = object(await client.request("/v1/health"));
      return {
        providerKey: config.providerKey,
        providerLabel: config.providerLabel,
        configured: true,
        healthy: raw?.healthy === true,
        synthetic: false,
      };
    },
  };
}
