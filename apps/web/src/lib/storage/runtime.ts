import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorageProviderBridgeConfig } from "../supabase/env";
import { createBridgeStorageAdapter, createSupabaseStorageAdapter } from "./adapter";

export function getConfiguredStorageAdapter(supabase: SupabaseClient) {
  const config = getStorageProviderBridgeConfig();
  return config ? createBridgeStorageAdapter(config) : createSupabaseStorageAdapter(supabase);
}
