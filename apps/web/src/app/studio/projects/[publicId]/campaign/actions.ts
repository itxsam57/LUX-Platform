"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const projectPattern = /^prj[0-9a-f]{24}$/;
const campaignPattern = /^cmp[0-9a-f]{24}$/;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function campaignPath(projectPublicId: string, campaignPublicId?: string, version?: number, suffix?: string) {
  const params = new URLSearchParams();
  if (campaignPublicId && campaignPattern.test(campaignPublicId)) params.set("campaign", campaignPublicId);
  if (version && Number.isInteger(version) && version > 0) params.set("version", String(version));
  if (suffix) {
    const [key, value] = suffix.split("=", 2);
    if (key && value) params.set(key, value);
  }
  const query = params.toString();
  return `/studio/projects/${projectPublicId}/campaign${query ? `?${query}` : ""}`;
}

export async function saveCampaignDraftAction(formData: FormData): Promise<void> {
  await requireWorkspace("creator", "campaign-draft-save");
  const projectPublicId = text(formData, "project_public_id");
  if (!projectPattern.test(projectPublicId)) redirect("/studio/projects");

  const target = Number(text(formData, "funding_target_minor"));
  const deadline = text(formData, "deadline");
  const requestedTerms = {
    fundingTargetMinor: target,
    currency: text(formData, "currency"),
    deadline: deadline ? `${deadline}T00:00:00.000Z` : "",
    expectedDeliveryWindow: text(formData, "expected_delivery_window"),
    guarantees: lines(text(formData, "guarantees")),
    optionalChoices: lines(text(formData, "optional_choices")),
    refundRules: text(formData, "refund_rules"),
    materialChangeRules: text(formData, "material_change_rules"),
  };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_campaign_draft", {
    requested_project_public_id: projectPublicId,
    requested_terms: requestedTerms,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    redirect(campaignPath(projectPublicId, text(formData, "campaign_public_id"), Number(text(formData, "terms_version")), "error=save"));
  }

  const result = data as Record<string, unknown>;
  const campaignPublicId = String(result.publicId ?? "");
  const version = Number(result.termsVersion ?? 0);
  if (!campaignPattern.test(campaignPublicId) || !Number.isInteger(version) || version < 1) {
    redirect(campaignPath(projectPublicId, undefined, undefined, "error=save"));
  }

  revalidatePath(`/studio/projects/${projectPublicId}/campaign`);
  redirect(campaignPath(projectPublicId, campaignPublicId, version, "notice=saved"));
}

export async function submitCampaignForPublishAction(formData: FormData): Promise<void> {
  await requireWorkspace("creator", "campaign-submit-publish");
  const projectPublicId = text(formData, "project_public_id");
  const campaignPublicId = text(formData, "campaign_public_id");
  const version = Number(text(formData, "terms_version"));
  if (!projectPattern.test(projectPublicId) || !campaignPattern.test(campaignPublicId) || !Number.isInteger(version) || version < 1) {
    redirect("/studio/projects");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("submit_campaign_for_publish", {
    requested_campaign_public_id: campaignPublicId,
    expected_terms_version: version,
  });
  if (error) redirect(campaignPath(projectPublicId, campaignPublicId, version, "error=submit"));

  revalidatePath(`/studio/projects/${projectPublicId}/campaign`);
  redirect(campaignPath(projectPublicId, campaignPublicId, version, "notice=review"));
}

export async function publishCampaignAction(formData: FormData): Promise<void> {
  await requireWorkspace("creator", "campaign-publish");
  const projectPublicId = text(formData, "project_public_id");
  const campaignPublicId = text(formData, "campaign_public_id");
  const version = Number(text(formData, "terms_version"));
  if (!projectPattern.test(projectPublicId) || !campaignPattern.test(campaignPublicId) || !Number.isInteger(version) || version < 1) {
    redirect("/studio/projects");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("publish_campaign", {
    requested_campaign_public_id: campaignPublicId,
    expected_terms_version: version,
  });
  if (error) redirect(campaignPath(projectPublicId, campaignPublicId, version, "error=publish"));

  revalidatePath(`/studio/projects/${projectPublicId}/campaign`);
  revalidatePath(`/p/${campaignPublicId}`);
  redirect(campaignPath(projectPublicId, campaignPublicId, version, "notice=published"));
}
