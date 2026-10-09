"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  parseAppealInput,
  parseCasePublicId,
  parseDisputeInput,
  parseReportInput,
  parseReviewReason,
  parseSupportInput,
} from "@/lib/trust/policy";

const SUPPORT_PATH = "/app/support";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function result(status: "success" | "error", message: string, suffix: string): NavigationActionResult {
  return navigationActionResult(status, message, `${SUPPORT_PATH}?${suffix}`);
}

async function client() {
  await requireAdultViewer(SUPPORT_PATH);
  return createServerSupabaseClient();
}

export async function createSupportCaseAction(formData: FormData): Promise<NavigationActionResult> {
  const parsed = parseSupportInput(text(formData, "subject"), text(formData, "body"));
  if (!parsed) return result("error", "The support request is invalid.", "error=support-invalid");
  const supabase = await client();
  const { error } = await supabase.rpc("create_support_case", {
    subject_value: parsed.subject,
    body_value: parsed.body,
  });
  if (error) return result("error", "The support request could not be created safely.", "error=support");
  revalidatePath(SUPPORT_PATH);
  return result("success", "Support request created.", "notice=support");
}

export async function reportContentAction(formData: FormData): Promise<NavigationActionResult> {
  const parsed = parseReportInput(
    text(formData, "subject_type"),
    text(formData, "subject_public_id"),
    text(formData, "summary"),
    text(formData, "reason"),
  );
  if (!parsed) return result("error", "The report is invalid.", "error=report-invalid");
  const supabase = await client();
  const { error } = await supabase.rpc("report_content", {
    subject_type_value: parsed.subjectType,
    subject_public_id_value: parsed.subjectPublicId,
    summary_value: parsed.summary,
    reason_value: parsed.reason,
  });
  if (error) return result("error", "The report could not be submitted safely.", "error=report");
  revalidatePath(SUPPORT_PATH);
  return result("success", "Report submitted.", "notice=report");
}

export async function createConsumerDisputeAction(formData: FormData): Promise<NavigationActionResult> {
  const parsed = parseDisputeInput(
    text(formData, "subject_type"),
    text(formData, "subject_public_id"),
    text(formData, "category"),
    text(formData, "summary"),
    text(formData, "detail"),
  );
  if (!parsed) return result("error", "The dispute request is invalid.", "error=dispute-invalid");
  const supabase = await client();
  const { error } = await supabase.rpc("create_consumer_dispute", {
    subject_type_value: parsed.subjectType,
    subject_public_id_value: parsed.subjectPublicId,
    category_value: parsed.category,
    summary_value: parsed.summary,
    detail_value: parsed.detail,
  });
  if (error) return result("error", "The dispute could not be opened safely.", "error=dispute");
  revalidatePath(SUPPORT_PATH);
  return result("success", "Dispute opened.", "notice=dispute");
}

export async function withdrawConsumerDisputeAction(formData: FormData): Promise<NavigationActionResult> {
  const publicId = parseCasePublicId("dispute", text(formData, "case_public_id"));
  const reason = parseReviewReason(text(formData, "reason"));
  if (!publicId || !reason) return result("error", "The dispute withdrawal is invalid.", "error=withdraw-invalid");
  const supabase = await client();
  const { error } = await supabase.rpc("withdraw_consumer_dispute", {
    requested_public_id: publicId,
    reason_value: reason,
  });
  if (error) return result("error", "The dispute could not be withdrawn.", "error=withdraw");
  revalidatePath(SUPPORT_PATH);
  return result("success", "Dispute withdrawn.", "notice=withdraw");
}

export async function createAppealAction(formData: FormData): Promise<NavigationActionResult> {
  const parsed = parseAppealInput(
    text(formData, "source_type"),
    text(formData, "source_public_id"),
    text(formData, "reason"),
  );
  if (!parsed) return result("error", "The appeal request is invalid.", "error=appeal-invalid");
  const supabase = await client();
  const { error } = await supabase.rpc("create_appeal", {
    source_type_value: parsed.sourceType,
    source_public_id_value: parsed.sourcePublicId,
    reason_value: parsed.reason,
  });
  if (error) return result("error", "The appeal could not be opened safely.", "error=appeal");
  revalidatePath(SUPPORT_PATH);
  return result("success", "Appeal opened.", "notice=appeal");
}
