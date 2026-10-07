import type { SupabaseClient } from "@supabase/supabase-js";
import { getStreamingProviderBridgeConfig } from "../supabase/env";
import { createBridgeStreamingAdapter, createSupabaseStreamingAdapter } from "./adapter";

export function getConfiguredStreamingAdapter(supabase: SupabaseClient) {
  const config = getStreamingProviderBridgeConfig();
  return config ? createBridgeStreamingAdapter(config) : createSupabaseStreamingAdapter(supabase);
}
