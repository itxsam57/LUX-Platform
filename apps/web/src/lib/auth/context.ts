import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  adultAccessSatisfied,
  canAccessWorkspace,
  normalizeNextPath,
  parseViewerContext,
  type AppRole,
  type ViewerContext,
} from "./policy";
import { createServerSupabaseClient } from "../supabase/server";
import { getAgeAssuranceMode } from "../supabase/env";

export type AuthenticatedViewer = {
  user: User;
  context: ViewerContext;
};

function loginPath(nextPath: string, reason?: string): string {
  const params = new URLSearchParams({ next: normalizeNextPath(nextPath) });
  if (reason) params.set("reason", reason);
  return `/auth/login?${params.toString()}`;
}

async function recordDenied(
  routeKey: string,
  requiredRole: AppRole | "staff" | null,
  reason: string,
) {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.rpc("record_access_denied", {
      denied_route_key: routeKey,
      required_role: requiredRole === "staff" ? null : requiredRole,
      denial_reason: reason,
    });
  } catch {
    // A denial must still be enforced when audit storage is unavailable.
  }
}

export async function getOptionalViewer(): Promise<AuthenticatedViewer | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data, error } = await supabase.rpc("get_viewer_context");
  if (error) return null;
  const context = parseViewerContext(data);
  return context ? { user, context } : null;
}

export async function requireAuthenticatedViewer(nextPath = "/workspace"): Promise<AuthenticatedViewer> {
  let viewer: AuthenticatedViewer | null = null;
  try {
    viewer = await getOptionalViewer();
  } catch {
    redirect(loginPath(nextPath, "configuration"));
  }

  if (!viewer) redirect(loginPath(nextPath));
  if (!viewer.context.sessionValid) {
    await recordDenied("session", null, "session_revoked_or_expired");
    try {
      const supabase = await createServerSupabaseClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // The redirect remains the secure outcome.
    }
    redirect(loginPath(nextPath, "session-expired"));
  }

  if (!viewer.context.emailVerified) {
    redirect(`/auth/check-email?next=${encodeURIComponent(normalizeNextPath(nextPath))}`);
  }

  return viewer;
}

export async function requireAdultViewer(nextPath = "/workspace"): Promise<AuthenticatedViewer> {
  const viewer = await requireAuthenticatedViewer(nextPath);
  if (!adultAccessSatisfied(viewer.context, getAgeAssuranceMode())) {
    redirect(`/age-assurance?next=${encodeURIComponent(normalizeNextPath(nextPath))}`);
  }
  return viewer;
}

export async function requireWorkspace(
  requiredRole: AppRole | "staff",
  routeKey: string,
): Promise<AuthenticatedViewer> {
  const viewer = await requireAdultViewer(`/workspace/${requiredRole === "staff" ? "staff" : requiredRole}`);
  if (!canAccessWorkspace(viewer.context, requiredRole, getAgeAssuranceMode())) {
    await recordDenied(routeKey, requiredRole, "active_workspace_mismatch");
    redirect(`/access-denied?route=${encodeURIComponent(routeKey)}`);
  }
  return viewer;
}
