import { getPaymentProviderBridgeConfig, getPaymentProviderRuntime } from "../supabase/env";
import { createBridgePaymentGatewayAdapter } from "./bridge-gateway";

export function getConfiguredPaymentGateway() {
  const runtime = getPaymentProviderRuntime();
  if (runtime.mode !== "provider") return null;
  return createBridgePaymentGatewayAdapter(getPaymentProviderBridgeConfig());
}
