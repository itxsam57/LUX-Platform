import { getAgeAssuranceProviderBridgeConfig, getAgeAssuranceProviderRuntime } from "../supabase/env";
import { createBridgeAgeAssuranceAdapter } from "./bridge-adapter";

export function getConfiguredAgeAssuranceAdapter() {
  const runtime = getAgeAssuranceProviderRuntime();
  if (runtime.mode !== "provider") return null;
  return createBridgeAgeAssuranceAdapter(getAgeAssuranceProviderBridgeConfig());
}
