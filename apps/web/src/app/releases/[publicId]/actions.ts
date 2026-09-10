"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseDeviceId, parseReleaseAssetGrant, parseReleasePlaybackGrant, parseReleaseReview, parseStolenCopyReport } from "@/lib/releases/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const releasePattern = /^rel[0-9a-f]{24}$/;
const deviceCookie = "lux-release-device";
function text(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }
function releasePath(publicId: string, suffix?: string) { return `/releases/${publicId}${suffix ? `?${suffix}` : ""}`; }
function invalid(publicId: string) { return navigationActionResult("error", "The release request is invalid.", releasePattern.test(publicId) ? releasePath(publicId, "error=invalid") : "/workspace/fan?error=invalid"); }

async function clientFor(publicId: string) {
  await requireAdultViewer(releasePath(publicId));
  return createServerSupabaseClient();
}

async function stableDeviceId() {
  const store = await cookies();
  const existing = parseDeviceId(store.get(deviceCookie)?.value);
  if (existing) return existing;
  const created = `browser-${randomUUID().replaceAll("-", "")}`;
  store.set(deviceCookie, created, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return created;
}

export async function issueReleasePlaybackAction(formData: FormData): Promise<NavigationActionResult> {
  const publicId = text(formData, "release_public_id"); if (!releasePattern.test(publicId)) return invalid(publicId);
  const supabase = await clientFor(publicId), deviceId = await stableDeviceId();
  const { data, error } = await supabase.rpc("issue_release_playback", { requested_release_public_id: publicId, requested_device_id: deviceId });
  const grant = error ? null : parseReleasePlaybackGrant(data);
  return grant
    ? navigationActionResult("success", "Secure playback issued.", grant.playbackPath)
    : navigationActionResult("error", "Playback is unavailable for this account.", releasePath(publicId, "error=playback"));
}

export async function issueReleaseAssetAction(formData: FormData): Promise<NavigationActionResult> {
  const publicId = text(formData, "release_public_id"), kind = text(formData, "kind");
  if (!releasePattern.test(publicId) || (kind !== "poster" && kind !== "preview")) return invalid(publicId);
  const supabase = await clientFor(publicId);
  const { data, error } = await supabase.rpc("issue_release_asset_access", { requested_release_public_id: publicId, requested_kind: kind });
  const grant = error ? null : parseReleaseAssetGrant(data);
  return grant
    ? navigationActionResult("success", "Release asset access issued.", grant.assetPath)
    : navigationActionResult("error", "This release asset is unavailable.", releasePath(publicId, "error=asset"));
}

export async function submitReleaseReviewAction(formData: FormData): Promise<NavigationActionResult> {
  const publicId = text(formData, "release_public_id"), review = parseReleaseReview(text(formData, "rating"), text(formData, "body"));
  if (!releasePattern.test(publicId) || !review) return invalid(publicId);
  const supabase = await clientFor(publicId);
  const { error } = await supabase.rpc("submit_release_review", { requested_release_public_id: publicId, requested_rating: review.rating, requested_body: review.body });
  if (error) return navigationActionResult("error", "Your review could not be saved.", releasePath(publicId, "error=review"));
  revalidatePath(releasePath(publicId));
  return navigationActionResult("success", "Review saved.", releasePath(publicId, "notice=review"));
}

export async function reportReleaseStolenCopyAction(formData: FormData): Promise<NavigationActionResult> {
  const publicId = text(formData, "release_public_id"), report = parseStolenCopyReport(text(formData, "url"), text(formData, "note"));
  if (!releasePattern.test(publicId) || !report) return invalid(publicId);
  const supabase = await clientFor(publicId);
  const { error } = await supabase.rpc("report_release_stolen_copy", { requested_release_public_id: publicId, requested_url: report.url, requested_note: report.note });
  return error
    ? navigationActionResult("error", "The copied-release report could not be recorded.", releasePath(publicId, "error=report"))
    : navigationActionResult("success", "Copied-release report recorded.", releasePath(publicId, "notice=report"));
}
