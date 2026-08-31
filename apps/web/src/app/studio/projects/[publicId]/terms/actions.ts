"use server";

import { revalidatePath } from "next/cache";
import { requireAdultViewer, requireWorkspace } from "@/lib/auth/context";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const projectPattern = /^prj[0-9a-f]{24}$/;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function termsPath(projectPublicId: string) {
  return `/studio/projects/${projectPublicId}/terms`;
}

function invalidProjectResult(): NavigationActionResult {
  return navigationActionResult("error", "The project reference is invalid.", "/studio/projects?error=invalid");
}

export async function publishTermsAction(formData: FormData): Promise<NavigationActionResult> {
  await requireWorkspace("creator", "project-terms-publish");
  const projectPublicId = text(formData, "project_public_id");
  if (!projectPattern.test(projectPublicId)) return invalidProjectResult();

  const revision = Number(text(formData, "project_revision"));
  const participants = text(formData, "participants")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [handle, role, depicted] = line.split("|").map((value) => value.trim());
      return {
        handle: handle?.toLowerCase(),
        role: role?.toLowerCase(),
        depicted: depicted?.toLowerCase() === "true",
      };
    });
  const terms = {
    participants,
    role: text(formData, "role").toLowerCase(),
    boundaries: csv(text(formData, "boundaries")),
    collaborators: csv(text(formData, "collaborators")).map((value) => value.toLowerCase()),
    compensation: text(formData, "compensation"),
    distributionScope: text(formData, "distribution_scope"),
    rightsScope: text(formData, "rights_scope"),
    schedule: text(formData, "schedule"),
    cancellation: text(formData, "cancellation"),
    finalCutApprovalRequired: text(formData, "final_cut") === "true",
  };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("publish_project_terms", {
    requested_project_public_id: projectPublicId,
    expected_project_revision: revision,
    requested_terms: terms,
  });
  if (error) {
    return navigationActionResult("error", "The terms could not be published safely.", `${termsPath(projectPublicId)}?error=publish`);
  }

  revalidatePath(termsPath(projectPublicId));
  return navigationActionResult("success", "Immutable terms published.", `${termsPath(projectPublicId)}?notice=published`);
}

export async function acceptTermsAction(formData: FormData): Promise<NavigationActionResult> {
  await requireAdultViewer("/studio/projects");
  const projectPublicId = text(formData, "project_public_id");
  const hash = text(formData, "terms_hash");
  if (!projectPattern.test(projectPublicId)) return invalidProjectResult();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("accept_project_terms", {
    requested_project_public_id: projectPublicId,
    requested_terms_hash: hash,
    step_up_proof: text(formData, "step_up_proof"),
  });
  if (error) {
    return navigationActionResult("error", "The terms acceptance was denied.", `${termsPath(projectPublicId)}?error=accept`);
  }

  revalidatePath(termsPath(projectPublicId));
  return navigationActionResult("success", "Terms accepted personally.", `${termsPath(projectPublicId)}?notice=accepted`);
}

export async function recordConsentAction(formData: FormData): Promise<NavigationActionResult> {
  await requireAdultViewer("/studio/projects");
  const projectPublicId = text(formData, "project_public_id");
  const hash = text(formData, "terms_hash");
  if (!projectPattern.test(projectPublicId)) return invalidProjectResult();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("record_depicted_consent", {
    requested_project_public_id: projectPublicId,
    requested_terms_hash: hash,
    step_up_proof: text(formData, "step_up_proof"),
  });
  if (error) {
    return navigationActionResult("error", "The depicted-person consent was denied.", `${termsPath(projectPublicId)}?error=consent`);
  }

  revalidatePath(termsPath(projectPublicId));
  return navigationActionResult("success", "Depicted-person consent recorded personally.", `${termsPath(projectPublicId)}?notice=consented`);
}

export async function lockContractAction(formData: FormData): Promise<NavigationActionResult> {
  await requireWorkspace("creator", "project-contract-lock");
  const projectPublicId = text(formData, "project_public_id");
  const hash = text(formData, "terms_hash");
  if (!projectPattern.test(projectPublicId)) return invalidProjectResult();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("lock_project_contract", {
    requested_project_public_id: projectPublicId,
    requested_terms_hash: hash,
  });
  if (error) {
    return navigationActionResult("error", "The contract could not be locked.", `${termsPath(projectPublicId)}?error=lock`);
  }

  revalidatePath(termsPath(projectPublicId));
  revalidatePath(`/studio/projects/${projectPublicId}`);
  return navigationActionResult("success", "Contract locked.", `${termsPath(projectPublicId)}?notice=locked`);
}
