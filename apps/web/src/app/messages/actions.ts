"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseMessageBody, parseMessageHandle, parseMessageThreadId } from "@/lib/consumer/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function startDirectMessageAction(formData: FormData): Promise<void> {
  await requireAdultViewer("/messages");
  const handle = parseMessageHandle(formData.get("handle"));
  if (!handle) redirect("/messages?error=recipient");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_direct_message_thread", {
    requested_handle: handle,
  });
  const row = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  const publicId = parseMessageThreadId(row?.publicId);
  if (error || !publicId) redirect("/messages?error=unavailable");

  redirect(`/messages/${publicId}`);
}

export async function sendMessageAction(formData: FormData): Promise<void> {
  const publicId = parseMessageThreadId(formData.get("thread_public_id"));
  if (!publicId) redirect("/messages?error=thread");
  await requireAdultViewer(`/messages/${publicId}`);

  const body = parseMessageBody(formData.get("body"));
  const providedKey = formData.get("idempotency_key");
  const idempotencyKey = typeof providedKey === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(providedKey)
    ? providedKey
    : `message:${randomUUID()}`;
  if (!body) redirect(`/messages/${publicId}?error=body`);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("send_message", {
    requested_thread_public_id: publicId,
    requested_body: body,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) redirect(`/messages/${publicId}?error=send`);

  await supabase.rpc("mark_message_thread_read", { requested_thread_public_id: publicId });
  revalidatePath("/messages");
  revalidatePath(`/messages/${publicId}`);
  revalidatePath("/notifications");
  redirect(`/messages/${publicId}?notice=sent`);
}
