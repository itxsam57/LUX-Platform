"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireWorkspace } from "@/lib/auth/context";
import { parseAgencyVerificationReview } from "@/lib/agency/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PATH = "/workspace/staff/agency-verification";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function result(status: "success" | "error", message: string, code: string): NavigationActionResult {
  return navigationActionResult(status, message, `${PATH}?${status === "success" ? "notice" : "error"}=${encodeURIComponent(code)}`);
}

export async function reviewAgencyVerificationAction(formData: FormData): Promise<NavigationActionResult> {
  const viewer = await requireWorkspace("staff", "staff-agency-verification");
  if (viewer.context.activeRole !== "reviewer" && viewer.context.activeRole !== "super_admin") {
    return result("error", "Agency verification review requires an authorized reviewer workspace.", "reviewer-required");
  }

  const input = parseAgencyVerificationReview({
    agencyPublicId: text(formData, "agency_public_id"),
    decision: text(formData, "decision"),
    reason: text(formData, "reason"),
  });
  if (!input) return result("error", "The agency verification decision is invalid.", "review-invalid");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("review_agency_verification", {
    requested_agency_public_id: input.agencyPublicId,
    requested_decision: input.decision,
    requested_reason: input.reason,
  });
  if (error) return result("error", "The agency verification decision could not be recorded safely.", "review");

  revalidatePath(PATH);
  revalidatePath("/workspace/agency");
  return result("success", "Agency verification review completed.", input.decision);
}
