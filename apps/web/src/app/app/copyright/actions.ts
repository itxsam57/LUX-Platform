"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireWorkspace } from "@/lib/auth/context";
import { parseRightsRegistration } from "@/lib/copyright/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const COPYRIGHT_PATH = "/app/copyright";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function registerReleaseRightsAction(formData: FormData): Promise<NavigationActionResult> {
  await requireWorkspace("creator", "creator-copyright");
  const releasePublicId = text(formData, "release_public_id").trim();
  const parsed = parseRightsRegistration({
    ownershipKind: text(formData, "ownership_kind"),
    licenceReference: text(formData, "licence_reference"),
    ownershipEvidenceReference: text(formData, "ownership_evidence_reference"),
    contentSha256: text(formData, "content_sha256"),
    perceptualFingerprint: text(formData, "perceptual_fingerprint"),
  });
  if (!/^rel[0-9a-f]{24}$/.test(releasePublicId) || !parsed) {
    return navigationActionResult("error", "The rights registration details are invalid.", `${COPYRIGHT_PATH}?error=invalid-rights`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("register_release_rights", {
    requested_release_public_id: releasePublicId,
    requested_ownership_kind: parsed.ownershipKind,
    requested_licence_reference: parsed.licenceReference,
    requested_ownership_evidence_reference: parsed.ownershipEvidenceReference,
    requested_content_sha256: parsed.contentSha256,
    requested_perceptual_fingerprint: parsed.perceptualFingerprint,
  });
  if (error) {
    return navigationActionResult("error", "Rights could not be registered for this release.", `${COPYRIGHT_PATH}?error=registration`);
  }
  revalidatePath(COPYRIGHT_PATH);
  return navigationActionResult("success", "Rights registration saved and watermark processing queued.", `${COPYRIGHT_PATH}?notice=registered`);
}
