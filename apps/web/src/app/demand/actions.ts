"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer, requireWorkspace } from "@/lib/auth/context";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { normalizeDemandDraft } from "@/lib/demand/policy";
import { getConfiguredModerationAdapter } from "@/lib/moderation/runtime";
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
      scriptOutline: formText(formData, "script_outline"),
      budget: formText(formData, "budget_min_minor") || formText(formData, "budget_max_minor") || formText(formData, "budget_currency")
        ? {
            minMinor: Number(formText(formData, "budget_min_minor")),
            maxMinor: Number(formText(formData, "budget_max_minor")),
            currency: formText(formData, "budget_currency"),
          }
        : null,
      safetyLabels: formText(formData, "safety_labels").split(",").map((value) => value.trim()).filter(Boolean),
      expiresAt: formText(formData, "expires_at") || null,
    });
  } catch {
    redirect("/app/demand/new?error=invalid");
  }

  const supabase = await createServerSupabaseClient();
  const moderationText = [
    draft.title,
    draft.brief,
    draft.scriptOutline ?? "",
    draft.safetyLabels.join(" "),
  ].filter(Boolean).join("\n");
  const contentHash = createHash("sha256").update(JSON.stringify(draft)).digest("hex");
  let screening;
  try {
    screening = await getConfiguredModerationAdapter().screen({
      subject: "demand",
      contentHash,
      text: moderationText,
    });
  } catch {
    redirect("/app/demand/new?error=moderation-unavailable");
  }

  const { error: screeningError } = await supabase.rpc("record_content_screening_receipt", {
    requested_subject_kind: "demand",
    requested_content_hash: contentHash,
    requested_provider_key: screening.providerKey,
    requested_provider_reference: screening.providerReference,
    requested_decision: screening.decision,
    requested_labels: screening.labels,
  });
  if (screeningError) redirect("/app/demand/new?error=moderation-record");
  if (screening.decision !== "allow") {
    redirect(`/app/demand/new?error=moderation-${screening.decision}`);
  }

  const { data, error } = await supabase.rpc("create_demand_complete", { demand_input: draft });
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
  redirect(`/demand/${publicId}?notice=support`);
}

export async function respondToDemandAction(formData: FormData): Promise<NavigationActionResult> {
  await requireWorkspace("creator", "creator-demand");
  const publicId = safePublicId(formData.get("public_id"));
  const requestedResponse = formText(formData, "response");
  if (!publicId || (requestedResponse !== "declined" && requestedResponse !== "interested")) {
    return navigationActionResult(
      "error",
      "The creator response could not be recorded safely.",
      "/workspace/creator/demand?error=response",
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("respond_to_demand", {
    requested_public_id: publicId,
    requested_response: requestedResponse,
  });

  if (error) {
    return navigationActionResult(
      "error",
      "The creator response could not be recorded safely.",
      "/workspace/creator/demand?error=response",
    );
  }

  revalidatePath("/workspace/creator/demand");
  revalidatePath(`/demand/${publicId}`);
  revalidatePath("/app/demand");

  return navigationActionResult(
    "success",
    requestedResponse === "interested" ? "Interest recorded." : "Private decline recorded.",
    `/workspace/creator/demand?notice=${requestedResponse}&demand=${encodeURIComponent(publicId)}`,
  );
}


export async function addDemandDiscussionAction(formData: FormData): Promise<void> {
  const publicId = safePublicId(formData.get("public_id"));
  if (!publicId) redirect("/app/demand");
  await requireAdultViewer(`/demand/${publicId}`);

  const kind = formText(formData, "kind");
  const body = formText(formData, "body").trim();
  if (!["comment", "suggestion"].includes(kind) || body.length < 3 || body.length > 2000) {
    redirect(`/demand/${publicId}?error=discussion-invalid`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("add_demand_discussion_entry", {
    requested_demand_public_id: publicId,
    requested_kind: kind,
    requested_body: body,
  });
  if (error) redirect(`/demand/${publicId}?error=discussion`);
  revalidatePath(`/demand/${publicId}`);
  redirect(`/demand/${publicId}?notice=discussion`);
}

export async function hideDemandDiscussionAction(formData: FormData): Promise<void> {
  const publicId = safePublicId(formData.get("public_id"));
  const entryPublicId = formText(formData, "entry_public_id");
  if (!publicId || !/^dsc[0-9a-f]{24}$/.test(entryPublicId)) redirect("/app/demand");
  await requireAdultViewer(`/demand/${publicId}`);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_demand_discussion_entry_hidden", {
    requested_demand_public_id: publicId,
    requested_entry_public_id: entryPublicId,
    requested_hidden: true,
  });
  if (error) redirect(`/demand/${publicId}?error=discussion-moderation`);
  revalidatePath(`/demand/${publicId}`);
  redirect(`/demand/${publicId}?notice=discussion-hidden`);
}
