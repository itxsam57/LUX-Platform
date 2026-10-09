import { getPayoutProviderBridgeConfig, getPayoutProviderRuntime } from "../supabase/env";
import { createBridgePayoutGatewayAdapter } from "./bridge-gateway";

export function getConfiguredPayoutGateway() {
  const runtime = getPayoutProviderRuntime();
  if (runtime.mode !== "provider") return null;
  return createBridgePayoutGatewayAdapter(getPayoutProviderBridgeConfig());
}
