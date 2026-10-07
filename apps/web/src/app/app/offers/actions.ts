"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseAvailabilityInput, parseOfferInput } from "@/lib/creator/commerce";
import { getConfiguredModerationAdapter } from "@/lib/moderation/runtime";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PATH = "/app/offers";
const OFFER_ID = /^off[0-9a-f]{24}$/;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function requireCreatorContext() {
  const viewer = await requireAdultViewer(PATH);
  if (viewer.context.activeRole !== "creator" && viewer.context.activeRole !== "performer") {
    redirect("/access-denied?route=creator-offers");
  }
  return viewer;
}

export async function saveAvailabilityAction(formData: FormData): Promise<void> {
  await requireCreatorContext();
  let input;
  try {
    input = parseAvailabilityInput({
      status: formData.get("status"),
      nextAvailableAt: formData.get("next_available_at"),
      note: formData.get("note"),
    });
  } catch {
    redirect(`${PATH}?error=availability-invalid`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_creator_availability", {
    requested_status: input.status,
    requested_next_available_at: input.nextAvailableAt,
    requested_note: input.note,
  });
  if (error) redirect(`${PATH}?error=availability`);
  revalidatePath(PATH);
  revalidatePath("/workspace/creator");
  revalidatePath("/workspace/performer");
  redirect(`${PATH}?notice=availability`);
}

export async function createOfferAction(formData: FormData): Promise<void> {
  await requireCreatorContext();
  let input;
  try {
    input = parseOfferInput({
      title: formData.get("title"),
      description: formData.get("description"),
      category: formData.get("category"),
      roleName: formData.get("role_name"),
      startingMinor: text(formData, "starting_minor"),
      currency: text(formData, "currency"),
    });
  } catch {
    redirect(`${PATH}?error=offer-invalid`);
  }

  const supabase = await createServerSupabaseClient();
  const contentHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  let screening;
  try {
    screening = await getConfiguredModerationAdapter().screen({
      subject: "offer",
      contentHash,
      text: [input.title,input.description,input.category,input.roleName].join("\n"),
    });
  } catch {
    redirect(`${PATH}?error=moderation-unavailable`);
  }

  const { error: screeningError } = await supabase.rpc("record_content_screening_receipt", {
    requested_subject_kind: "offer",
    requested_content_hash: contentHash,
    requested_provider_key: screening.providerKey,
    requested_provider_reference: screening.providerReference,
    requested_decision: screening.decision,
    requested_labels: screening.labels,
  });
  if (screeningError) redirect(`${PATH}?error=moderation-record`);
  if (screening.decision !== "allow") redirect(`${PATH}?error=moderation-${screening.decision}`);

  const { error } = await supabase.rpc("create_creator_offer", { offer_input: input });
  if (error) redirect(`${PATH}?error=offer`);
  revalidatePath(PATH);
  redirect(`${PATH}?notice=offer`);
}

export async function setOfferStateAction(formData: FormData): Promise<void> {
  await requireCreatorContext();
  const publicId = text(formData, "offer_public_id").trim();
  const state = text(formData, "state").trim();
  if (!OFFER_ID.test(publicId) || !["active","paused","archived"].includes(state)) {
    redirect(`${PATH}?error=offer-state-invalid`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_creator_offer_state", {
    requested_offer_public_id: publicId,
    requested_state: state,
  });
  if (error) redirect(`${PATH}?error=offer-state`);
  revalidatePath(PATH);
  redirect(`${PATH}?notice=offer-state`);
}
