"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer, requireWorkspace } from "@/lib/auth/context";
import {
  isAppRole,
  isSelfRequestableRole,
  routeForRole,
} from "@/lib/auth/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requestWorkspaceRoleAction(formData: FormData) {
  await requireAdultViewer("/workspace");
  const rawRole = formData.get("role");
  if (!isAppRole(rawRole) || !isSelfRequestableRole(rawRole)) {
    redirect("/workspace?error=role-not-requestable");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("request_workspace_role", { requested_role: rawRole });
  if (error) redirect("/workspace?error=role-request-failed");

  revalidatePath("/workspace");
  redirect(`/workspace?notice=${rawRole}-requested`);
}

export async function activateWorkspaceAction(formData: FormData) {
  await requireAdultViewer("/workspace");
  const membershipId = formData.get("membership_id");
  if (typeof membershipId !== "string" || !UUID_PATTERN.test(membershipId)) {
    redirect("/workspace?error=invalid-membership");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("activate_workspace", {
    target_membership_id: membershipId,
  });
  if (error || !isAppRole(data)) redirect("/workspace?error=workspace-not-approved");

  revalidatePath("/workspace", "layout");
  redirect(routeForRole(data));
}

export async function reviewWorkspaceRequestAction(formData: FormData) {
  await requireWorkspace("staff", "staff-role-requests");
  const membershipId = formData.get("membership_id");
  const decision = formData.get("decision");
  if (
    typeof membershipId !== "string"
    || !UUID_PATTERN.test(membershipId)
    || (decision !== "approved" && decision !== "rejected")
  ) {
    redirect("/workspace/staff/role-requests?error=invalid-review");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("review_workspace_request", {
    target_membership_id: membershipId,
    decision,
  });
  if (error) redirect("/workspace/staff/role-requests?error=review-failed");

  revalidatePath("/workspace/staff/role-requests");
  redirect(`/workspace/staff/role-requests?notice=${decision}`);
}
