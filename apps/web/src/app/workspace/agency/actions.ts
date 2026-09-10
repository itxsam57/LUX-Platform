"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireWorkspace } from "@/lib/auth/context";
import {
  parseAgencyNegotiationInput,
  parseAgencyOpportunityInput,
  parseAgencyProfileInput,
  parseAgencyRepresentationInvite,
  parseAgencyStaffMutation,
  parseAgencyVerificationSubmission,
} from "@/lib/agency/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PATH = "/workspace/agency";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function result(status: "success" | "error", message: string, code: string): NavigationActionResult {
  return navigationActionResult(status, message, `${PATH}?${status === "success" ? "notice" : "error"}=${encodeURIComponent(code)}`);
}

async function agencyViewer() {
  return requireWorkspace("agency", "workspace-agency");
}

export async function ensureAgencyProfileAction(formData: FormData): Promise<NavigationActionResult> {
  await agencyViewer();
  const input = parseAgencyProfileInput({
    displayName: text(formData, "display_name"),
    jurisdictionCode: text(formData, "jurisdiction_code"),
  });
  if (!input) return result("error", "The agency profile details are invalid.", "profile-invalid");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("ensure_agency_profile", {
    requested_display_name: input.displayName,
    requested_jurisdiction_code: input.jurisdictionCode,
  });
  if (error) return result("error", "The agency profile could not be created safely.", "profile");
  revalidatePath(PATH);
  return result("success", "Agency profile created.", "profile-created");
}

export async function submitAgencyVerificationAction(formData: FormData): Promise<NavigationActionResult> {
  await agencyViewer();
  const input = parseAgencyVerificationSubmission({
    agencyPublicId: text(formData, "agency_public_id"),
    provider: text(formData, "provider"),
    evidenceReference: text(formData, "evidence_reference"),
  });
  if (!input) return result("error", "The verification submission is invalid.", "verification-invalid");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("submit_agency_verification", {
    requested_agency_public_id: input.agencyPublicId,
    requested_provider: input.provider,
    requested_evidence_reference: input.evidenceReference,
  });
  if (error) return result("error", "The agency verification could not be submitted safely.", "verification");
  revalidatePath(PATH);
  revalidatePath("/workspace/staff/agency-verification");
  return result("success", "Agency verification submitted.", "verification-submitted");
}

export async function changeAgencyStaffAction(formData: FormData): Promise<NavigationActionResult> {
  await agencyViewer();
  const input = parseAgencyStaffMutation({
    handle: text(formData, "handle"),
    staffRole: text(formData, "staff_role"),
    reason: text(formData, "reason"),
    enabled: text(formData, "enabled") === "true",
  });
  if (!input) return result("error", "The staff change is invalid.", "staff-invalid");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("upsert_agency_staff_member", {
    requested_handle: input.handle,
    requested_staff_role: input.staffRole,
    requested_reason: input.reason,
    enabled: input.enabled,
  });
  if (error) return result("error", "The agency staff role could not be changed safely.", "staff");
  revalidatePath(PATH);
  return result("success", "Agency staff role updated.", "staff-updated");
}

export async function invitePerformerRepresentationAction(formData: FormData): Promise<NavigationActionResult> {
  await agencyViewer();
  const input = parseAgencyRepresentationInvite({
    performerHandle: text(formData, "performer_handle"),
    terms: {
      communications: checked(formData, "scope_communications"),
      opportunities: checked(formData, "scope_opportunities"),
      negotiations: checked(formData, "scope_negotiations"),
      projectAdmin: checked(formData, "scope_project_admin"),
      contractAdmin: checked(formData, "scope_contract_admin"),
      earningsVisibility: checked(formData, "scope_earnings"),
      commissionBasisPoints: Number(text(formData, "commission_basis_points")),
      revocationNoticeDays: Number(text(formData, "revocation_notice_days")),
    },
  });
  if (!input) return result("error", "The representation terms are invalid.", "representation-invalid");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("invite_performer_representation", {
    requested_performer_handle: input.performerHandle,
    requested_terms: input.terms,
  });
  if (error) return result("error", "The representation invitation could not be created safely.", "representation");
  revalidatePath(PATH);
  revalidatePath("/app/representation");
  return result("success", "Representation invitation sent.", "representation-sent");
}

export async function createAgencyOpportunityAction(formData: FormData): Promise<NavigationActionResult> {
  await agencyViewer();
  const input = parseAgencyOpportunityInput({
    agreementPublicId: text(formData, "agreement_public_id"),
    title: text(formData, "title"),
    summary: text(formData, "summary"),
  });
  if (!input) return result("error", "The opportunity is invalid.", "opportunity-invalid");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("create_agency_opportunity", {
    requested_agreement_public_id: input.agreementPublicId,
    requested_title: input.title,
    requested_summary: input.summary,
  });
  if (error) return result("error", "The opportunity could not be created within the agreed scope.", "opportunity");
  revalidatePath(PATH);
  revalidatePath("/app/representation");
  return result("success", "Opportunity created.", "opportunity-created");
}

export async function advanceAgencyNegotiationAction(formData: FormData): Promise<NavigationActionResult> {
  await agencyViewer();
  const input = parseAgencyNegotiationInput({
    opportunityPublicId: text(formData, "opportunity_public_id"),
    stage: text(formData, "stage"),
    note: text(formData, "note"),
  });
  if (!input) return result("error", "The negotiation update is invalid.", "negotiation-invalid");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("advance_agency_negotiation", {
    requested_opportunity_public_id: input.opportunityPublicId,
    requested_stage: input.stage,
    requested_note: input.note,
  });
  if (error) return result("error", "The negotiation could not be changed within the agreed scope.", "negotiation");
  revalidatePath(PATH);
  revalidatePath("/app/representation");
  return result("success", "Negotiation updated.", "negotiation-updated");
}
