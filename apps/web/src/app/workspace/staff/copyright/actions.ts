"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireWorkspace } from "@/lib/auth/context";
import { parseCopyrightCaseMutation } from "@/lib/copyright/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const COPYRIGHT_PATH = "/workspace/staff/copyright";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function copyrightClient() {
  const viewer = await requireWorkspace("staff", "staff-copyright");
  const supabase = await createServerSupabaseClient();
  if (viewer.context.activeRole !== "copyright" && viewer.context.activeRole !== "super_admin") {
    await supabase.rpc("record_access_denied", {
      denied_route_key: "staff-copyright",
      required_role: "copyright",
      denial_reason: "copyright_role_required",
    });
    return null;
  }
  return supabase;
}

function denied(): NavigationActionResult {
  return navigationActionResult("error", "Copyright operations require an authorized copyright workspace.", `${COPYRIGHT_PATH}?error=denied`);
}

export async function openCopyrightCaseAction(formData: FormData): Promise<NavigationActionResult> {
  const reportPublicId = text(formData, "report_public_id").trim();
  const reason = text(formData, "reason").trim();
  if (!/^lkr[0-9a-f]{24}$/.test(reportPublicId) || reason.length < 10 || reason.length > 2000) {
    return navigationActionResult("error", "The case-opening request is invalid.", `${COPYRIGHT_PATH}?error=open-invalid`);
  }
  const supabase = await copyrightClient();
  if (!supabase) return denied();
  const { error } = await supabase.rpc("open_copyright_case_from_report", {
    requested_report_public_id: reportPublicId,
    requested_reason: reason,
  });
  if (error) return navigationActionResult("error", "The copied-release report could not be opened as a case.", `${COPYRIGHT_PATH}?error=open`);
  revalidatePath(COPYRIGHT_PATH);
  revalidatePath("/app/copyright");
  return navigationActionResult("success", "Copyright case opened.", `${COPYRIGHT_PATH}?notice=opened`);
}

export async function advanceCopyrightCaseAction(formData: FormData): Promise<NavigationActionResult> {
  const casePublicId = text(formData, "case_public_id").trim();
  const mutation = parseCopyrightCaseMutation({
    action: text(formData, "action"),
    reason: text(formData, "reason"),
    noticeReference: text(formData, "notice_reference"),
  });
  if (!/^cpy[0-9a-f]{24}$/.test(casePublicId) || !mutation) {
    return navigationActionResult("error", "The case update is invalid.", `${COPYRIGHT_PATH}?error=update-invalid`);
  }
  const supabase = await copyrightClient();
  if (!supabase) return denied();
  const { error } = await supabase.rpc("advance_copyright_case", {
    requested_case_public_id: casePublicId,
    requested_action: mutation.action,
    requested_reason: mutation.reason,
    requested_notice_reference: mutation.noticeReference,
  });
  if (error) return navigationActionResult("error", "The requested case transition is not allowed from its current stage.", `${COPYRIGHT_PATH}?error=transition`);
  revalidatePath(COPYRIGHT_PATH);
  revalidatePath(`${COPYRIGHT_PATH}/${casePublicId}`);
  revalidatePath("/app/copyright");
  return navigationActionResult("success", "Copyright case updated.", `${COPYRIGHT_PATH}?notice=updated`);
}

export async function recordCopyrightSourceMatchAction(formData: FormData): Promise<NavigationActionResult> {
  const casePublicId = text(formData, "case_public_id").trim();
  const state = text(formData, "state").trim();
  const fingerprint = text(formData, "source_fingerprint").trim();
  const reason = text(formData, "reason").trim();
  const validFingerprint = fingerprint === "" || /^[0-9a-f]{64}$/.test(fingerprint);
  if (!/^cpy[0-9a-f]{24}$/.test(casePublicId)
    || !["no_match", "possible_session_match"].includes(state)
    || !validFingerprint
    || (state === "possible_session_match" && fingerprint === "")
    || reason.length < 10 || reason.length > 2000) {
    return navigationActionResult("error", "The source-match update is invalid.", `${COPYRIGHT_PATH}?error=match-invalid`);
  }
  const supabase = await copyrightClient();
  if (!supabase) return denied();
  const { error } = await supabase.rpc("record_copyright_source_match", {
    requested_case_public_id: casePublicId,
    requested_state: state,
    requested_source_fingerprint: fingerprint || null,
    requested_reason: reason,
  });
  if (error) return navigationActionResult("error", "The source-match result could not be recorded.", `${COPYRIGHT_PATH}?error=match`);
  revalidatePath(COPYRIGHT_PATH);
  revalidatePath(`${COPYRIGHT_PATH}/${casePublicId}`);
  revalidatePath("/app/copyright");
  return navigationActionResult("success", "Source-match result recorded without exposing purchaser identity.", `${COPYRIGHT_PATH}?notice=match`);
}
