"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseOptionalIsoDate } from "@/lib/production/policy";
import { parseCreatedRelease, parseReleaseMetadata } from "@/lib/releases/policy";
import { parseReviewDecisionNote } from "@/lib/review/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const projectPattern = /^prj[0-9a-f]{24}$/;
const taskPattern = /^tsk[0-9a-f]{24}$/;
const targetPattern = /^(mil|tsk)[0-9a-f]{24}$/;
const updatePattern = /^upd[0-9a-f]{24}$/;
const assetPattern = /^ast[0-9a-f]{24}$/;
const deliveryPattern = /^fdv[0-9a-f]{24}$/;
const idempotencyPattern = /^[A-Za-z0-9._:-]{8,120}$/;

function text(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }
function path(projectPublicId: string, suffix?: string) { return `/studio/projects/${projectPublicId}/production${suffix ? `?${suffix}` : ""}`; }
function invalid(projectPublicId: string, message = "The production request is invalid.") { return navigationActionResult("error", message, projectPattern.test(projectPublicId) ? path(projectPublicId, "error=invalid") : "/studio/projects?error=invalid"); }

async function viewerAndClient(projectPublicId: string) {
  await requireAdultViewer(path(projectPublicId));
  return createServerSupabaseClient();
}

export async function setProductionStatusAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id"); if (!projectPattern.test(projectPublicId)) return invalid(projectPublicId);
  const supabase = await viewerAndClient(projectPublicId);
  const revisedEstimate = parseOptionalIsoDate(text(formData, "revised_estimate"));
  if (revisedEstimate === undefined) return invalid(projectPublicId, "The revised production estimate is invalid.");
  const { error } = await supabase.rpc("set_production_status", { requested_project_public_id: projectPublicId, requested_status: text(formData, "status"), requested_revised_estimate: revisedEstimate, requested_reason: text(formData, "reason") });
  if (error) return navigationActionResult("error", "Production status could not be changed safely.", path(projectPublicId, "error=status"));
  revalidatePath(path(projectPublicId)); return navigationActionResult("success", "Production status updated.", path(projectPublicId, "notice=status"));
}

export async function createProductionMilestoneAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id"); if (!projectPattern.test(projectPublicId)) return invalid(projectPublicId);
  const dueAt = parseOptionalIsoDate(text(formData, "due_at"));
  if (dueAt === undefined) return invalid(projectPublicId, "The milestone due date is invalid.");
  const supabase = await viewerAndClient(projectPublicId);
  const { error } = await supabase.rpc("create_production_milestone", { requested_project_public_id: projectPublicId, requested_title: text(formData, "title"), requested_due_at: dueAt });
  if (error) return navigationActionResult("error", "Milestone could not be created safely.", path(projectPublicId, "error=milestone"));
  revalidatePath(path(projectPublicId)); return navigationActionResult("success", "Milestone created.", path(projectPublicId, "notice=milestone"));
}

export async function createProductionTaskAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id"); if (!projectPattern.test(projectPublicId)) return invalid(projectPublicId);
  const supabase = await viewerAndClient(projectPublicId);
  const { error } = await supabase.rpc("create_production_task", { requested_project_public_id: projectPublicId, requested_title: text(formData, "title"), requested_assignee_handle: text(formData, "assignee_handle") || null, requested_role_name: text(formData, "role_name"), requested_milestone_public_id: text(formData, "milestone_public_id") || null });
  if (error) return navigationActionResult("error", "Task could not be created safely.", path(projectPublicId, "error=task"));
  revalidatePath(path(projectPublicId)); return navigationActionResult("success", "Task created.", path(projectPublicId, "notice=task"));
}

export async function setProductionTaskStatusAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id"), taskPublicId = text(formData, "task_public_id"); if (!projectPattern.test(projectPublicId) || !taskPattern.test(taskPublicId)) return invalid(projectPublicId);
  const supabase = await viewerAndClient(projectPublicId); const { error } = await supabase.rpc("set_production_task_status", { requested_task_public_id: taskPublicId, requested_status: text(formData, "status") });
  if (error) return navigationActionResult("error", "Task status could not be changed.", path(projectPublicId, "error=task-status"));
  revalidatePath(path(projectPublicId)); return navigationActionResult("success", "Task status updated.", path(projectPublicId, "notice=task-status"));
}

