"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { getPublicAppUrl, getVerificationProviderRuntime } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredVerificationAdapter } from "@/lib/verification/runtime";
import type { VerificationStatus, VerificationTargetLevel } from "@/lib/verification/types";

export type VerificationActionState = {
  status: "idle" | "success" | "error";
  message: string;
  level: VerificationTargetLevel | null;
  verificationStatus: VerificationStatus | null;
};

export type ConsentEducationActionState = {
  status: "idle" | "success" | "error";
  message: string;
  acknowledged: boolean;
};

const INITIAL_VERIFICATION_ACTION_STATE: VerificationActionState = {
  status: "idle",
  message: "",
  level: null,
  verificationStatus: null,
};

function failure(message: string, level: VerificationTargetLevel | null = null): VerificationActionState {
  return {
    status: "error",
    message,
    level,
    verificationStatus: null,
  };
}

function parseTargetLevel(value: FormDataEntryValue | null): VerificationTargetLevel | null {
  return value === "v2" || value === "v3" ? value : null;
}

export async function startVerificationAction(
  previous: VerificationActionState = INITIAL_VERIFICATION_ACTION_STATE,
  formData: FormData,
): Promise<VerificationActionState> {
  void previous;
  const viewer = await requireAdultViewer("/settings/verification");
  const level = parseTargetLevel(formData.get("level"));
  if (!level) return failure("That verification level could not be identified safely.");

  const runtime = getVerificationProviderRuntime();
  if (runtime.mode === "unavailable") {
    return failure(
      "Identity verification is unavailable because an approved production provider is not configured.",
      level,
    );
  }

  let adapter;
  try {
    adapter = getConfiguredVerificationAdapter();
  } catch {
    return failure("The configured identity provider could not be initialized safely.", level);
  }
  let session;
  try {
    session = await adapter.createSession({
      subjectId: viewer.user.id,
      targetLevel: level,
      returnUrl: `${getPublicAppUrl()}/settings/verification`,
    });
  } catch {
    return failure("The verification session could not be created safely.", level);
  }

  const supabase = await createServerSupabaseClient();
  const { error: rpcError } = await supabase.rpc("start_verification", {
    requested_level: level,
    requested_provider_key: session.providerKey,
    requested_provider_reference: session.sessionReference,
    requested_session_expires_at: session.expiresAt,
    requested_synthetic: session.synthetic,
  });

  if (rpcError) {
    if (rpcError.message.includes("v2_verification_required")) {
      return failure("Current V2 identity verification is required before V3 can begin.", level);
    }
    return failure("The verification request could not be recorded safely.", level);
  }

  revalidatePath("/settings/verification");
  if (session.launchUrl) redirect(session.launchUrl);
  return {
    status: "success",
    message: session.synthetic
      ? "Development-only workflow started. Review is still required; this action did not verify the account."
      : "Verification session started.",
    level,
    verificationStatus: "pending",
  };
}

export async function acknowledgeConsentEducationAction(
  previous: ConsentEducationActionState,
  formData: FormData,
): Promise<ConsentEducationActionState> {
  void previous;
  await requireAdultViewer("/settings/verification");
  const policyVersion = formData.get("policy_version");
  if (
    typeof policyVersion !== "string"
    || policyVersion.length < 3
    || policyVersion.length > 80
    || !/^[A-Za-z0-9._-]+$/.test(policyVersion)
  ) {
    return {
      status: "error",
      message: "The consent-education version could not be identified safely.",
      acknowledged: false,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("acknowledge_consent_education", {
    requested_policy_version: policyVersion,
  });
  if (error) {
    return {
      status: "error",
      message: "The consent-education acknowledgement could not be recorded safely.",
      acknowledged: false,
    };
  }

  revalidatePath("/settings/verification");
  return {
    status: "success",
    message: "Consent education acknowledged for the current policy version.",
    acknowledged: true,
  };
}
