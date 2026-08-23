"use server";

import { revalidatePath } from "next/cache";
import { requireAdultViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function markNotificationReadAction(formData: FormData) {
  await requireAdultViewer("/notifications");
  const notificationId = formData.get("notification_id");
  if (typeof notificationId !== "string" || !UUID_PATTERN.test(notificationId)) return;
  const supabase = await createServerSupabaseClient();
  await supabase.rpc("mark_notification_read", { notification_id: notificationId });
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  await requireAdultViewer("/notifications");
  const supabase = await createServerSupabaseClient();
  await supabase.rpc("mark_all_notifications_read");
  revalidatePath("/notifications");
}
