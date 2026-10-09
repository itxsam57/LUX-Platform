"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import {
  parseFinanceIdempotencyKey,
  parseFinanceResourceId,
  parseMoneyMinor,
  parsePayoutCurrency,
} from "@/lib/finance/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConfiguredPayoutGateway } from "@/lib/payouts/runtime";
import { getPublicAppUrl } from "@/lib/supabase/env";

const EARNINGS_PATH = "/app/earnings";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function result(
  status: "success" | "error",
  message: string,
  suffix: string,
): NavigationActionResult {
  return navigationActionResult(status, message, `${EARNINGS_PATH}?${suffix}`);
}


function payoutFailureSuffix(error: { message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  if (message.includes("payout_held")) return "error=payout-held";
  if (message.includes("payout_exceeds_available_balance")) return "error=payout-balance";
  if (message.includes("payout_not_allowed")) return "error=payout-not-allowed";
  if (message.includes("invalid_payout_request")) return "error=payout-invalid";
  return "error=payout";
}

export async function startPayoutOnboardingAction(formData: FormData): Promise<void> {
  const viewer = await requireAdultViewer(EARNINGS_PATH);
  const idempotencyKey = parseFinanceIdempotencyKey(text(formData, "idempotency_key"));
  if (!idempotencyKey) redirect(`${EARNINGS_PATH}?error=payout-onboarding-invalid`);

  const gateway = getConfiguredPayoutGateway();
  if (!gateway) redirect(`${EARNINGS_PATH}?error=payout-provider`);

  let session;
  try {
    session = await gateway.createRecipientOnboarding({
      subjectId: viewer.user.id,
      returnUrl: `${getPublicAppUrl()}${EARNINGS_PATH}?notice=payout-onboarding-return`,
      idempotencyKey,
    });
  } catch {
    redirect(`${EARNINGS_PATH}?error=payout-provider`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("start_payout_recipient_onboarding", {
    requested_provider_key: session.providerKey,
    requested_recipient_reference: session.recipientReference,
    requested_onboarding_expires_at: session.expiresAt,
  });
  if (error) redirect(`${EARNINGS_PATH}?error=payout-onboarding`);

  redirect(session.onboardingUrl);
}

export async function requestPayoutAction(formData: FormData): Promise<NavigationActionResult> {
  await requireAdultViewer(EARNINGS_PATH);
  const projectPublicId = parseFinanceResourceId("project", text(formData, "project_public_id"));
  const amountMinor = parseMoneyMinor(text(formData, "amount_minor"));
  const currency = parsePayoutCurrency(text(formData, "currency"));
  const idempotencyKey = parseFinanceIdempotencyKey(text(formData, "idempotency_key"));
  if (!projectPublicId || !amountMinor || !currency || !idempotencyKey) {
    return result("error", "The payout request is invalid.", "error=payout-invalid");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("request_payout", {
    requested_project_public_id: projectPublicId,
    requested_amount_minor: amountMinor,
    requested_currency: currency,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) return result("error", "The payout could not be reserved from your available balance.", payoutFailureSuffix(error));

  revalidatePath(EARNINGS_PATH);
  return result("success", "Payout requested.", "notice=payout-requested");
}

export async function retryPayoutAction(formData: FormData): Promise<NavigationActionResult> {
  await requireAdultViewer(EARNINGS_PATH);
  const payoutPublicId = parseFinanceResourceId("payout", text(formData, "payout_public_id"));
  const idempotencyKey = parseFinanceIdempotencyKey(text(formData, "idempotency_key"));
  if (!payoutPublicId || !idempotencyKey) {
    return result("error", "The payout retry is invalid.", "error=retry-invalid");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("retry_payout", {
    requested_payout_public_id: payoutPublicId,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) return result("error", "The failed payout could not be retried safely.", "error=retry");

  revalidatePath(EARNINGS_PATH);
  return result("success", "Payout retry queued.", "notice=payout-retried");
}
