import type { AgeAssuranceMode } from "../auth/policy";
import { resolvePaymentProviderMode } from "../payments/adapter";
import type { PaymentProviderEnvironment, PaymentProviderMode } from "../payments/types";
import { normalizeProviderBridgeConfig, type ProviderBridgeConfig } from "../providers/bridge";
import { resolveVerificationProviderMode } from "../verification/policy";
import type {
  VerificationProviderEnvironment,
  VerificationProviderMode,
} from "../verification/types";

export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

export type VerificationProviderRuntime = {
  environment: VerificationProviderEnvironment;
  mode: VerificationProviderMode;
  providerKey: string | null;
};

export type PaymentProviderRuntime = {
  environment: PaymentProviderEnvironment;
  mode: PaymentProviderMode;
  providerKey: string | null;
};

export type PayoutProviderRuntime = {
  environment: PaymentProviderEnvironment;
  mode: "provider" | "unavailable";
  providerKey: string | null;
};

export type AgeAssuranceProviderRuntime = {
  environment: VerificationProviderEnvironment;
  mode: "provider" | "unavailable";
  providerKey: string | null;
};

export function getPublicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:30002").replace(/\/$/, "");
}

export function getAgeAssuranceMode(): AgeAssuranceMode {
  return process.env.AGE_ASSURANCE_MODE === "self_attestation"
    ? "self_attestation"
    : "provider_required";
}

