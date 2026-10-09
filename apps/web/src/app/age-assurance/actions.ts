"use server";

import { redirect } from "next/navigation";
import {
  normalizeJurisdiction,
  normalizeNextPath,
  validateJurisdiction,
  VIEWER_POLICY_VERSION,
} from "@/lib/auth/policy";
import { requireAuthenticatedViewer } from "@/lib/auth/context";
import { getConfiguredAgeAssuranceAdapter } from "@/lib/age-assurance/runtime";
import { getAgeAssuranceMode, getPublicAppUrl } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function confirmAdultAccessAction(formData: FormData) {
  const nextPath = normalizeNextPath(formData.get("next"));
  const jurisdiction = normalizeJurisdiction(formData.get("jurisdiction"));
  const confirmed = formData.get("adult_confirmed") === "on";
  const viewer = await requireAuthenticatedViewer(`/age-assurance?next=${encodeURIComponent(nextPath)}`);

  const mode = getAgeAssuranceMode();
  const jurisdictionError = validateJurisdiction(jurisdiction);
  if (jurisdictionError) {
    redirect(`/age-assurance?next=${encodeURIComponent(nextPath)}&error=invalid-jurisdiction`);
  }

  const supabase = await createServerSupabaseClient();

  if (mode === "provider_required") {
    const adapter = getConfiguredAgeAssuranceAdapter();
    if (!adapter) {
      redirect(`/age-assurance?next=${encodeURIComponent(nextPath)}&error=provider-required`);
    }

    let session;
    try {
      session = await adapter.createSession({
        subjectId: viewer.user.id,
        jurisdictionCode: jurisdiction,
        returnUrl: `${getPublicAppUrl()}/age-assurance?next=${encodeURIComponent(nextPath)}`,
        policyVersion: VIEWER_POLICY_VERSION,
      });
    } catch {
      redirect(`/age-assurance?next=${encodeURIComponent(nextPath)}&error=provider-unavailable`);
    }

    const { error } = await supabase.rpc("start_age_assurance_provider_session", {
      requested_provider_key: session.providerKey,
      requested_provider_reference: session.sessionReference,
      requested_jurisdiction_code: jurisdiction,
      requested_policy_version: VIEWER_POLICY_VERSION,
      requested_session_expires_at: session.expiresAt,
    });
    if (error) {
      redirect(`/age-assurance?next=${encodeURIComponent(nextPath)}&error=unable-to-record`);
    }
    redirect(session.launchUrl);
  }

  if (!confirmed) {
    redirect(`/age-assurance?next=${encodeURIComponent(nextPath)}&error=confirmation-required`);
  }

  const { error } = await supabase.rpc("confirm_adult_attestation", {
    jurisdiction_code: jurisdiction,
    policy_version: VIEWER_POLICY_VERSION,
  });

  if (error) {
    redirect(`/age-assurance?next=${encodeURIComponent(nextPath)}&error=unable-to-record`);
  }
  redirect(nextPath);
}
