"use server";

import { requireAdultViewer, requireWorkspace } from "@/lib/auth/context";
import {
  isAppRole,
  isSelfRequestableRole,
  routeForRole,
} from "@/lib/auth/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceMutationState = {
  status: "idle" | "success" | "error";
  message: string;
  destination?: string;
};

export const INITIAL_WORKSPACE_MUTATION_STATE: WorkspaceMutationState = {
  status: "idle",
  message: "",
};

function mutationError(message: string): WorkspaceMutationState {
  return { status: "error", message };
}

export async function requestWorkspaceRoleAction(
  previous: WorkspaceMutationState = INITIAL_WORKSPACE_MUTATION_STATE,
  formData: FormData,
): Promise<WorkspaceMutationState> {
  void previous;
  await requireAdultViewer("/workspace");
  const rawRole = formData.get("role");
  if (!isAppRole(rawRole) || !isSelfRequestableRole(rawRole)) {
    return mutationError("That workspace role cannot be requested from this account.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("request_workspace_role", { requested_role: rawRole });
  if (error) return mutationError("The workspace request could not be completed safely.");

  return {
    status: "success",
    message: `${rawRole} access requested.`,
    destination: `/workspace?notice=${rawRole}-requested`,
  };
}

export async function activateWorkspaceAction(
  previous: WorkspaceMutationState = INITIAL_WORKSPACE_MUTATION_STATE,
  formData: FormData,
): Promise<WorkspaceMutationState> {
  void previous;
  await requireAdultViewer("/workspace");
  const membershipId = formData.get("membership_id");
  if (typeof membershipId !== "string" || !UUID_PATTERN.test(membershipId)) {
    return mutationError("The selected workspace membership is invalid.");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("activate_workspace", {
    target_membership_id: membershipId,
  });
  if (error || !isAppRole(data)) {
    return mutationError("That workspace is not approved for this account.");
  }

  return {
    status: "success",
    message: `${data} workspace activated.`,
    destination: routeForRole(data),
  };
}

export async function reviewWorkspaceRequestAction(
  previous: WorkspaceMutationState = INITIAL_WORKSPACE_MUTATION_STATE,
  formData: FormData,
): Promise<WorkspaceMutationState> {
  void previous;
  await requireWorkspace("staff", "staff-role-requests");
  const membershipId = formData.get("membership_id");
  const decision = formData.get("decision");
  if (
    typeof membershipId !== "string"
    || !UUID_PATTERN.test(membershipId)
    || (decision !== "approved" && decision !== "rejected")
  ) {
    return mutationError("The role-review request is invalid.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("review_workspace_request", {
    target_membership_id: membershipId,
    decision,
  });
  if (error) return mutationError("The role request could not be reviewed safely.");

  return {
    status: "success",
    message: `Request ${decision}.`,
    destination: `/workspace/staff/role-requests?notice=${decision}`,
  };
}
