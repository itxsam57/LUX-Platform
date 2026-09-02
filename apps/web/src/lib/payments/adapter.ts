import type { PaymentProviderEnvironment, PaymentProviderMode } from "./types";

export function resolvePaymentProviderMode({
  environment,
  approvedProviderConfigured,
  sandboxEnabled,
}: {
  environment: PaymentProviderEnvironment;
  approvedProviderConfigured: boolean;
  sandboxEnabled: boolean;
}): PaymentProviderMode {
  if (environment === "production") {
    return approvedProviderConfigured ? "provider" : "unavailable";
  }

  if (approvedProviderConfigured) return "provider";
  return sandboxEnabled ? "sandbox" : "unavailable";
}
