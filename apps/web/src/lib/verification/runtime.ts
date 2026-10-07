import { getVerificationProviderBridgeConfig, getVerificationProviderRuntime } from "../supabase/env";
import type { VerificationAdapter } from "./adapter";
import { createBridgeVerificationAdapter } from "./bridge-adapter";
import { createSyntheticVerificationAdapter } from "./synthetic-adapter";

export function getConfiguredVerificationAdapter(): VerificationAdapter {
  const runtime = getVerificationProviderRuntime();
  if (runtime.mode === "synthetic") return createSyntheticVerificationAdapter();
  if (runtime.mode === "provider") return createBridgeVerificationAdapter(getVerificationProviderBridgeConfig());
  throw new Error("Verification provider is unavailable.");
}

export function getConfiguredBridgeVerificationAdapter() {
  const runtime = getVerificationProviderRuntime();
  if (runtime.mode !== "provider") return null;
  return createBridgeVerificationAdapter(getVerificationProviderBridgeConfig());
}
