export type ProjectMutationState = {
  status: "idle" | "success" | "error";
  message: string;
  destination?: string;
};

export const INITIAL_PROJECT_MUTATION_STATE: ProjectMutationState = {
  status: "idle",
  message: "",
};
