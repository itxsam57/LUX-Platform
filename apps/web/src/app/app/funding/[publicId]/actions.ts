"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const campaignPattern = /^cmp[0-9a-f]{24}$/;
const fundingPattern = /^fnd[0-9a-f]{24}$/;
const hashPattern = /^[0-9a-f]{64}$/;
const badgeVisibility = new Set(["public", "private", "hidden"]);

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function fundingPath(publicId: string, suffix?: string) {
  return `/app/funding/${publicId}${suffix ? `?${suffix}` : ""}`;
}

function revalidateFunding(commitmentPublicId: string) {
  revalidatePath("/app/funding");
  revalidatePath(fundingPath(commitmentPublicId));
}

export async function createPrebookAction(formData: FormData): Promise<void> {
  const campaignPublicId = text(formData, "campaign_public_id");
  if (!campaignPattern.test(campaignPublicId)) redirect("/app/funding");
  await requireAdultViewer(fundingPath(campaignPublicId));

  const amountMinor = Number(text(formData, "amount_minor"));
  const idempotencyKey = text(formData, "idempotency_key");
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) {
    redirect(fundingPath(campaignPublicId, "error=amount"));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("create_prebook", {
    requested_campaign_public_id: campaignPublicId,
    requested_amount_minor: amountMinor,
    requested_supporter_visibility: text(formData, "supporter_visibility"),
    requested_badge_choice: text(formData, "badge_choice") || null,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) redirect(fundingPath(campaignPublicId, "error=prebook"));

  revalidatePath(`/p/${campaignPublicId}`);
  revalidatePath(fundingPath(campaignPublicId));
  revalidatePath("/app/funding");
  redirect(fundingPath(campaignPublicId, "notice=confirmed"));
}

export async function saveSupporterBadgeAction(formData: FormData): Promise<NavigationActionResult> {
  const commitmentPublicId = text(formData, "commitment_public_id");
  if (!fundingPattern.test(commitmentPublicId)) {
    return navigationActionResult("error", "The badge request is invalid.", "/app/funding?error=badge");
  }
  await requireAdultViewer(fundingPath(commitmentPublicId));
  const badgeKey = text(formData, "badge_key");
  const visibility = text(formData, "visibility");
  if (badgeKey.length < 2 || badgeKey.length > 64 || !badgeVisibility.has(visibility)) {
    return navigationActionResult("error", "The badge request is invalid.", fundingPath(commitmentPublicId, "error=badge"));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_supporter_badge", {
    requested_commitment_public_id: commitmentPublicId,
    requested_badge_key: badgeKey,
    requested_visibility: visibility,
  });
  if (error) {
    return navigationActionResult("error", "The badge could not be updated safely.", fundingPath(commitmentPublicId, "error=badge"));
  }
  revalidateFunding(commitmentPublicId);
  return navigationActionResult("success", "Badge updated", fundingPath(commitmentPublicId, "notice=badge"));
}

export async function acceptChangedTermsAction(formData: FormData): Promise<NavigationActionResult> {
  const commitmentPublicId = text(formData, "commitment_public_id");
  if (!fundingPattern.test(commitmentPublicId)) {
    return navigationActionResult("error", "The changed-terms request is invalid.", "/app/funding?error=changed");
  }
  await requireAdultViewer(fundingPath(commitmentPublicId));
  const termsVersion = Number(text(formData, "terms_version"));
  const termsHash = text(formData, "terms_hash");
  const idempotencyKey = text(formData, "idempotency_key");
  if (!Number.isSafeInteger(termsVersion) || termsVersion < 1 || !hashPattern.test(termsHash) || idempotencyKey.length < 8) {
    return navigationActionResult("error", "The changed-terms request is invalid.", fundingPath(commitmentPublicId, "error=changed"));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("accept_changed_campaign_terms", {
    requested_commitment_public_id: commitmentPublicId,
    requested_terms_version: termsVersion,
    requested_terms_hash: termsHash,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) {
    return navigationActionResult("error", "The changed campaign terms could not be accepted safely.", fundingPath(commitmentPublicId, "error=changed"));
  }
  revalidateFunding(commitmentPublicId);
  return navigationActionResult("success", "Changed terms accepted", fundingPath(commitmentPublicId, "notice=changed"));
}

export async function requestFundingRefundAction(formData: FormData): Promise<NavigationActionResult> {
  const commitmentPublicId = text(formData, "commitment_public_id");
  if (!fundingPattern.test(commitmentPublicId)) {
    return navigationActionResult("error", "The refund request is invalid.", "/app/funding?error=refund");
  }
  await requireAdultViewer(fundingPath(commitmentPublicId));
  const amountMinor = Number(text(formData, "amount_minor"));
  const reason = text(formData, "reason");
  const idempotencyKey = text(formData, "idempotency_key");
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || reason.length < 3 || reason.length > 1000 || idempotencyKey.length < 8) {
    return navigationActionResult("error", "The refund request is invalid.", fundingPath(commitmentPublicId, "error=refund"));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("request_funding_refund", {
    requested_commitment_public_id: commitmentPublicId,
    requested_amount_minor: amountMinor,
    requested_reason: reason,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) {
    return navigationActionResult("error", "The refund request could not be recorded safely.", fundingPath(commitmentPublicId, "error=refund"));
  }
  revalidateFunding(commitmentPublicId);
  return navigationActionResult("success", "Refund requested", fundingPath(commitmentPublicId, "notice=refund"));
}
