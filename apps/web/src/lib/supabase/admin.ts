import { createClient } from "@supabase/supabase-js";
import { getServiceSupabaseConfig } from "./env";

export function createServiceSupabaseClient() {
  const { url, serviceRoleKey } = getServiceSupabaseConfig();
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "x-lux-server-role": "provider-orchestration",
      },
    },
  });
}
