"use client";

import { NavigationActionForm } from "@/components/forms/navigation-action-form";
import {
  INITIAL_PROJECT_MUTATION_STATE,
  type ProjectMutationState,
} from "@/app/studio/project-mutation-state";
import type { NavigationActionResult } from "@/lib/actions/navigation";

type ProjectDefaults = {
  title?: string;
  publicSynopsis?: string;
  privateBrief?: string;
  category?: string;
  format?: string;
  boundaries?: string[];
  compensationModel?: string;
  distributionScope?: string;
  rightsDeclarations?: string[];
  scriptVersion?: string;
  budget?: { minor: number; currency: string } | null;
  productionSchedule?: string;
  readinessItems?: string[];
};

type ProjectMutationAction = (
  state: ProjectMutationState,
  formData: FormData,
) => Promise<ProjectMutationState>;

export function ProjectEditor({
  action,
  defaults = {},
  submitLabel,
  projectPublicId,
  revision,
  sourceDemandPublicId,
}: {
  action: ProjectMutationAction;
  defaults?: ProjectDefaults;
  submitLabel: string;
  projectPublicId?: string;
  revision?: number;
  sourceDemandPublicId?: string;
}) {
  async function navigationAction(formData: FormData): Promise<NavigationActionResult> {
    const result = await action(INITIAL_PROJECT_MUTATION_STATE, formData);
    return {
      status: result.status === "success" ? "success" : "error",
      message: result.message,
      destination: result.destination ?? "/studio/projects?error=action",
    };
  }

  return (
    <NavigationActionForm action={navigationAction} className="studio-form">
      {projectPublicId ? <input type="hidden" name="project_public_id" value={projectPublicId} /> : null}
      {revision ? <input type="hidden" name="expected_revision" value={revision} /> : null}
      {sourceDemandPublicId ? <input type="hidden" name="source_demand_public_id" value={sourceDemandPublicId} /> : null}
      <label>Project title<input name="title" defaultValue={defaults.title ?? ""} required minLength={4} maxLength={120} /></label>
      <label>Public synopsis<textarea name="public_synopsis" defaultValue={defaults.publicSynopsis ?? ""} required minLength={20} maxLength={600} rows={4} /></label>
      <label>Private production brief<textarea name="private_brief" defaultValue={defaults.privateBrief ?? ""} required minLength={20} maxLength={4000} rows={7} /></label>
      <div className="studio-form__grid">
        <label>Category<input name="category" defaultValue={defaults.category ?? "concept"} required /></label>
        <label>Format<input name="format" defaultValue={defaults.format ?? "video"} required /></label>
      </div>
      <label>Boundaries<input name="boundaries" defaultValue={(defaults.boundaries ?? []).join(", ")} placeholder="closed-set, no-surprises" /></label>
      <label>Compensation model<select name="compensation_model" defaultValue={defaults.compensationModel ?? "fixed"}><option value="fixed">Fixed</option><option value="revenue_share">Revenue share</option><option value="hybrid">Hybrid</option><option value="unpaid">Unpaid / voluntary</option></select></label>
      <label>Distribution scope<input name="distribution_scope" defaultValue={defaults.distributionScope ?? "Platform release only"} required /></label>
      <label>Rights declarations<input name="rights_declarations" defaultValue={(defaults.rightsDeclarations ?? []).join(", ")} placeholder="original-concept" /></label>
      <label>Script / outline version<input name="script_version" defaultValue={defaults.scriptVersion ?? "draft-1"} minLength={1} maxLength={120} required /></label>
      <div className="studio-form__grid">
        <label>Production budget (minor units)<input name="budget_minor" type="number" min={0} step={1} defaultValue={defaults.budget?.minor ?? ""} /></label>
        <label>Budget currency<input name="budget_currency" minLength={3} maxLength={3} defaultValue={defaults.budget?.currency ?? ""} placeholder="USD" /></label>
      </div>
      <label>Production schedule<textarea name="production_schedule" defaultValue={defaults.productionSchedule ?? "To be scheduled"} minLength={3} maxLength={1000} rows={4} required /></label>
      <label>Readiness checklist<input name="readiness_items" defaultValue={(defaults.readinessItems ?? []).join(", ")} placeholder="location confirmed, cast available, rights cleared" /></label>
      <button className="studio-button studio-button--primary" type="submit">{submitLabel}</button>
    </NavigationActionForm>
  );
}
