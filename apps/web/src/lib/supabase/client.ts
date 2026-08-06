import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./env";

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getPublicSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
