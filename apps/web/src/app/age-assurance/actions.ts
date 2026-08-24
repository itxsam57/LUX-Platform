"use server";

import { redirect } from "next/navigation";
import {
  normalizeJurisdiction,
  normalizeNextPath,
  validateJurisdiction,
  VIEWER_POLICY_VERSION,
} from "@/lib/auth/policy";
import { requireAuthenticatedViewer } from "@/lib/auth/context";
import { getAgeAssuranceMode } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function confirmAdultAccessAction(formData: FormData) {
  const nextPath = normalizeNextPath(formData.get("next"));
  const jurisdiction = normalizeJurisdiction(formData.get("jurisdiction"));
  const confirmed = formData.get("adult_confirmed") === "on";

  await requireAuthenticatedViewer(`/age-assurance?next=${encodeURIComponent(nextPath)}`);

  if (getAgeAssuranceMode() !== "self_attestation") {
    redirect(`/age-assurance?next=${encodeURIComponent(nextPath)}&error=provider-required`);
  }

  const jurisdictionError = validateJurisdiction(jurisdiction);
  if (!confirmed || jurisdictionError) {
    const error = !confirmed ? "confirmation-required" : "invalid-jurisdiction";
    redirect(`/age-assurance?next=${encodeURIComponent(nextPath)}&error=${error}`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("confirm_adult_attestation", {
    jurisdiction_code: jurisdiction,
    policy_version: VIEWER_POLICY_VERSION,
  });

  if (error) redirect(`/age-assurance?next=${encodeURIComponent(nextPath)}&error=unable-to-record`);
  redirect(nextPath);
}
