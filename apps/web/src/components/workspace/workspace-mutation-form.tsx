"use client";

import { useActionState, useEffect } from "react";
import type {
  WorkspaceMutationState,
} from "@/app/workspace/actions";
import {
  INITIAL_WORKSPACE_MUTATION_STATE,
} from "@/app/workspace/actions";
import { Button } from "@/components/ui/primitives";

type WorkspaceMutationAction = (
  state: WorkspaceMutationState,
  formData: FormData,
) => Promise<WorkspaceMutationState>;

type HiddenField = {
  name: string;
  value: string;
};

export function WorkspaceMutationForm({
  action,
  fields,
  label,
  variant = "primary",
  size = "medium",
}: {
  action: WorkspaceMutationAction;
  fields: HiddenField[];
  label: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "small" | "medium" | "large";
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_WORKSPACE_MUTATION_STATE,
  );

  useEffect(() => {
    if (state.status !== "success" || !state.destination) return;
    window.location.replace(state.destination);
  }, [state]);

  return (
    <form action={formAction}>
      {fields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      <Button type="submit" variant={variant} size={size} loading={pending}>
        {label}
      </Button>
      {state.status === "error" ? (
        <div className="auth-message auth-message--error" role="alert" aria-live="polite">
          {state.message}
        </div>
      ) : null}
    </form>
  );
}
