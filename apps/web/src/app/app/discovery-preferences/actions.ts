"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { normalizeNextPath } from "@/lib/auth/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ITEM_TYPES = new Set(["profile","demand","campaign","release"]);

function text(formData: FormData,key: string) {
  const value=formData.get(key);
  return typeof value==="string"?value.trim():"";
}

export async function setDiscoveryInterestAction(formData: FormData): Promise<void> {
  await requireAdultViewer("/app/discovery-preferences");
  const slug=text(formData,"slug").toLowerCase();
  const enabled=text(formData,"enabled")==="true";
  if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(slug)) redirect("/app/discovery-preferences?error=interest");
  const supabase=await createServerSupabaseClient();
  const { error }=await supabase.rpc("set_account_interest",{requested_interest_slug:slug,enabled});
  if (error) redirect("/app/discovery-preferences?error=interest");
  revalidatePath("/app/discovery-preferences");
  revalidatePath("/app/feed");
  redirect("/app/discovery-preferences?notice=interest");
}

export async function setHiddenTopicAction(formData: FormData): Promise<void> {
  await requireAdultViewer("/app/discovery-preferences");
  const slug=text(formData,"slug").toLowerCase();
  const hidden=text(formData,"hidden")==="true";
  if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(slug)) redirect("/app/discovery-preferences?error=topic");
  const supabase=await createServerSupabaseClient();
  const { error }=await supabase.rpc("set_hidden_topic",{requested_topic_slug:slug,hidden});
  if (error) redirect("/app/discovery-preferences?error=topic");
  revalidatePath("/app/discovery-preferences");
  revalidatePath("/app/feed");
  redirect("/app/discovery-preferences?notice=topic");
}

export async function setHiddenMarketplaceItemAction(formData: FormData): Promise<void> {
  const returnTo=normalizeNextPath(formData.get("return_to"));
  await requireAdultViewer(returnTo);
  const itemType=text(formData,"item_type");
  const itemPublicId=text(formData,"item_public_id");
  const hidden=text(formData,"hidden")==="true";
  if (!ITEM_TYPES.has(itemType) || itemPublicId.length<3 || itemPublicId.length>120) {
    redirect("/app/discovery-preferences?error=item");
  }
  const supabase=await createServerSupabaseClient();
  const { error }=await supabase.rpc("set_hidden_marketplace_item",{
    requested_item_type:itemType,
    requested_item_public_id:itemPublicId,
    requested_hidden:hidden,
  });
  if (error) redirect("/app/discovery-preferences?error=item");
  revalidatePath("/app/discovery-preferences");
  revalidatePath("/app/feed");
  revalidatePath("/app/explore");
  revalidatePath("/app/search");
  redirect(returnTo);
}
