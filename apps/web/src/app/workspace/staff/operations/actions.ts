"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireWorkspace } from "@/lib/auth/context";
import {
  parseCriticalAdminAction,
  parseOperationalRateLimitUpdate,
  staffCanAccessAdminQueue,
  type AdminQueueKey,
} from "@/lib/admin/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const OPERATIONS_PATH = "/workspace/staff/operations";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function result(status: "success" | "error", message: string, suffix: string): NavigationActionResult {
  return navigationActionResult(status, message, `${OPERATIONS_PATH}?${suffix}`);
}

async function operationsClient(queue: AdminQueueKey) {
  const viewer = await requireWorkspace("staff", "workspace-staff-admin");
  const supabase = await createServerSupabaseClient();
  if (!staffCanAccessAdminQueue(viewer.context.activeRole, queue)) {
    await supabase.rpc("record_access_denied", {
      denied_route_key: "workspace-staff-admin",
      required_role: viewer.context.activeRole,
      denial_reason: `admin_queue_${queue}_denied`,
    });
    return null;
  }
  return supabase;
}

export async function performCriticalAdminAction(formData: FormData): Promise<NavigationActionResult> {
  const parsed = parseCriticalAdminAction({
    action: text(formData, "action"),
    targetPublicId: text(formData, "target_public_id"),
    reason: text(formData, "reason"),
    confirmation: text(formData, "confirmation"),
  });
  if (!parsed) return result("error", "The critical operation is invalid.", "queue=incidents&error=critical-invalid");

  const queue: AdminQueueKey = parsed.action === "apply_abuse_hold" || parsed.action === "release_abuse_hold"
    ? "moderation"
    : "incidents";
  const supabase = await operationsClient(queue);
  if (!supabase) return result("error", "This staff role cannot perform that operation.", `queue=${queue}&error=denied`);

  const { error } = await supabase.rpc("perform_critical_admin_action", {
    action_key: parsed.action,
    target_public_id: parsed.targetPublicId,
    reason_value: parsed.reason,
    confirmation_value: "CONFIRM",
  });
  if (error) return result("error", "The critical operation could not be completed safely.", `queue=${queue}&error=critical`);

  revalidatePath(OPERATIONS_PATH);
  return result("success", "Critical operation recorded.", `queue=${queue}&notice=critical`);
}

export async function resolveAdminCaseAction(formData: FormData): Promise<NavigationActionResult> {
  const queue = text(formData, "queue").trim().toLowerCase();
  const publicId = text(formData, "case_public_id").trim();
  const reason = text(formData, "reason").trim();
  const confirmation = text(formData, "confirmation");
  const expectedPrefix = queue === "moderation" ? "mod" : queue === "support" ? "sup" : "";
  if (!expectedPrefix || !new RegExp(`^${expectedPrefix}[0-9a-f]{24}$`).test(publicId)
    || reason.length < 8 || reason.length > 1000 || confirmation !== "CONFIRM") {
    return result("error", "The case resolution request is invalid.", `queue=${queue || "support"}&error=resolve-invalid`);
  }

  const supabase = await operationsClient(queue as AdminQueueKey);
  if (!supabase) return result("error", "This staff role cannot resolve that queue.", `queue=${queue}&error=denied`);
  const { error } = await supabase.rpc("resolve_admin_case", {
    queue_key: queue,
    case_public_id: publicId,
    reason_value: reason,
    confirmation_value: "CONFIRM",
  });
  if (error) return result("error", "The case could not be resolved from its current state.", `queue=${queue}&error=resolve`);

  revalidatePath(OPERATIONS_PATH);
  return result("success", "Case resolved.", `queue=${queue}&notice=resolved`);
}

export async function updateOperationalRateLimitAction(formData: FormData): Promise<NavigationActionResult> {
  const parsed = parseOperationalRateLimitUpdate({
    key: text(formData, "key"),
    maxRequests: text(formData, "max_requests"),
    windowSeconds: text(formData, "window_seconds"),
    enabled: text(formData, "enabled"),
    reason: text(formData, "reason"),
    confirmation: text(formData, "confirmation"),
  });
  if (!parsed) return result("error", "The rate-limit update is invalid.", "queue=configuration&error=rate-limit-invalid");

  const supabase = await operationsClient("configuration");
  if (!supabase) return result("error", "Only authorized configuration staff can change rate limits.", "queue=configuration&error=denied");
  const { error } = await supabase.rpc("update_operational_rate_limit", {
    limit_key: parsed.key,
    limit_count: parsed.maxRequests,
    window_seconds: parsed.windowSeconds,
    enabled_value: parsed.enabled,
    reason_value: parsed.reason,
    confirmation_value: "CONFIRM",
  });
  if (error) return result("error", "The rate-limit update could not be recorded safely.", "queue=configuration&error=rate-limit");

  revalidatePath(OPERATIONS_PATH);
  return result("success", "Rate-limit configuration updated.", "queue=configuration&notice=rate-limit");
}
