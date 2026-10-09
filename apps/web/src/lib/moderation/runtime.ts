import { getModerationProviderBridgeConfig } from "../supabase/env";
import { createBridgeModerationAdapter, createLocalModerationAdapter } from "./adapter";

export function getConfiguredModerationAdapter() {
  const config = getModerationProviderBridgeConfig();
  return config ? createBridgeModerationAdapter(config) : createLocalModerationAdapter();
}
