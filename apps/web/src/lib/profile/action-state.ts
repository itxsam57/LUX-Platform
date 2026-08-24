export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
};

export const INITIAL_PROFILE_ACTION_STATE: ProfileActionState = {
  status: "idle",
  message: "",
};

export type PrivacyActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_PRIVACY_ACTION_STATE: PrivacyActionState = {
  status: "idle",
  message: "",
};

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
