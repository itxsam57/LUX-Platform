"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const campaignPattern = /^cmp[0-9a-f]{24}$/;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function fundingPath(campaignPublicId: string, suffix?: string) {
  return `/app/funding/${campaignPublicId}${suffix ? `?${suffix}` : ""}`;
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
  redirect(fundingPath(campaignPublicId, "notice=confirmed"));
}
