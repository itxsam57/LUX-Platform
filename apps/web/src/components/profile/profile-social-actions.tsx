"use client";

import { useActionState } from "react";
import {
  INITIAL_RELATIONSHIP_STATE,
  profileRelationshipAction,
  type RelationshipState,
} from "@/app/u/[handle]/actions";
import { Button } from "@/components/ui/primitives";

export function ProfileSocialActions({
  handle,
  initial,
}: {
  handle: string;
  initial: Pick<RelationshipState, "following" | "blockedByMe" | "mutedByMe" | "followerCount" | "followingCount">;
}) {
  const [state, action, pending] = useActionState(profileRelationshipAction, {
    ...INITIAL_RELATIONSHIP_STATE,
    ...initial,
  });

  return (
    <section className="profile-social-panel" aria-label="Profile relationship controls">
      <div className="profile-social-counts" aria-live="polite">
        <span><strong>{state.followerCount ?? 0}</strong> followers</span>
        <span><strong>{state.followingCount ?? 0}</strong> following</span>
      </div>
      <form action={action} className="profile-social-actions">
        <input type="hidden" name="target_handle" value={handle} />
        <Button
          type="submit"
          name="relationship_action"
          value={state.following ? "unfollow" : "follow"}
          variant={state.following ? "secondary" : "primary"}
          loading={pending}
        >
          {state.following ? "Unfollow" : "Follow"}
        </Button>
        <Button
          type="submit"
          name="relationship_action"
          value={state.blockedByMe ? "unblock" : "block"}
          variant={state.blockedByMe ? "secondary" : "danger"}
          loading={pending}
        >
          {state.blockedByMe ? "Unblock" : "Block"}
        </Button>
        <Button
          type="submit"
          name="relationship_action"
          value={state.mutedByMe ? "unmute" : "mute"}
          variant="quiet"
          loading={pending}
        >
          {state.mutedByMe ? "Unmute" : "Mute"}
        </Button>
      </form>
      {state.message ? (
        <p className={state.status === "error" ? "auth-message auth-message--error" : "auth-message auth-message--success"} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