export async function recordProductionApprovalAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id"), targetPublicId = text(formData, "target_public_id"); if (!projectPattern.test(projectPublicId) || !targetPattern.test(targetPublicId)) return invalid(projectPublicId);
  const supabase = await viewerAndClient(projectPublicId); const { error } = await supabase.rpc("record_production_approval", { requested_project_public_id: projectPublicId, requested_target_public_id: targetPublicId, requested_state: text(formData, "state"), requested_note: text(formData, "note") || null });
  if (error) return navigationActionResult("error", "Approval could not be recorded safely.", path(projectPublicId, "error=approval"));
  revalidatePath(path(projectPublicId)); return navigationActionResult("success", "Approval recorded.", path(projectPublicId, "notice=approval"));
}

export async function createProductionUpdateAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id"); if (!projectPattern.test(projectPublicId)) return invalid(projectPublicId);
  const revisedEstimate = parseOptionalIsoDate(text(formData, "revised_estimate"));
  if (revisedEstimate === undefined) return invalid(projectPublicId, "The revised delivery estimate is invalid.");
  const supabase = await viewerAndClient(projectPublicId);
  const { error } = await supabase.rpc("create_production_update", { requested_project_public_id: projectPublicId, requested_kind: text(formData, "kind"), requested_body: text(formData, "body"), requested_revised_estimate: revisedEstimate });
  if (error) return navigationActionResult("error", "Production update could not be drafted safely.", path(projectPublicId, "error=update"));
  revalidatePath(path(projectPublicId)); return navigationActionResult("success", "Production update drafted.", path(projectPublicId, "notice=update"));
}

export async function setProductionUpdateStateAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id"), updatePublicId = text(formData, "update_public_id"); if (!projectPattern.test(projectPublicId) || !updatePattern.test(updatePublicId)) return invalid(projectPublicId);
  const supabase = await viewerAndClient(projectPublicId); const { error } = await supabase.rpc("set_production_update_state", { requested_update_public_id: updatePublicId, requested_state: text(formData, "state") });
  if (error) return navigationActionResult("error", "Update state could not be changed safely.", path(projectPublicId, "error=update-state"));
  revalidatePath(path(projectPublicId)); return navigationActionResult("success", "Update state changed.", path(projectPublicId, "notice=update-state"));
}

export async function revokeProductionCollaboratorAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id"); if (!projectPattern.test(projectPublicId)) return invalid(projectPublicId);
  const supabase = await viewerAndClient(projectPublicId); const { error } = await supabase.rpc("revoke_project_collaborator_access", { requested_project_public_id: projectPublicId, requested_collaborator_handle: text(formData, "collaborator_handle"), requested_reason: text(formData, "reason") });
  if (error) return navigationActionResult("error", "Collaborator access could not be revoked safely.", path(projectPublicId, "error=revoke"));
  revalidatePath(path(projectPublicId)); return navigationActionResult("success", "Collaborator access revoked.", path(projectPublicId, "notice=revoke"));
}

