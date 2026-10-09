import type { ProviderBridgeConfig, ProviderFetch } from "../providers/bridge";
import { createProviderBridgeClient } from "../providers/bridge";

export type MediaProtectionSource = {
  releasePublicId: string;
  bucket: string;
  objectPath: string;
  contentSha256: string;
};

export type FingerprintResult = {
  providerKey: string;
  providerReference: string;
  perceptualFingerprint: string;
};

export type WatermarkRequest = MediaProtectionSource & {
  rightsPublicId: string;
  watermarkJobPublicId: string;
  perceptualFingerprint: string;
};

export type WatermarkResult = {
  providerKey: string;
  providerReference: string;
  watermarkReference: string;
};

export interface MediaProtectionAdapter {
  readonly providerKey: string;
  fingerprint(input: MediaProtectionSource): Promise<FingerprintResult>;
  watermark(input: WatermarkRequest): Promise<WatermarkResult>;
}

const SHA = /^[0-9a-f]{64}$/;
const RELEASE = /^rel[0-9a-f]{24}$/;
const RIGHTS = /^crg[0-9a-f]{24}$/;
const JOB = /^cwm[0-9a-f]{24}$/;
const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}:[0-9a-f]{16,128}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,179}$/;

function validateSource(input: MediaProtectionSource) {
  if (!RELEASE.test(input.releasePublicId)
    || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.bucket)
    || !input.objectPath || input.objectPath.startsWith("/") || input.objectPath.includes("..")
    || !SHA.test(input.contentSha256)) {
    throw new Error("invalid_media_protection_source");
  }
}

export function createBridgeMediaProtectionAdapter(
  config: ProviderBridgeConfig,
  fetchImpl?: ProviderFetch,
): MediaProtectionAdapter {
  const client = createProviderBridgeClient(config, fetchImpl);
  return {
    providerKey: config.providerKey,

    async fingerprint(input) {
      validateSource(input);
      const raw = await client.request<Record<string,unknown>>("/v1/media-protection/fingerprint", {
        body: input,
        idempotencyKey: `fingerprint:${input.releasePublicId}:${input.contentSha256}`,
      });
      const providerReference = typeof raw.providerReference === "string" && REF.test(raw.providerReference)
        ? raw.providerReference
        : null;
      const perceptualFingerprint = typeof raw.perceptualFingerprint === "string" && FINGERPRINT.test(raw.perceptualFingerprint)
        ? raw.perceptualFingerprint
        : null;
      if (!providerReference || !perceptualFingerprint) throw new Error("invalid_media_protection_fingerprint");
      return { providerKey: config.providerKey, providerReference, perceptualFingerprint };
    },

    async watermark(input) {
      validateSource(input);
      if (!RIGHTS.test(input.rightsPublicId) || !JOB.test(input.watermarkJobPublicId) || !FINGERPRINT.test(input.perceptualFingerprint)) {
        throw new Error("invalid_watermark_request");
      }
      const raw = await client.request<Record<string,unknown>>("/v1/media-protection/watermark", {
        body: input,
        idempotencyKey: `watermark:${input.watermarkJobPublicId}`,
      });
      const providerReference = typeof raw.providerReference === "string" && REF.test(raw.providerReference)
        ? raw.providerReference
        : null;
      const watermarkReference = typeof raw.watermarkReference === "string" && REF.test(raw.watermarkReference)
        ? raw.watermarkReference
        : null;
      if (!providerReference || !watermarkReference) throw new Error("invalid_watermark_response");
      return { providerKey: config.providerKey, providerReference, watermarkReference };
    },
  };
}
