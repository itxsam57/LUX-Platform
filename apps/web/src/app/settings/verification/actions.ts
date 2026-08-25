"use server";

import { revalidatePath } from "next/cache";
import { requireAdultViewer } from "@/lib/auth/context";
import { getPublicAppUrl, getVerificationProviderRuntime } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSyntheticVerificationAdapter } from "@/lib/verification/synthetic-adapter";
import type { VerificationStatus, VerificationTargetLevel } from "@/lib/verification/types";

export type VerificationActionState = {
  status: "idle" | "success" | "error";
  message: string;
  level: VerificationTargetLevel | null;
  verificationStatus: VerificationStatus | null;
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

  if (runtime.mode !== "synthetic") {
    return failure(
      "The configured production identity provider adapter is not available in this build.",
      level,
    );
  }

  const adapter = createSyntheticVerificationAdapter();
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
  return {
    status: "success",
    message: "Development-only workflow started. Review is still required; this action did not verify the account.",
    level,
    verificationStatus: "pending",
  };
}