export async function issueProductionAssetAccessAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id"), assetPublicId = text(formData, "asset_public_id"); if (!projectPattern.test(projectPublicId) || !assetPattern.test(assetPublicId)) return invalid(projectPublicId);
  const supabase = await viewerAndClient(projectPublicId); const { data, error } = await supabase.rpc("issue_production_asset_access", { requested_asset_public_id: assetPublicId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return navigationActionResult("error", "Private asset access could not be issued.", path(projectPublicId, "error=asset"));
  const downloadPath = (data as Record<string, unknown>).downloadPath;
  if (typeof downloadPath !== "string" || !/^\/production-assets\/[0-9a-f]{64}$/.test(downloadPath)) return navigationActionResult("error", "Private asset access returned an invalid token.", path(projectPublicId, "error=asset"));
  return navigationActionResult("success", "Private asset access issued.", downloadPath);
}

export async function submitFinalDeliveryAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id");
  const assetPublicId = text(formData, "asset_public_id");
  const idempotencyKey = text(formData, "idempotency_key");
  if (!projectPattern.test(projectPublicId) || !assetPattern.test(assetPublicId) || !idempotencyPattern.test(idempotencyKey)) {
    return invalid(projectPublicId, "The final delivery submission is invalid.");
  }
  const supabase = await viewerAndClient(projectPublicId);
  const { error } = await supabase.rpc("submit_final_delivery", {
    requested_project_public_id: projectPublicId,
    requested_asset_public_id: assetPublicId,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) return navigationActionResult("error", "The final delivery could not be submitted safely.", path(projectPublicId, "error=final-delivery"));
  revalidatePath(path(projectPublicId));
  return navigationActionResult("success", "Final delivery submitted for review.", path(projectPublicId, "notice=final-delivery"));
}

export async function respondToDeliveryReviewAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id");
  const deliveryPublicId = text(formData, "delivery_public_id");
  const body = parseReviewDecisionNote(text(formData, "body"));
  if (!projectPattern.test(projectPublicId) || !deliveryPattern.test(deliveryPublicId) || !body) {
    return invalid(projectPublicId, "The review response is invalid.");
  }
  const supabase = await viewerAndClient(projectPublicId);
  const { error } = await supabase.rpc("respond_to_delivery_review", {
    requested_delivery_public_id: deliveryPublicId,
    requested_body: body,
  });
  if (error) return navigationActionResult("error", "The review response could not be recorded safely.", path(projectPublicId, "error=review-response"));
  revalidatePath(path(projectPublicId));
  return navigationActionResult("success", "Review response recorded.", path(projectPublicId, "notice=review-response"));
}

export async function issueFinalDeliveryAssetAccessAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id");
  const deliveryPublicId = text(formData, "delivery_public_id");
  if (!projectPattern.test(projectPublicId) || !deliveryPattern.test(deliveryPublicId)) return invalid(projectPublicId);
  const supabase = await viewerAndClient(projectPublicId);
  const { data, error } = await supabase.rpc("issue_final_delivery_asset_access", { requested_delivery_public_id: deliveryPublicId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return navigationActionResult("error", "Final delivery access could not be issued.", path(projectPublicId, "error=final-asset"));
  }
  const downloadPath = (data as Record<string, unknown>).downloadPath;
  if (typeof downloadPath !== "string" || !/^\/production-assets\/[0-9a-f]{64}$/.test(downloadPath)) {
    return navigationActionResult("error", "Final delivery access returned an invalid token.", path(projectPublicId, "error=final-asset"));
  }
  return navigationActionResult("success", "Final delivery access issued.", downloadPath);
}

export async function publishReleaseAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = text(formData, "project_public_id");
  const deliveryPublicId = text(formData, "delivery_public_id");
  const idempotencyKey = text(formData, "idempotency_key");
  const metadata = parseReleaseMetadata({
    title: text(formData, "title"),
    synopsis: text(formData, "synopsis"),
    posterAssetPublicId: text(formData, "poster_asset_public_id") || null,
    previewAssetPublicId: text(formData, "preview_asset_public_id") || null,
  });
  if (!projectPattern.test(projectPublicId) || !deliveryPattern.test(deliveryPublicId) || !idempotencyPattern.test(idempotencyKey) || !metadata) {
    return invalid(projectPublicId, "The release publication request is invalid.");
  }
  const supabase = await viewerAndClient(projectPublicId);
  const { data, error } = await supabase.rpc("create_release", {
    requested_delivery_public_id: deliveryPublicId,
    requested_metadata: metadata,
    requested_idempotency_key: idempotencyKey,
  });
  const created = error ? null : parseCreatedRelease(data);
  if (!created) return navigationActionResult("error", "The approved release could not be published safely.", path(projectPublicId, "error=release"));
  revalidatePath(path(projectPublicId));
  revalidatePath("/workspace/fan");
  return navigationActionResult("success", "Release published.", `/releases/${created.publicId}`);
}
