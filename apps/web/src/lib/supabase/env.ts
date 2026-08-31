import type { AgeAssuranceMode } from "../auth/policy";
import type { PaymentProviderEnvironment, PaymentProviderMode } from "../payments/types";
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

function getVerificationEnvironment(): VerificationProviderEnvironment {
  const explicitTestOverride = process.env.IDENTITY_VERIFICATION_ENVIRONMENT === "test";
  const ciLoopbackRuntime = process.env.CI === "true" && isLoopbackAppUrl(getPublicAppUrl());

  if (explicitTestOverride && ciLoopbackRuntime) return "test";
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
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
      approvedProviderConfigured: providerKey !== null,
      syntheticEnabled,
    }),
  };
}

export function getPaymentProviderRuntime(): PaymentProviderRuntime {
  return {
    environment: "production",
    mode: "unavailable",
    providerKey: null,
  };
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

export function isSupabaseConfigured(): boolean {
  try {
    getPublicSupabaseConfig();
    return true;
  } catch {
    return false;
  }
}
