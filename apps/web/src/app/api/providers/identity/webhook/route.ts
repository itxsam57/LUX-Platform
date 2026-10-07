import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { providerWebhookSignature } from "@/lib/providers/bridge";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getVerificationProviderBridgeConfig } from "@/lib/supabase/env";
import { getConfiguredBridgeVerificationAdapter } from "@/lib/verification/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const adapter = getConfiguredBridgeVerificationAdapter();
  if (!adapter) return NextResponse.json({ error: "verification_provider_unavailable" }, { status: 503 });

  const config = getVerificationProviderBridgeConfig();
  const rawBody = await request.text();
  const signature = providerWebhookSignature(request.headers, config.webhookSignatureHeader);

  let callback;
  try {
    callback = await adapter.verifyAndNormalizeCallback({ rawBody, signature });
  } catch {
    return NextResponse.json({ error: "invalid_verification_webhook" }, { status: 401 });
  }

  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const result = callback.result;
  const service = createServiceSupabaseClient();
  const { error } = await service.rpc("apply_verification_provider_event", {
    requested_provider_key: result.providerKey,
    requested_event_id: callback.eventId,
    requested_provider_reference: callback.sessionReference,
    requested_status: result.status,
    requested_liveness_passed: result.livenessPassed,
    requested_risk_screen_passed: result.riskScreenPassed,
    requested_result_expires_at: result.expiresAt,
    requested_occurred_at: callback.occurredAt,
    requested_payload_hash: payloadHash,
  });

  if (error) return NextResponse.json({ error: "verification_provider_event_rejected" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
