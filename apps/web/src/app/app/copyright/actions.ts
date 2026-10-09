"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireWorkspace } from "@/lib/auth/context";
import { parseRightsRegistration } from "@/lib/copyright/policy";
import { getConfiguredMediaProtectionAdapter } from "@/lib/media-protection/runtime";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const COPYRIGHT_PATH = "/app/copyright";
const RELEASE_ID = /^rel[0-9a-f]{24}$/;
const RIGHTS_ID = /^crg[0-9a-f]{24}$/;
const JOB_ID = /^cwm[0-9a-f]{24}$/;
const SHA = /^[0-9a-f]{64}$/;
const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}:[0-9a-f]{16,128}$/;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

type ProtectionContext = {
  releasePublicId: string;
  bucket: string;
  objectPath: string;
  contentSha256: string;
  rightsPublicId: string | null;
  perceptualFingerprint: string | null;
  watermarkJobPublicId: string | null;
  watermarkState: "queued" | "completed" | "failed" | null;
};

function parseProtectionContext(value: unknown): ProtectionContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string,unknown>;
  const releasePublicId = typeof row.releasePublicId === "string" && RELEASE_ID.test(row.releasePublicId) ? row.releasePublicId : null;
  const bucket = row.bucket === "production-assets" ? row.bucket : null;
  const objectPath = typeof row.objectPath === "string" && row.objectPath.length > 3 && !row.objectPath.startsWith("/") && !row.objectPath.includes("..") ? row.objectPath : null;
  const contentSha256 = typeof row.contentSha256 === "string" && SHA.test(row.contentSha256) ? row.contentSha256 : null;
  const rightsPublicId = row.rightsPublicId === null ? null : typeof row.rightsPublicId === "string" && RIGHTS_ID.test(row.rightsPublicId) ? row.rightsPublicId : undefined;
  const perceptualFingerprint = row.perceptualFingerprint === null ? null : typeof row.perceptualFingerprint === "string" && FINGERPRINT.test(row.perceptualFingerprint) ? row.perceptualFingerprint : undefined;
  const watermarkJobPublicId = row.watermarkJobPublicId === null ? null : typeof row.watermarkJobPublicId === "string" && JOB_ID.test(row.watermarkJobPublicId) ? row.watermarkJobPublicId : undefined;
  const watermarkState = row.watermarkState === null ? null : row.watermarkState === "queued" || row.watermarkState === "completed" || row.watermarkState === "failed" ? row.watermarkState : undefined;
  return releasePublicId && bucket && objectPath && contentSha256
    && rightsPublicId !== undefined && perceptualFingerprint !== undefined
    && watermarkJobPublicId !== undefined && watermarkState !== undefined
    ? { releasePublicId,bucket,objectPath,contentSha256,rightsPublicId,perceptualFingerprint,watermarkJobPublicId,watermarkState }
    : null;
}

async function contextForRelease(releasePublicId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_creator_media_protection_context", {
    requested_release_public_id: releasePublicId,
  });
  return error ? null : parseProtectionContext(data);
}

async function tryProcessWatermark(context: ProtectionContext): Promise<boolean> {
  const adapter = getConfiguredMediaProtectionAdapter();
  if (!adapter || !context.rightsPublicId || !context.watermarkJobPublicId
    || !context.perceptualFingerprint || context.watermarkState !== "queued") return false;

  let result;
  try {
    result = await adapter.watermark({
      releasePublicId: context.releasePublicId,
      rightsPublicId: context.rightsPublicId,
      watermarkJobPublicId: context.watermarkJobPublicId,
      bucket: context.bucket,
      objectPath: context.objectPath,
      contentSha256: context.contentSha256,
      perceptualFingerprint: context.perceptualFingerprint,
    });
  } catch {
    return false;
  }

  const service = createServiceSupabaseClient();
  const { error } = await service.rpc("apply_media_protection_watermark_result", {
    requested_watermark_job_public_id: context.watermarkJobPublicId,
    requested_provider_key: result.providerKey,
    requested_provider_reference: result.providerReference,
    requested_watermark_reference: result.watermarkReference,
    requested_success: true,
  });
  return !error;
}

export async function registerReleaseRightsAction(formData: FormData): Promise<NavigationActionResult> {
  await requireWorkspace("creator", "creator-copyright");
  const releasePublicId = text(formData, "release_public_id").trim();
  if (!RELEASE_ID.test(releasePublicId)) {
    return navigationActionResult("error", "The rights registration details are invalid.", `${COPYRIGHT_PATH}?error=invalid-rights`);
  }

  const context = await contextForRelease(releasePublicId);
  if (!context) {
    return navigationActionResult("error", "The approved release asset could not be verified.", `${COPYRIGHT_PATH}?error=release-context`);
  }

  const adapter = getConfiguredMediaProtectionAdapter();
  let perceptualFingerprint = text(formData, "perceptual_fingerprint").trim();
  if (adapter) {
    try {
      const fingerprint = await adapter.fingerprint({
        releasePublicId,
        bucket: context.bucket,
        objectPath: context.objectPath,
        contentSha256: context.contentSha256,
      });
      perceptualFingerprint = fingerprint.perceptualFingerprint;
    } catch {
      return navigationActionResult("error", "The media-protection provider could not fingerprint this release.", `${COPYRIGHT_PATH}?error=fingerprint`);
    }
  }

  const parsed = parseRightsRegistration({
    ownershipKind: text(formData, "ownership_kind"),
    licenceReference: text(formData, "licence_reference"),
    ownershipEvidenceReference: text(formData, "ownership_evidence_reference"),
    contentSha256: context.contentSha256,
    perceptualFingerprint,
  });
  if (!parsed) {
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

  const refreshed = await contextForRelease(releasePublicId);
  const protectedNow = refreshed ? await tryProcessWatermark(refreshed) : false;
  revalidatePath(COPYRIGHT_PATH);
  return navigationActionResult(
    "success",
    protectedNow
      ? "Rights registration saved and media protection completed."
      : "Rights registration saved. Watermark processing remains queued.",
    `${COPYRIGHT_PATH}?notice=registered`,
  );
}

export async function processReleaseProtectionAction(formData: FormData): Promise<NavigationActionResult> {
  await requireWorkspace("creator", "creator-copyright");
  const releasePublicId = text(formData, "release_public_id").trim();
  if (!RELEASE_ID.test(releasePublicId)) {
    return navigationActionResult("error", "The protection request is invalid.", `${COPYRIGHT_PATH}?error=protection-invalid`);
  }

  const context = await contextForRelease(releasePublicId);
  if (!context || !context.rightsPublicId || !context.watermarkJobPublicId) {
    return navigationActionResult("error", "No queued media-protection job is available.", `${COPYRIGHT_PATH}?error=protection-context`);
  }
  if (context.watermarkState === "completed") {
    return navigationActionResult("success", "Media protection is already complete.", `${COPYRIGHT_PATH}?notice=protected`);
  }
  if (context.watermarkState !== "queued") {
    return navigationActionResult("error", "This watermark job is no longer queued.", `${COPYRIGHT_PATH}?error=protection-state`);
  }

  const completed = await tryProcessWatermark(context);
  if (!completed) {
    return navigationActionResult("error", "The media-protection provider is unavailable or did not complete the job.", `${COPYRIGHT_PATH}?error=protection-provider`);
  }

  revalidatePath(COPYRIGHT_PATH);
  return navigationActionResult("success", "Media protection completed.", `${COPYRIGHT_PATH}?notice=protected`);
}
