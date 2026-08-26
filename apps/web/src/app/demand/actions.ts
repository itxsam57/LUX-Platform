"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer, requireWorkspace } from "@/lib/auth/context";
import { normalizeDemandDraft } from "@/lib/demand/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const publicIdPattern = /^dem[A-Za-z0-9_-]{24}$/;

function safePublicId(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && publicIdPattern.test(value) ? value : null;
}

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createDemandAction(formData: FormData): Promise<void> {
  await requireAdultViewer("/app/demand/new");

  let draft;
  try {
    draft = normalizeDemandDraft({
      title: formText(formData, "title"),
      brief: formText(formData, "brief"),
      category: formText(formData, "category"),
      format: formText(formData, "format"),
      suggestedCreatorHandle: formText(formData, "suggested_creator_handle"),
    });
  } catch {
    redirect("/app/demand/new?error=invalid");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_demand", { demand_input: draft });
  const publicId = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>).publicId
    : null;

  if (error || typeof publicId !== "string" || !publicIdPattern.test(publicId)) {
    redirect("/app/demand/new?error=unavailable");
  }

  revalidatePath("/app/demand");
  redirect(`/demand/${publicId}`);
}

export async function setDemandSupportAction(formData: FormData): Promise<void> {
  const publicId = safePublicId(formData.get("public_id"));
  if (!publicId) redirect("/app/demand");
  await requireAdultViewer(`/demand/${publicId}`);

  const enabled = formText(formData, "enabled") === "true";
  const publiclyAttributed = enabled && formData.get("publicly_attributed") === "on";
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_demand_support", {
    requested_public_id: publicId,
    enabled,
    publicly_attributed: publiclyAttributed,
  });

  if (error) redirect(`/demand/${publicId}?error=support`);
  revalidatePath(`/demand/${publicId}`);
  revalidatePath("/app/demand");
}

export async function respondToDemandAction(formData: FormData): Promise<void> {
  await requireWorkspace("creator", "creator-demand");
  const publicId = safePublicId(formData.get("public_id"));
  const requestedResponse = formText(formData, "response");
  if (!publicId || (requestedResponse !== "declined" && requestedResponse !== "interested")) {
    redirect("/workspace/creator/demand?error=response");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("respond_to_demand", {
    requested_public_id: publicId,
    requested_response: requestedResponse,
  });

  if (error) redirect("/workspace/creator/demand?error=response");

  revalidatePath("/workspace/creator/demand");
  revalidatePath(`/demand/${publicId}`);
  revalidatePath("/app/demand");
  redirect(`/workspace/creator/demand?notice=${requestedResponse}&demand=${encodeURIComponent(publicId)}`);
}
