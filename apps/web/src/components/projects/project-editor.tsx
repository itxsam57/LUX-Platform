"use client";

import { useActionState, useEffect } from "react";
import {
  INITIAL_PROJECT_MUTATION_STATE,
  type ProjectMutationState,
} from "@/app/studio/project-mutation-state";

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
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PROJECT_MUTATION_STATE,
  );

  useEffect(() => {
    if (!state.destination) return;
    window.location.replace(state.destination);
  }, [state.destination]);

  return (
    <form action={formAction} className="studio-form" aria-busy={pending}>
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
      <button className="studio-button studio-button--primary" type="submit" disabled={pending}>{submitLabel}</button>
      {state.status === "error" ? <p className="studio-error" role="alert">{state.message}</p> : null}
    </form>
  );
}
