export type WorkspaceMutationState = {
  status: "idle" | "success" | "error";
  message: string;
  destination?: string;
};

export const INITIAL_WORKSPACE_MUTATION_STATE: WorkspaceMutationState = {
  status: "idle",
  message: "",
};
