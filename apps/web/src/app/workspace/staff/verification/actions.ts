"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth/context";
import { getVerificationProviderRuntime } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verificationSessionMatchesRuntime } from "@/lib/verification/policy";
import {
  INITIAL_WORKSPACE_MUTATION_STATE,
  type WorkspaceMutationState,
} from "@/app/workspace/mutation-state";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESULT_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;

function failure(message: string): WorkspaceMutationState {
  return { status: "error", message };
}

function isUuid(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function reviewerDestination(operation: string) {
  return `/workspace/staff/verification?notice=${encodeURIComponent(operation)}`;
}

export async function reviewVerificationAction(
  previous: WorkspaceMutationState = INITIAL_WORKSPACE_MUTATION_STATE,
  formData: FormData,
): Promise<WorkspaceMutationState> {
  void previous;
  const viewer = await requireWorkspace("staff", "staff-verification");
  if (viewer.context.activeRole !== "reviewer" && viewer.context.activeRole !== "super_admin") {
    return failure("Verification review requires an authorized reviewer workspace.");
  }

  const operation = formData.get("operation");
  const targetUserId = formData.get("target_user_id");
  const level = formData.get("level");
  const sessionId = formData.get("session_id");
  const supabase = await createServerSupabaseClient();

  if (operation === "approve") {
    if (!isUuid(sessionId) || (level !== "v2" && level !== "v3")) {
      return failure("The verification result request is invalid.");
    }

    const { data: session, error: sessionError } = await supabase
      .from("verification_sessions")
      .select("target_level, provider_key, synthetic")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError || !session || session.target_level !== level) {
      return failure("The verification session could not be reviewed safely.");
    }

    const runtime = getVerificationProviderRuntime();
    if (!verificationSessionMatchesRuntime(
      {
        synthetic: session.synthetic === true,
        providerKey: session.provider_key,
      },
      {
        mode: runtime.mode,
        providerKey: runtime.providerKey,
      },
    )) {
      return failure(
        session.synthetic
          ? "Synthetic verification can only be approved in the development/CI verification runtime."
          : "The verification session does not match the configured approved provider.",
      );
    }

    const { error } = await supabase.rpc("apply_verification_result", {
      target_session_id: sessionId,
      decision: "verified",
      requested_result_expires_at: new Date(Date.now() + RESULT_VALIDITY_MS).toISOString(),
      requested_liveness_passed: true,
      requested_risk_screen_passed: true,
      requested_recheck_reason: null,
    });
    if (error) return failure("The verification result could not be applied safely.");
  } else if (operation === "complete_performer") {
    if (!isUuid(targetUserId)) return failure("The performer record target is invalid.");

    const { error } = await supabase.rpc("set_performer_verification_prerequisites", {
      target_user_id: targetUserId,
      record_active: true,
      liveness_expires_at: new Date(Date.now() + RESULT_VALIDITY_MS).toISOString(),
      payout_ownership_verified: true,
    });
    if (error) return failure("The performer prerequisites could not be recorded safely.");
  } else if (operation === "revoke" || operation === "expire") {
    if (!isUuid(targetUserId) || (level !== "v2" && level !== "v3")) {
      return failure("The verification state review request is invalid.");
    }

    const { error } = await supabase.rpc("review_verification_state", {
      target_user_id: targetUserId,
      target_level: level,
      decision: operation === "revoke" ? "revoked" : "expired",
      requested_reason: operation === "revoke" ? "reviewer_revocation" : "reviewer_expiry",
    });
    if (error) return failure("The verification state could not be reviewed safely.");
  } else {
    return failure("That verification review operation is not supported.");
  }

  revalidatePath("/workspace/staff/verification");
  revalidatePath("/settings/verification");
  return {
    status: "success",
    message: "Verification review completed.",
    destination: reviewerDestination(String(operation)),
  };
}