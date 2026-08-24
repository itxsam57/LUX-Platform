import type { AgeAssuranceMode } from "../auth/policy";

export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

export function getPublicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:30002").replace(/\/$/, "");
}

export function getAgeAssuranceMode(): AgeAssuranceMode {
  return process.env.AGE_ASSURANCE_MODE === "self_attestation"
    ? "self_attestation"
    : "provider_required";
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  try {
    getPublicSupabaseConfig();
    return true;
  } catch {
    return false;
  }
}
