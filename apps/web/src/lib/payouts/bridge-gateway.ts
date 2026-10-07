import type { ProviderBridgeConfig, ProviderFetch } from "../providers/bridge";
import { createProviderBridgeClient } from "../providers/bridge";
import type {
  NormalizedPayoutProviderEvent,
  NormalizedPayoutRecipientEvent,
  PayoutDispatchRequest,
  PayoutDispatchResult,
  PayoutGatewayAdapter,
  PayoutRecipientOnboardingRequest,
  PayoutRecipientOnboardingSession,
} from "./gateway";

const PAYOUT_ID = /^pay[0-9a-f]{24}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,254}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function ref(value: unknown) {
  return typeof value === "string" && SAFE_REF.test(value) ? value : null;
}
function occurred(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function createBridgePayoutGatewayAdapter(
  config: ProviderBridgeConfig,
  fetchImpl?: ProviderFetch,
): PayoutGatewayAdapter {
  const client = createProviderBridgeClient(config, fetchImpl);
  return {
    providerKey: config.providerKey,
    providerLabel: config.providerLabel,

    async createRecipientOnboarding(input: PayoutRecipientOnboardingRequest): Promise<PayoutRecipientOnboardingSession> {
      if (!UUID.test(input.subjectId) || !/^https:\/\//.test(input.returnUrl) || input.idempotencyKey.trim().length < 8) {
        throw new Error("Invalid payout recipient onboarding request.");
      }
      const raw = object(await client.request("/v1/payouts/recipients/onboarding", {
        body: input,
        idempotencyKey: input.idempotencyKey,
      }));
      const recipientReference = ref(raw?.recipientReference);
      const onboardingUrl = typeof raw?.onboardingUrl === "string" && /^https:\/\//.test(raw.onboardingUrl) ? raw.onboardingUrl : null;
      const expiresAt = occurred(raw?.expiresAt);
      if (!recipientReference || !onboardingUrl || !expiresAt) throw new Error("Invalid payout recipient onboarding response.");
      return { providerKey: config.providerKey, recipientReference, onboardingUrl, expiresAt };
    },

    async verifyRecipientWebhook(input): Promise<NormalizedPayoutRecipientEvent> {
      if (!input.signature?.trim() || !input.rawBody) throw new Error("Payout recipient webhook signature is required.");
      const raw = object(await client.request("/v1/payouts/recipients/webhooks/verify", {
        body: {
          rawBody: input.rawBody,
          signature: input.signature,
          webhookSecret: config.webhookSecret,
        },
      }));
      const eventId = ref(raw?.eventId);
      const subjectId = typeof raw?.subjectId === "string" && UUID.test(raw.subjectId) ? raw.subjectId : null;
      const recipientReference = ref(raw?.recipientReference);
      const state = raw?.state === "verified" || raw?.state === "restricted" ? raw.state : null;
      const occurredAt = occurred(raw?.occurredAt);
      if (!eventId || !subjectId || !recipientReference || !state || typeof raw?.ownershipVerified !== "boolean" || !occurredAt) {
        throw new Error("Invalid normalized payout recipient webhook.");
      }
      return {
        providerKey: config.providerKey,
        eventId,
        subjectId,
        recipientReference,
        state,
        ownershipVerified: raw.ownershipVerified,
        occurredAt,
      };
    },

    async dispatch(input: PayoutDispatchRequest): Promise<PayoutDispatchResult> {
      if (!PAYOUT_ID.test(input.payoutPublicId)
        || !ref(input.recipientReference)
        || !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1
        || !/^[A-Z]{3}$/.test(input.currency)
        || input.idempotencyKey.trim().length < 8) {
        throw new Error("Invalid payout dispatch request.");
      }
      const raw = object(await client.request("/v1/payouts/dispatch", {
        body: input,
        idempotencyKey: input.idempotencyKey,
      }));
      const providerPayoutRef = ref(raw?.providerPayoutRef);
      if (!providerPayoutRef || raw?.state !== "processing") throw new Error("Invalid payout provider response.");
      return { providerKey: config.providerKey, providerPayoutRef, state: "processing" };
    },

    async verifyWebhook(input): Promise<NormalizedPayoutProviderEvent> {
      if (!input.signature?.trim() || !input.rawBody) throw new Error("Payout webhook signature is required.");
      const raw = object(await client.request("/v1/payouts/webhooks/verify", {
        body: {
          rawBody: input.rawBody,
          signature: input.signature,
          webhookSecret: config.webhookSecret,
        },
      }));
      const eventId = ref(raw?.eventId);
      const payoutPublicId = typeof raw?.payoutPublicId === "string" && PAYOUT_ID.test(raw.payoutPublicId) ? raw.payoutPublicId : null;
      const providerPayoutRef = ref(raw?.providerPayoutRef);
      const state = raw?.state === "paid" || raw?.state === "failed" ? raw.state : null;
      const reportedAmountMinor = typeof raw?.reportedAmountMinor === "number" && Number.isSafeInteger(raw.reportedAmountMinor) && raw.reportedAmountMinor >= 0
        ? raw.reportedAmountMinor
        : null;
      const occurredAt = occurred(raw?.occurredAt);
      if (!eventId || !payoutPublicId || !providerPayoutRef || !state || reportedAmountMinor === null || !occurredAt) {
        throw new Error("Invalid normalized payout webhook.");
      }
      return { providerKey: config.providerKey, eventId, payoutPublicId, providerPayoutRef, state, reportedAmountMinor, occurredAt };
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
