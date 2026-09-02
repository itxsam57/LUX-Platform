"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdultViewer, requireWorkspace } from "@/lib/auth/context";
import { normalizeProjectDraft } from "@/lib/projects/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  INITIAL_PROJECT_MUTATION_STATE,
  type ProjectMutationState,
} from "./project-mutation-state";

const projectIdPattern = /^prj[0-9a-f]{24}$/;
const demandIdPattern = /^dem[A-Za-z0-9_-]{24}$/;
const invitationIdPattern = /^inv[0-9a-f]{24}$/;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function list(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function projectInput(formData: FormData) {
  return normalizeProjectDraft({
    title: text(formData, "title"),
    publicSynopsis: text(formData, "public_synopsis"),
    privateBrief: text(formData, "private_brief"),
    category: text(formData, "category"),
    format: text(formData, "format"),
    boundaries: list(text(formData, "boundaries")),
    compensationModel: text(formData, "compensation_model"),
    distributionScope: text(formData, "distribution_scope"),
    rightsDeclarations: list(text(formData, "rights_declarations")),
  });
}

function publicId(data: unknown, pattern: RegExp): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>).publicId;
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function projectMutationError(message: string, destination: string): ProjectMutationState {
  return { status: "error", message, destination };
}

export async function createProjectAction(
  previous: ProjectMutationState = INITIAL_PROJECT_MUTATION_STATE,
  formData: FormData,
): Promise<ProjectMutationState> {
  void previous;
  await requireWorkspace("creator", "studio-project-create");

  let input;
  try {
    input = projectInput(formData);
  } catch {
    return projectMutationError("The project draft is invalid.", "/studio/projects/new?error=invalid");
  }

  const sourceDemand = text(formData, "source_demand_public_id");
  const supabase = await createServerSupabaseClient();
  const result = sourceDemand
    ? (demandIdPattern.test(sourceDemand)
      ? await supabase.rpc("convert_demand_to_project", { requested_demand_public_id: sourceDemand, project_input: input })
      : { data: null, error: new Error("invalid demand") })
    : await supabase.rpc("create_project_draft", { project_input: input });
  const id = publicId(result.data, projectIdPattern);

  if (result.error || !id) {
    return projectMutationError(
      sourceDemand ? "The demand could not be converted into a project safely." : "The project draft could not be created safely.",
      `/studio/projects/new?error=${sourceDemand ? "conversion" : "create"}`,
    );
  }

  revalidatePath("/studio/projects");
  revalidatePath("/workspace/creator/demand");
  if (sourceDemand) revalidatePath(`/demand/${sourceDemand}`);

  return {
    status: "success",
    message: "Project draft created.",
    destination: `/studio/projects/${id}`,
  };
}

export async function updateProjectAction(
  previous: ProjectMutationState = INITIAL_PROJECT_MUTATION_STATE,
  formData: FormData,
): Promise<ProjectMutationState> {
  void previous;
  await requireWorkspace("creator", "studio-project-edit");

  const id = text(formData, "project_public_id");
  const revision = Number(text(formData, "expected_revision"));
  if (!projectIdPattern.test(id) || !Number.isSafeInteger(revision)) {
    return projectMutationError("The project revision request is invalid.", "/studio/projects?error=invalid");
  }

  let input;
  try {
    input = projectInput(formData);
  } catch {
    return projectMutationError("The project draft is invalid.", `/studio/projects/${id}?error=invalid`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_project_draft", {
    requested_public_id: id,
    expected_revision: revision,
    project_input: input,
  });
  if (error) {
    const code = error.code === "PT409" ? "conflict" : "save";
    return projectMutationError(
      code === "conflict"
        ? "This draft changed elsewhere. Reloaded state must be reviewed before saving again."
        : "The project revision could not be saved safely.",
      `/studio/projects/${id}?error=${code}`,
    );
  }

  revalidatePath(`/studio/projects/${id}`);
  revalidatePath("/studio/projects");
  revalidatePath("/studio/invitations");

  return {
    status: "success",
    message: "Revision saved.",
    destination: `/studio/projects/${id}?notice=saved`,
  };
}

export async function setAgencyAuthorityAction(formData: FormData): Promise<void> {
  await requireWorkspace("creator", "studio-project-agency");
  const id = text(formData, "project_public_id");
  if (!projectIdPattern.test(id)) redirect("/studio/projects");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_project_agency_authority", {
    requested_project_public_id: id,
    requested_agency_handle: text(formData, "agency_handle"),
    enabled: text(formData, "enabled") !== "false",
  });
  if (error) redirect(`/studio/projects/${id}?error=agency`);
  revalidatePath(`/studio/projects/${id}`);
  redirect(`/studio/projects/${id}?notice=agency`);
}

export async function sendInvitationAction(formData: FormData): Promise<void> {
  await requireAdultViewer("/studio/invitations");
  const projectId = text(formData, "project_public_id");
  if (!projectIdPattern.test(projectId)) redirect("/studio/projects");
  const note = text(formData, "note");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("send_project_invitation", {
    requested_project_public_id: projectId,
    requested_recipient_handle: text(formData, "recipient_handle"),
    requested_role_name: text(formData, "role_name"),
    proposal: { note },
  });
  const id = publicId(data, invitationIdPattern);
  if (error || !id) redirect(`/studio/projects/${projectId}?error=invite`);
  revalidatePath("/studio/invitations");
  redirect(`/studio/invitations/${id}`);
}

export async function respondInvitationAction(formData: FormData): Promise<void> {
  await requireAdultViewer("/studio/invitations");
  const id = text(formData, "invitation_public_id");
  const state = text(formData, "state");
  if (!invitationIdPattern.test(id)) redirect("/studio/invitations");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("respond_project_invitation", { requested_invitation_public_id: id, requested_state: state });
  if (error) redirect(`/studio/invitations/${id}?error=response`);
  revalidatePath(`/studio/invitations/${id}`);
  revalidatePath("/studio/invitations");
  redirect(`/studio/invitations/${id}?notice=${encodeURIComponent(state)}`);
}

export async function proposeInvitationChangeAction(formData: FormData): Promise<void> {
  await requireAdultViewer("/studio/invitations");
  const id = text(formData, "invitation_public_id");
  if (!invitationIdPattern.test(id)) redirect("/studio/invitations");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("propose_invitation_change", {
    requested_invitation_public_id: id,
    proposal: { note: text(formData, "note") },
  });
  if (error) redirect(`/studio/invitations/${id}?error=proposal`);
  revalidatePath(`/studio/invitations/${id}`);
  revalidatePath("/studio/invitations");
  redirect(`/studio/invitations/${id}?notice=proposal`);
}

export async function withdrawInvitationAction(formData: FormData): Promise<void> {
  await requireAdultViewer("/studio/invitations");
  const id = text(formData, "invitation_public_id");
  if (!invitationIdPattern.test(id)) redirect("/studio/invitations");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("withdraw_project_invitation", { requested_invitation_public_id: id });
  if (error) redirect(`/studio/invitations/${id}?error=withdraw`);
  revalidatePath(`/studio/invitations/${id}`);
  revalidatePath("/studio/invitations");
  redirect(`/studio/invitations/${id}?notice=withdrawn`);
}