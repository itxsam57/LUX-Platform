"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseFinalCutDecision, parseReviewDecisionNote } from "@/lib/review/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const deliveryPattern = /^fdv[0-9a-f]{24}$/;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function route(deliveryPublicId: string, suffix?: string) {
  return `/final-cut/${deliveryPublicId}${suffix ? `?${suffix}` : ""}`;
}

function invalid(deliveryPublicId: string, message = "The final-cut request is invalid.") {
  return navigationActionResult(
    "error",
    message,
    deliveryPattern.test(deliveryPublicId) ? route(deliveryPublicId, "error=invalid") : "/workspace?error=invalid",
  );
}

async function viewerAndClient(deliveryPublicId: string) {
  await requireAdultViewer(route(deliveryPublicId));
  return createServerSupabaseClient();
}

export async function recordFinalCutApprovalAction(formData: FormData): Promise<NavigationActionResult> {
  const deliveryPublicId = text(formData, "delivery_public_id");
  const state = parseFinalCutDecision(text(formData, "state"));
  const rawNote = text(formData, "note");
  const parsedNote = rawNote ? parseReviewDecisionNote(rawNote) : null;
  if (!deliveryPattern.test(deliveryPublicId) || !state) return invalid(deliveryPublicId);
  if (rawNote && (!parsedNote || parsedNote.length > 1000)) return invalid(deliveryPublicId, "The final-cut note is invalid.");
  if (state === "changes_requested" && !parsedNote) return invalid(deliveryPublicId, "Describe the changes required for this exact version.");

  const supabase = await viewerAndClient(deliveryPublicId);
  const { error } = await supabase.rpc("record_final_cut_approval", {
    requested_delivery_public_id: deliveryPublicId,
    requested_state: state,
    requested_note: parsedNote,
  });
  if (error) return navigationActionResult("error", "Final-cut approval could not be recorded safely.", route(deliveryPublicId, "error=approval"));
  revalidatePath(route(deliveryPublicId));
  return navigationActionResult("success", "Final-cut decision recorded.", route(deliveryPublicId, "notice=approval"));
}

export async function issueFinalCutAssetAccessAction(formData: FormData): Promise<NavigationActionResult> {
  const deliveryPublicId = text(formData, "delivery_public_id");
  if (!deliveryPattern.test(deliveryPublicId)) return invalid(deliveryPublicId);
  const supabase = await viewerAndClient(deliveryPublicId);
  const { data, error } = await supabase.rpc("issue_final_delivery_asset_access", {
    requested_delivery_public_id: deliveryPublicId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return navigationActionResult("error", "Final media access could not be issued.", route(deliveryPublicId, "error=asset"));
  }
  const downloadPath = (data as Record<string, unknown>).downloadPath;
  if (typeof downloadPath !== "string" || !/^\/production-assets\/[0-9a-f]{64}$/.test(downloadPath)) {
    return navigationActionResult("error", "Final media access returned an invalid token.", route(deliveryPublicId, "error=asset"));
  }
  return navigationActionResult("success", "Final media access issued.", downloadPath);
}
