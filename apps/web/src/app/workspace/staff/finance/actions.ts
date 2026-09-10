"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireWorkspace } from "@/lib/auth/context";
import {
  parseFinanceHoldKind,
  parseFinanceIdempotencyKey,
  parseFinanceMonthStart,
  parseFinanceReason,
  parseFinanceResourceId,
  parseMoneyMinor,
  parseParticipantHandle,
  parsePayoutCurrency,
} from "@/lib/finance/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FINANCE_PATH = "/workspace/staff/finance";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function actionResult(status: "success" | "error", message: string, suffix: string): NavigationActionResult {
  return navigationActionResult(status, message, `${FINANCE_PATH}?${suffix}`);
}

async function financeClient() {
  const viewer = await requireWorkspace("staff", "staff-finance");
  const supabase = await createServerSupabaseClient();
  if (viewer.context.activeRole !== "finance" && viewer.context.activeRole !== "super_admin") {
    await supabase.rpc("record_access_denied", {
      denied_route_key: "staff-finance",
      required_role: "finance",
      denial_reason: "finance_role_required",
    });
    return null;
  }
  return supabase;
}

function denied() {
  return actionResult("error", "Finance operations require an authorized finance workspace.", "error=denied");
}

export async function promoteProjectEarningsAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = parseFinanceResourceId("project", text(formData, "project_public_id"));
  const idempotencyKey = parseFinanceIdempotencyKey(text(formData, "idempotency_key"));
  if (!projectPublicId || !idempotencyKey) return actionResult("error", "The earnings promotion request is invalid.", "error=promotion-invalid");
  const supabase = await financeClient();
  if (!supabase) return denied();
  const { error } = await supabase.rpc("promote_project_earnings", {
    requested_project_public_id: projectPublicId,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) return actionResult("error", "Earnings could not be promoted because a release or verification gate remains closed.", "error=promotion");
  revalidatePath(FINANCE_PATH);
  revalidatePath("/app/earnings");
  return actionResult("success", "Eligible earnings promoted.", "notice=promotion");
}

export async function placeEarningsHoldAction(formData: FormData): Promise<NavigationActionResult> {
  const projectPublicId = parseFinanceResourceId("project", text(formData, "project_public_id"));
  const participantHandle = parseParticipantHandle(text(formData, "participant_handle"));
  const amountMinor = parseMoneyMinor(text(formData, "amount_minor"));
  const kind = parseFinanceHoldKind(text(formData, "kind"));
  const reason = parseFinanceReason(text(formData, "reason"));
  const idempotencyKey = parseFinanceIdempotencyKey(text(formData, "idempotency_key"));
  if (!projectPublicId || !participantHandle || !amountMinor || !kind || !reason || !idempotencyKey) {
    return actionResult("error", "The earnings hold request is invalid.", "error=hold-invalid");
  }
  const supabase = await financeClient();
  if (!supabase) return denied();
  const { error } = await supabase.rpc("place_earnings_hold", {
    requested_project_public_id: projectPublicId,
    requested_participant_handle: participantHandle,
    requested_amount_minor: amountMinor,
    requested_kind: kind,
    requested_reason: reason,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) return actionResult("error", "The hold could not be placed against available journal balance.", "error=hold");
  revalidatePath(FINANCE_PATH);
  revalidatePath("/app/earnings");
  return actionResult("success", "Earnings hold placed.", "notice=hold");
}

export async function releaseEarningsHoldAction(formData: FormData): Promise<NavigationActionResult> {
  const holdPublicId = parseFinanceResourceId("hold", text(formData, "hold_public_id"));
  const idempotencyKey = parseFinanceIdempotencyKey(text(formData, "idempotency_key"));
  if (!holdPublicId || !idempotencyKey) return actionResult("error", "The hold release request is invalid.", "error=release-invalid");
  const supabase = await financeClient();
  if (!supabase) return denied();
  const { error } = await supabase.rpc("release_earnings_hold", {
    requested_hold_public_id: holdPublicId,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) return actionResult("error", "The hold could not be released safely.", "error=release");
  revalidatePath(FINANCE_PATH);
  revalidatePath("/app/earnings");
  return actionResult("success", "Earnings hold released.", "notice=release");
}

export async function createMonthlyPayoutBatchAction(formData: FormData): Promise<NavigationActionResult> {
  const month = parseFinanceMonthStart(text(formData, "month"));
  const currency = parsePayoutCurrency(text(formData, "currency"));
  const idempotencyKey = parseFinanceIdempotencyKey(text(formData, "idempotency_key"));
  if (!month || !currency || !idempotencyKey) return actionResult("error", "The payout batch request is invalid.", "error=batch-invalid");
  const supabase = await financeClient();
  if (!supabase) return denied();
  const { error } = await supabase.rpc("create_monthly_payout_batch", {
    requested_month: month,
    requested_currency: currency,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) return actionResult("error", "The monthly payout batch could not be created safely.", "error=batch");
  revalidatePath(FINANCE_PATH);
  revalidatePath("/app/earnings");
  return actionResult("success", "Monthly payout batch created.", "notice=batch");
}

export async function retryFinancePayoutAction(formData: FormData): Promise<NavigationActionResult> {
  const payoutPublicId = parseFinanceResourceId("payout", text(formData, "payout_public_id"));
  const idempotencyKey = parseFinanceIdempotencyKey(text(formData, "idempotency_key"));
  if (!payoutPublicId || !idempotencyKey) return actionResult("error", "The payout retry is invalid.", "error=retry-invalid");
  const supabase = await financeClient();
  if (!supabase) return denied();
  const { error } = await supabase.rpc("retry_payout", {
    requested_payout_public_id: payoutPublicId,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) return actionResult("error", "The failed payout could not be retried safely.", "error=retry");
  revalidatePath(FINANCE_PATH);
  revalidatePath("/app/earnings");
  return actionResult("success", "Failed payout returned to the payout queue.", "notice=retry");
}
