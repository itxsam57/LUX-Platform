import { requireAuthenticatedViewer } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await requireAuthenticatedViewer("/settings/privacy/export");
  const supabase = await createServerSupabaseClient();

  const [profileResult, membershipsResult, requestsResult, notificationsResult, auditResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("handle, display_name, bio, links, language_code, visibility, supporter_anonymity_default, created_at, updated_at")
      .eq("user_id", viewer.user.id)
      .maybeSingle(),
    supabase
      .from("workspace_memberships")
      .select("role, status, requested_at, reviewed_at, created_at, updated_at")
      .eq("user_id", viewer.user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("privacy_requests")
      .select("request_type, status, requested_at, updated_at")
      .eq("user_id", viewer.user.id)
      .order("requested_at", { ascending: true }),
    supabase
      .from("notifications")
      .select("type, target_path, read_at, created_at")
      .eq("recipient_user_id", viewer.user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("audit_events")
      .select("event_type, outcome, route_key, created_at")
      .eq("user_id", viewer.user.id)
      .order("created_at", { ascending: true }),
  ]);

  const body = JSON.stringify({
    schema: "lux-owner-export-v1",
    generated_at: new Date().toISOString(),
    account: { email: viewer.user.email ?? null },
    profile: profileResult.data ?? null,
    workspace_memberships: membershipsResult.data ?? [],
    privacy_requests: requestsResult.data ?? [],
    notifications: notificationsResult.data ?? [],
    audit_events: auditResult.data ?? [],
  }, null, 2);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"lux-account-export.json\"",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
