import { getMediaProtectionProviderBridgeConfig } from "../supabase/env";
import { createBridgeMediaProtectionAdapter } from "./adapter";

export function getConfiguredMediaProtectionAdapter() {
  const config = getMediaProtectionProviderBridgeConfig();
  return config ? createBridgeMediaProtectionAdapter(config) : null;
}
