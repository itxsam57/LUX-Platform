"use server";

import { requireAdultViewer } from "@/lib/auth/context";
import { INITIAL_PROFILE_ACTION_STATE, type ProfileActionState } from "@/lib/profile/action-state";
import { processProfileMedia } from "@/lib/profile/media";
import {
  normalizeHandle,
  normalizeLanguageTag,
  sanitizeProfileLinks,
  validateBio,
  validateDisplayName,
  validateHandle,
  validateLanguageTag,
  validateProfileMedia,
  type ProfileLink,
  type ProfileMediaKind,
  type ProfileVisibility,
} from "@/lib/profile/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const VISIBILITIES = new Set<ProfileVisibility>(["public", "unlisted", "private"]);
const MEDIA_KINDS = new Set<ProfileMediaKind>(["avatar", "banner"]);

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorState(message: string, fieldErrors?: Record<string, string>): ProfileActionState {
  return { status: "error", message, fieldErrors };
}

export async function saveProfileAction(
  previous: ProfileActionState = INITIAL_PROFILE_ACTION_STATE,
  formData: FormData,
): Promise<ProfileActionState> {
  void previous;
  await requireAdultViewer("/settings/profile");

  const handle = normalizeHandle(text(formData, "handle"));
  const displayName = text(formData, "display_name").trim();
  const bio = text(formData, "bio");
  const languageCode = normalizeLanguageTag(text(formData, "language_code"));
  const visibilityValue = text(formData, "visibility");
  const fieldErrors: Record<string, string> = {};

  const handleError = validateHandle(handle);
  const displayNameError = validateDisplayName(displayName);
  const bioError = validateBio(bio);
  const languageError = validateLanguageTag(languageCode);
  if (handleError) fieldErrors.handle = handleError;
  if (displayNameError) fieldErrors.display_name = displayNameError;
  if (bioError) fieldErrors.bio = bioError;
  if (languageError) fieldErrors.language_code = languageError;
  if (!VISIBILITIES.has(visibilityValue as ProfileVisibility)) {
    fieldErrors.visibility = "Choose a valid profile visibility.";
  }

  const rawLinks: ProfileLink[] = [];
  for (let index = 1; index <= 5; index += 1) {
    const label = text(formData, `link_label_${index}`).trim();
    const url = text(formData, `link_url_${index}`).trim();
    if (!label && !url) continue;
    rawLinks.push({ label, url });
  }
  const sanitizedLinks = sanitizeProfileLinks(rawLinks);
  if (sanitizedLinks.error) fieldErrors.links = sanitizedLinks.error;

  if (Object.keys(fieldErrors).length > 0) {
    return errorState("Check the highlighted profile fields.", fieldErrors);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_profile", {
    requested_handle: handle,
    requested_display_name: displayName,
    requested_bio: bio,
    requested_links: sanitizedLinks.links,
    requested_language_code: languageCode,
    requested_visibility: visibilityValue,
  });

  if (error) {
    if (error.message.includes("profile_handle_taken")) {
      return errorState("That handle is already in use.", { handle: "Choose another handle." });
    }
    if (error.message.includes("reserved_profile_handle")) {
      return errorState("That handle is reserved.", { handle: "Choose another handle." });
    }
    return errorState("The profile could not be saved safely.");
  }

  return { status: "success", message: "Profile saved." };
}

export async function uploadProfileMediaAction(
  previous: ProfileActionState = INITIAL_PROFILE_ACTION_STATE,
  formData: FormData,
): Promise<ProfileActionState> {
  void previous;
  await requireAdultViewer("/settings/profile");

  const kindValue = text(formData, "kind");
  if (!MEDIA_KINDS.has(kindValue as ProfileMediaKind)) {
    return errorState("The selected profile image type is invalid.");
  }
  const kind = kindValue as ProfileMediaKind;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorState(`Choose a ${kind} image first.`, { [`${kind}_file`]: "Choose an image." });
  }

  const mediaError = validateProfileMedia(kind, file.type, file.size);
  if (mediaError) return errorState(mediaError, { [`${kind}_file`]: mediaError });

  let processed: Awaited<ReturnType<typeof processProfileMedia>>;
  try {
    processed = await processProfileMedia(kind, Buffer.from(await file.arrayBuffer()));
  } catch {
    return errorState("The image could not be decoded safely.", { [`${kind}_file`]: "Choose a valid JPEG, PNG, or WebP image." });
  }

  const supabase = await createServerSupabaseClient();
  const { data: uploadPath, error: pathError } = await supabase.rpc("get_profile_media_upload_path", {
    media_kind: kind,
  });
  if (pathError || typeof uploadPath !== "string" || !uploadPath.endsWith(`/${kind}.webp`)) {
    return errorState("A safe upload path could not be created.");
  }

  const { error: uploadError } = await supabase.storage
    .from("profile-media")
    .upload(uploadPath, processed.buffer, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: true,
    });
  if (uploadError) return errorState("The processed image could not be stored safely.");

  const { error: commitError } = await supabase.rpc("commit_profile_media", { media_kind: kind });
  if (commitError) return errorState("The image was processed but could not be attached to the profile safely.");

  return {
    status: "success",
    message: `${kind === "avatar" ? "Avatar" : "Banner"} updated as metadata-stripped WebP.`,
  };
}
