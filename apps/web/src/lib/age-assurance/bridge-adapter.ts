import type { ProviderBridgeConfig, ProviderFetch } from "../providers/bridge";
import { createProviderBridgeClient } from "../providers/bridge";
import type { AgeAssuranceAdapter, AgeAssuranceResult, AgeAssuranceSession, AgeAssuranceSessionRequest } from "./types";

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,511}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function ref(value: unknown) {
  return typeof value === "string" && SAFE_REF.test(value) ? value : null;
}
function date(value: unknown, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function createBridgeAgeAssuranceAdapter(
  config: ProviderBridgeConfig,
  fetchImpl?: ProviderFetch,
): AgeAssuranceAdapter {
  const client = createProviderBridgeClient(config, fetchImpl);
  return {
    providerKey: config.providerKey,
    providerLabel: config.providerLabel,

    async createSession(input: AgeAssuranceSessionRequest): Promise<AgeAssuranceSession> {
      if (!UUID.test(input.subjectId)
        || !/^[A-Z]{2}$/.test(input.jurisdictionCode)
        || !/^https:\/\//.test(input.returnUrl)
        || !/^[A-Za-z0-9._-]{3,80}$/.test(input.policyVersion)) {
        throw new Error("Invalid age assurance session request.");
      }
      const raw = object(await client.request("/v1/age/sessions", {
        body: input,
        idempotencyKey: `age:${input.subjectId}:${input.policyVersion}`,
      }));
      const sessionReference = ref(raw?.sessionReference);
      const launchUrl = typeof raw?.launchUrl === "string" && /^https:\/\//.test(raw.launchUrl) ? raw.launchUrl : null;
      const expiresAt = date(raw?.expiresAt);
      if (!sessionReference || !launchUrl || !expiresAt) throw new Error("Invalid age provider session response.");
      return { providerKey: config.providerKey, sessionReference, launchUrl, expiresAt };
    },

    async verifyWebhook(input): Promise<AgeAssuranceResult> {
      if (!input.signature?.trim() || !input.rawBody) throw new Error("Age assurance webhook signature is required.");
      const raw = object(await client.request("/v1/age/webhooks/verify", {
        body: {
          rawBody: input.rawBody,
          signature: input.signature,
          webhookSecret: config.webhookSecret,
        },
      }));
      const eventId = ref(raw?.eventId);
      const providerReference = ref(raw?.providerReference);
      const subjectId = typeof raw?.subjectId === "string" && UUID.test(raw.subjectId) ? raw.subjectId : null;
      const jurisdictionCode = typeof raw?.jurisdictionCode === "string" && /^[A-Z]{2}$/.test(raw.jurisdictionCode) ? raw.jurisdictionCode : null;
      const status = raw?.status === "accepted" || raw?.status === "rejected" ? raw.status : null;
      const expiresAt = date(raw?.expiresAt, true);
      const occurredAt = date(raw?.occurredAt);
      if (!eventId || !providerReference || !subjectId || !jurisdictionCode || !status || !occurredAt
        || (raw?.expiresAt !== null && raw?.expiresAt !== undefined && !expiresAt)) {
        throw new Error("Invalid normalized age assurance webhook.");
      }
      return { eventId, providerKey: config.providerKey, providerReference, subjectId, jurisdictionCode, status, expiresAt, occurredAt };
    },

    async health() {
      const raw = object(await client.request("/v1/health"));
      return {
        providerKey: config.providerKey,
        providerLabel: config.providerLabel,
        configured: true,
        healthy: raw?.healthy === true,
      };
    },
  };
}
