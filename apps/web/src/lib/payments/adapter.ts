import type { PaymentProviderEnvironment, PaymentProviderMode } from "./types";

export function resolvePaymentProviderMode(input: {
  environment: PaymentProviderEnvironment;
  approvedProviderConfigured: boolean;
  sandboxEnabled: boolean;
}): PaymentProviderMode {
  void input;
  return "unavailable";
}
