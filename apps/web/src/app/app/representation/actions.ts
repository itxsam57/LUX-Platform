"use server";

import { revalidatePath } from "next/cache";
import { navigationActionResult, type NavigationActionResult } from "@/lib/actions/navigation";
import { requireAdultViewer } from "@/lib/auth/context";
import {
  parseAgencyRepresentationDecision,
  parseAgencyRepresentationRevocation,
} from "@/lib/agency/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PATH = "/app/representation";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function result(status: "success" | "error", message: string, code: string): NavigationActionResult {
  return navigationActionResult(status, message, `${PATH}?${status === "success" ? "notice" : "error"}=${encodeURIComponent(code)}`);
}

export async function respondToAgencyRepresentationAction(formData: FormData): Promise<NavigationActionResult> {
  await requireAdultViewer(PATH);
  const input = parseAgencyRepresentationDecision({
    agreementPublicId: text(formData, "agreement_public_id"),
    decision: text(formData, "decision"),
  });
  if (!input) return result("error", "The representation response is invalid.", "response-invalid");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("respond_agency_representation", {
    requested_agreement_public_id: input.agreementPublicId,
    requested_decision: input.decision,
  });
  if (error) return result("error", "The representation response could not be recorded safely.", "response");

  revalidatePath(PATH);
  revalidatePath("/workspace/agency");
  return result("success", input.decision === "accept" ? "Representation accepted." : "Representation declined.", input.decision);
}

export async function revokeAgencyRepresentationAction(formData: FormData): Promise<NavigationActionResult> {
  await requireAdultViewer(PATH);
  const input = parseAgencyRepresentationRevocation({
    agreementPublicId: text(formData, "agreement_public_id"),
    reason: text(formData, "reason"),
  });
  if (!input) return result("error", "The revocation request is invalid.", "revocation-invalid");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("revoke_agency_representation", {
    requested_agreement_public_id: input.agreementPublicId,
    requested_reason: input.reason,
  });
  if (error) return result("error", "The representation could not be revoked safely.", "revocation");

  revalidatePath(PATH);
  revalidatePath("/workspace/agency");
  return result("success", "Representation revocation recorded.", "revoked");
}
