"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { normalizeNextPath } from "@/lib/auth/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const TYPES = new Set(["profile","demand","campaign","release"]);

export async function setSavedItemAction(formData: FormData): Promise<void> {
  const returnTo = normalizeNextPath(formData.get("return_to"));
  await requireAdultViewer(returnTo);
  const rawType = formData.get("item_type");
  const rawId = formData.get("item_public_id");
  const rawSaved = formData.get("saved");
  const itemType = typeof rawType === "string" && TYPES.has(rawType) ? rawType : null;
  const itemPublicId = typeof rawId === "string" && rawId.trim().length >= 3 && rawId.length <= 120 ? rawId.trim() : null;
  const saved = rawSaved === "true";
  if (!itemType || !itemPublicId) redirect("/app/saved?error=invalid");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_saved_item", {
    requested_item_type: itemType,
    requested_item_public_id: itemPublicId,
    requested_saved: saved,
  });
  if (error) redirect("/app/saved?error=save");

  revalidatePath("/app/saved");
  revalidatePath(returnTo);
  redirect(returnTo);
}
