"use server";

import { requireAuthenticatedViewer } from "@/lib/auth/context";
import { normalizeHandle, validateHandle } from "@/lib/profile/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PrivacyActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_PRIVACY_ACTION_STATE: PrivacyActionState = { status: "idle", message: "" };

function error(message: string): PrivacyActionState {
  return { status: "error", message };
}

export async function setSupporterPrivacyAction(
  previous: PrivacyActionState = INITIAL_PRIVACY_ACTION_STATE,
  formData: FormData,
): Promise<PrivacyActionState> {
  void previous;
  await requireAuthenticatedViewer("/settings/privacy");
  const anonymousByDefault = formData.get("anonymous_by_default") === "on";
  const supabase = await createServerSupabaseClient();
  const { error: rpcError } = await supabase.rpc("set_supporter_privacy", {
    anonymous_by_default: anonymousByDefault,
  });
  if (rpcError) return error("The supporter privacy preference could not be saved safely.");
  return { status: "success", message: anonymousByDefault ? "Support defaults to anonymous." : "Support may use your public profile by default." };
}

export async function submitDeletionRequestAction(
  previous: PrivacyActionState = INITIAL_PRIVACY_ACTION_STATE,
  formData: FormData,
): Promise<PrivacyActionState> {
  void previous;
  await requireAuthenticatedViewer("/settings/privacy");
  if (formData.get("confirmation") !== "DELETE MY LUX ACCOUNT") {
    return error("Type DELETE MY LUX ACCOUNT exactly before submitting a deletion request.");
  }
  const supabase = await createServerSupabaseClient();
  const { error: rpcError } = await supabase.rpc("submit_account_deletion_request");
  if (rpcError) return error("The deletion request could not be recorded safely.");
  return { status: "success", message: "Account deletion request submitted. Repeating this action will not create a duplicate active request." };
}

export async function cancelDeletionRequestAction(
  previous: PrivacyActionState = INITIAL_PRIVACY_ACTION_STATE,
  _formData: FormData,
): Promise<PrivacyActionState> {
  void previous;
  await requireAuthenticatedViewer("/settings/privacy");
  const supabase = await createServerSupabaseClient();
  const { data, error: rpcError } = await supabase.rpc("cancel_account_deletion_request");
  if (rpcError) return error("The deletion request could not be cancelled safely.");
  return { status: "success", message: data ? "Deletion request cancelled." : "There is no submitted deletion request to cancel." };
}

export async function removePrivateRelationshipAction(
  previous: PrivacyActionState = INITIAL_PRIVACY_ACTION_STATE,
  formData: FormData,
): Promise<PrivacyActionState> {
  void previous;
  await requireAuthenticatedViewer("/settings/privacy");
  const handle = normalizeHandle(String(formData.get("target_handle") ?? ""));
  const relationshipAction = String(formData.get("relationship_action") ?? "");
  if (validateHandle(handle) || (relationshipAction !== "unblock" && relationshipAction !== "unmute")) {
    return error("That privacy relationship could not be identified safely.");
  }
  const supabase = await createServerSupabaseClient();
  const { error: rpcError } = await supabase.rpc("set_profile_relationship", {
    target_handle: handle,
    relationship_action: relationshipAction,
  });
  if (rpcError) return error("The privacy relationship could not be removed safely.");
  return { status: "success", message: relationshipAction === "unblock" ? `@${handle} unblocked.` : `@${handle} unmuted.` };
}
