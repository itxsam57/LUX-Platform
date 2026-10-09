"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireWorkspace } from "@/lib/auth/context";
import {
  parsePlatformReviewDecision,
  parseProcessingReviewUpdate,
  parseReviewChecklistUpdate,
  parseReviewDecisionNote,
} from "@/lib/review/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const projectPattern = /^prj[0-9a-f]{24}$/;
const deliveryPattern = /^fdv[0-9a-f]{24}$/;
const checklistKeyPattern = /^[a-z0-9_-]{2,32}$/;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function route(projectPublicId: string, suffix?: string) {
  return `/workspace/staff/delivery-review/${projectPublicId}${suffix ? `?${suffix}` : ""}`;
}

function invalid(projectPublicId: string, message = "The delivery review request is invalid.") {
  return navigationActionResult(
    "error",
    message,
    projectPattern.test(projectPublicId) ? route(projectPublicId, "error=invalid") : "/workspace/staff/delivery-review?error=invalid",
  );
}

async function reviewerClient(projectPublicId: string) {
  const viewer = await requireWorkspace("staff", "staff-delivery-review");
  if (viewer.context.activeRole !== "reviewer" && viewer.context.activeRole !== "super_admin") return null;
  const supabase = await createServerSupabaseClient();
  return { supabase, projectPublicId };
}

function validatedNote(formData: FormData, key: string, max: number) {
  const raw = text(formData, key);
  const parsed = parseReviewDecisionNote(raw);
  return parsed && parsed.length <= max ? parsed : null;
}

export async function setDeliveryReviewChecklistAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id");
  const deliveryPublicId = text(formData, "delivery_public_id");
  const itemKey = text(formData, "item_key");
  const state = parseReviewChecklistUpdate(text(formData, "state"));
  const note = validatedNote(formData, "note", 1000);
  if (!projectPattern.test(projectPublicId) || !deliveryPattern.test(deliveryPublicId) || !checklistKeyPattern.test(itemKey) || !state || !note) {
    return invalid(projectPublicId);
  }
  const client = await reviewerClient(projectPublicId);
  if (!client) return invalid(projectPublicId, "Delivery review requires an authorized reviewer workspace.");
  const { error } = await client.supabase.rpc("set_delivery_review_check", {
    requested_delivery_public_id: deliveryPublicId,
    requested_item_key: itemKey,
    requested_state: state,
    requested_note: note,
  });
  if (error) return navigationActionResult("error", "The checklist result could not be recorded safely.", route(projectPublicId, "error=checklist"));
  revalidatePath(route(projectPublicId));
  revalidatePath("/workspace/staff/delivery-review");
  return navigationActionResult("success", "Checklist result recorded.", route(projectPublicId, "notice=checklist"));
}

export async function setFinalDeliveryProcessingAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id");
  const deliveryPublicId = text(formData, "delivery_public_id");
  const state = parseProcessingReviewUpdate(text(formData, "state"));
  const rawNote = text(formData, "note");
  const note = rawNote ? validatedNote(formData, "note", 1000) : null;
  if (!projectPattern.test(projectPublicId) || !deliveryPattern.test(deliveryPublicId) || !state || (rawNote && !note)) return invalid(projectPublicId);
  if ((state === "ready" || state === "failed") && !note) return invalid(projectPublicId, "Ready and failed processing states require a reason.");
  const client = await reviewerClient(projectPublicId);
  if (!client) return invalid(projectPublicId, "Delivery review requires an authorized reviewer workspace.");
  const { error } = await client.supabase.rpc("set_final_delivery_processing", {
    requested_delivery_public_id: deliveryPublicId,
    requested_state: state,
    requested_note: note,
  });
  if (error) return navigationActionResult("error", "The processing state could not be changed safely.", route(projectPublicId, "error=processing"));
  revalidatePath(route(projectPublicId));
  revalidatePath("/workspace/staff/delivery-review");
  return navigationActionResult("success", "Processing state updated.", route(projectPublicId, "notice=processing"));
}

export async function decideDeliveryReviewAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id");
  const deliveryPublicId = text(formData, "delivery_public_id");
  const decision = parsePlatformReviewDecision(text(formData, "decision"));
  const reason = validatedNote(formData, "reason", 2000);
  if (!projectPattern.test(projectPublicId) || !deliveryPattern.test(deliveryPublicId) || !decision || !reason) return invalid(projectPublicId);
  const client = await reviewerClient(projectPublicId);
  if (!client) return invalid(projectPublicId, "Delivery review requires an authorized reviewer workspace.");
  const { error } = await client.supabase.rpc("decide_delivery_review", {
    requested_delivery_public_id: deliveryPublicId,
    requested_decision: decision,
    requested_reason: reason,
  });
  if (error) return navigationActionResult("error", "The platform review decision could not be recorded safely.", route(projectPublicId, "error=decision"));
  revalidatePath(route(projectPublicId));
  revalidatePath("/workspace/staff/delivery-review");
  return navigationActionResult("success", "Platform review decision recorded.", route(projectPublicId, "notice=decision"));
}

export async function issueReviewerFinalAssetAccessAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id");
  const deliveryPublicId = text(formData, "delivery_public_id");
  if (!projectPattern.test(projectPublicId) || !deliveryPattern.test(deliveryPublicId)) return invalid(projectPublicId);
  const client = await reviewerClient(projectPublicId);
  if (!client) return invalid(projectPublicId, "Delivery review requires an authorized reviewer workspace.");
  const { data, error } = await client.supabase.rpc("issue_final_delivery_asset_access", { requested_delivery_public_id: deliveryPublicId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return navigationActionResult("error", "Final media access could not be issued.", route(projectPublicId, "error=asset"));
  }
  const downloadPath = (data as Record<string, unknown>).downloadPath;
  if (typeof downloadPath !== "string" || !/^\/production-assets\/[0-9a-f]{64}$/.test(downloadPath)) {
    return navigationActionResult("error", "Final media access returned an invalid token.", route(projectPublicId, "error=asset"));
  }
  return navigationActionResult("success", "Final media access issued.", downloadPath);
}
