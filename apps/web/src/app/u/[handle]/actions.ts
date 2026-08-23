"use server";

import { requireAdultViewer } from "@/lib/auth/context";
import { normalizeHandle, validateHandle } from "@/lib/profile/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type RelationshipState = {
  status: "idle" | "success" | "error";
  message: string;
  following?: boolean;
  blockedByMe?: boolean;
  mutedByMe?: boolean;
  followerCount?: number;
  followingCount?: number;
};

export const INITIAL_RELATIONSHIP_STATE: RelationshipState = {
  status: "idle",
  message: "",
};

const ACTIONS = new Set(["follow", "unfollow", "block", "unblock", "mute", "unmute"]);

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function profileRelationshipAction(
  previous: RelationshipState = INITIAL_RELATIONSHIP_STATE,
  formData: FormData,
): Promise<RelationshipState> {
  const target = normalizeHandle(String(formData.get("target_handle") ?? ""));
  const action = String(formData.get("relationship_action") ?? "").trim().toLowerCase();
  if (validateHandle(target) || !ACTIONS.has(action)) {
    return { ...previous, status: "error", message: "That profile action is invalid." };
  }

  await requireAdultViewer(`/u/${target}`);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("set_profile_relationship", {
    target_handle: target,
    relationship_action: action,
  });
  if (error || !data || typeof data !== "object") {
    return { ...previous, status: "error", message: "The relationship could not be updated safely." };
  }

  const result = data as Record<string, unknown>;
  return {
    status: "success",
    message: `${action.charAt(0).toUpperCase()}${action.slice(1)} complete.`,
    following: typeof result.following === "boolean" ? result.following : previous.following,
    blockedByMe: typeof result.blocked_by_me === "boolean" ? result.blocked_by_me : previous.blockedByMe,
    mutedByMe: typeof result.muted_by_me === "boolean" ? result.muted_by_me : previous.mutedByMe,
    followerCount: numberOrUndefined(result.follower_count) ?? previous.followerCount,
    followingCount: numberOrUndefined(result.following_count) ?? previous.followingCount,
  };
}