function isLoopbackAppUrl(appUrl: string): boolean {
  try {
    const hostname = new URL(appUrl).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function resolveEnvironment(
  override: string | undefined,
): "development" | "test" | "production" {
  const explicitTestOverride = override === "test";
  const ciLoopbackRuntime = process.env.CI === "true" && isLoopbackAppUrl(getPublicAppUrl());
  if (explicitTestOverride && ciLoopbackRuntime) return "test";
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

function getVerificationEnvironment(): VerificationProviderEnvironment {
  return resolveEnvironment(process.env.IDENTITY_VERIFICATION_ENVIRONMENT);
}

function getPaymentEnvironment(): PaymentProviderEnvironment {
  return resolveEnvironment(process.env.PAYMENT_ENVIRONMENT);
}

function getPayoutEnvironment(): PaymentProviderEnvironment {
  return resolveEnvironment(process.env.PAYOUT_ENVIRONMENT);
}

function getAgeAssuranceEnvironment(): VerificationProviderEnvironment {
  return resolveEnvironment(process.env.AGE_ASSURANCE_ENVIRONMENT);
}

function hasBridgeConfiguration(prefix: "PAYMENT" | "PAYOUT" | "IDENTITY_VERIFICATION" | "AGE_ASSURANCE" | "STORAGE" | "STREAMING" | "MODERATION" | "MEDIA_PROTECTION") {
  return Boolean(
    process.env[`${prefix}_PROVIDER`]?.trim()
    && process.env[`${prefix}_PROVIDER_BASE_URL`]?.trim()
    && process.env[`${prefix}_PROVIDER_API_KEY`]?.trim()
    && process.env[`${prefix}_PROVIDER_WEBHOOK_SECRET`]?.trim(),
  );
}

function hasProviderServerRuntime() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function hasValidBridgeConfiguration(
  prefix: "PAYMENT" | "PAYOUT" | "IDENTITY_VERIFICATION" | "AGE_ASSURANCE" | "STORAGE" | "STREAMING" | "MODERATION" | "MEDIA_PROTECTION",
  environment: "development" | "test" | "production",
) {
  if (!hasBridgeConfiguration(prefix) || !hasProviderServerRuntime()) return false;
  try {
    getBridgeConfig(prefix, environment);
    return true;
  } catch {
    return false;
  }
}

function getBridgeConfig(
  prefix: "PAYMENT" | "PAYOUT" | "IDENTITY_VERIFICATION" | "AGE_ASSURANCE" | "STORAGE" | "STREAMING" | "MODERATION" | "MEDIA_PROTECTION",
  environment: "development" | "test" | "production",
): ProviderBridgeConfig {
  const providerKey = process.env[`${prefix}_PROVIDER`]?.trim() || "";
  const providerLabel = process.env[`${prefix}_PROVIDER_LABEL`]?.trim() || providerKey;
  const baseUrl = process.env[`${prefix}_PROVIDER_BASE_URL`]?.trim() || "";
  const apiKey = process.env[`${prefix}_PROVIDER_API_KEY`]?.trim() || "";
  const webhookSecret = process.env[`${prefix}_PROVIDER_WEBHOOK_SECRET`]?.trim() || "";
  const webhookSignatureHeader = process.env[`${prefix}_PROVIDER_WEBHOOK_SIGNATURE_HEADER`]?.trim() || "x-provider-signature";
  return normalizeProviderBridgeConfig({
    providerKey,
    providerLabel,
    baseUrl,
    apiKey,
    webhookSecret,
    webhookSignatureHeader,
  }, environment);
}

export function getVerificationProviderRuntime(): VerificationProviderRuntime {
  const environment = getVerificationEnvironment();
  const providerKey = process.env.IDENTITY_VERIFICATION_PROVIDER?.trim() || null;
  const syntheticEnabled = process.env.IDENTITY_VERIFICATION_MODE === "synthetic";
  return {
    environment,
    providerKey,
    mode: resolveVerificationProviderMode({
      environment,
      approvedProviderConfigured: hasValidBridgeConfiguration("IDENTITY_VERIFICATION", environment),
      syntheticEnabled,
    }),
  };
}

export function getVerificationProviderBridgeConfig() {
  return getBridgeConfig("IDENTITY_VERIFICATION", getVerificationEnvironment());
}

export function getPaymentProviderRuntime(): PaymentProviderRuntime {
  const environment = getPaymentEnvironment();
  const providerKey = process.env.PAYMENT_PROVIDER?.trim() || null;
  const sandboxEnabled = process.env.PAYMENT_MODE === "sandbox";
  return {
    environment,
    providerKey,
    mode: resolvePaymentProviderMode({
      environment,
      approvedProviderConfigured: hasValidBridgeConfiguration("PAYMENT", environment),
      sandboxEnabled,
    }),
  };
}

export function getPaymentProviderBridgeConfig() {
  return getBridgeConfig("PAYMENT", getPaymentEnvironment());
}

export function getPayoutProviderRuntime(): PayoutProviderRuntime {
  const environment = getPayoutEnvironment();
  const providerKey = process.env.PAYOUT_PROVIDER?.trim() || null;
  return {
    environment,
    providerKey,
    mode: hasValidBridgeConfiguration("PAYOUT", environment) ? "provider" : "unavailable",
  };
}

export function getPayoutProviderBridgeConfig() {
  return getBridgeConfig("PAYOUT", getPayoutEnvironment());
}

export function getAgeAssuranceProviderRuntime(): AgeAssuranceProviderRuntime {
  const environment = getAgeAssuranceEnvironment();
  const providerKey = process.env.AGE_ASSURANCE_PROVIDER?.trim() || null;
  return {
    environment,
    providerKey,
    mode: getAgeAssuranceMode() === "provider_required" && hasValidBridgeConfiguration("AGE_ASSURANCE", environment)
      ? "provider"
      : "unavailable",
  };
}

export function getAgeAssuranceProviderBridgeConfig() {
  return getBridgeConfig("AGE_ASSURANCE", getAgeAssuranceEnvironment());
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, publishableKey };
}

export function getServiceSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new Error("Supabase service runtime is not configured.");
  return { url, serviceRoleKey };
}

export function isSupabaseConfigured(): boolean {
  try {
    getPublicSupabaseConfig();
    return true;
  } catch {
    return false;
  }
}


export function getStorageProviderBridgeConfig() {
  const environment = resolveEnvironment(process.env.STORAGE_ENVIRONMENT);
  return hasValidBridgeConfiguration("STORAGE", environment)
    ? getBridgeConfig("STORAGE", environment)
    : null;
}

export function getStreamingProviderBridgeConfig() {
  const environment = resolveEnvironment(process.env.STREAMING_ENVIRONMENT);
  return hasValidBridgeConfiguration("STREAMING", environment)
    ? getBridgeConfig("STREAMING", environment)
    : null;
}


export function getModerationProviderBridgeConfig() {
  const environment = resolveEnvironment(process.env.MODERATION_ENVIRONMENT);
  return hasValidBridgeConfiguration("MODERATION", environment)
    ? getBridgeConfig("MODERATION", environment)
    : null;
}

export function getMediaProtectionProviderBridgeConfig() {
  const environment = resolveEnvironment(process.env.MEDIA_PROTECTION_ENVIRONMENT);
  return hasValidBridgeConfiguration("MEDIA_PROTECTION", environment)
    ? getBridgeConfig("MEDIA_PROTECTION", environment)
    : null;
}
