import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getConfiguredAgeAssuranceAdapter } from "@/lib/age-assurance/runtime";
import { providerWebhookSignature } from "@/lib/providers/bridge";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getAgeAssuranceProviderBridgeConfig } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const adapter = getConfiguredAgeAssuranceAdapter();
  if (!adapter) return NextResponse.json({ error: "age_provider_unavailable" }, { status: 503 });

  const config = getAgeAssuranceProviderBridgeConfig();
  const rawBody = await request.text();
  const signature = providerWebhookSignature(request.headers, config.webhookSignatureHeader);

  let event;
  try {
    event = await adapter.verifyWebhook({ rawBody, signature });
  } catch {
    return NextResponse.json({ error: "invalid_age_webhook" }, { status: 401 });
  }

  const service = createServiceSupabaseClient();
  const { error } = await service.rpc("apply_age_assurance_provider_event", {
    requested_provider_key: event.providerKey,
    requested_event_id: event.eventId,
    requested_provider_reference: event.providerReference,
    requested_subject_user_id: event.subjectId,
    requested_jurisdiction_code: event.jurisdictionCode,
    requested_status: event.status,
    requested_result_expires_at: event.expiresAt,
    requested_occurred_at: event.occurredAt,
    requested_payload_hash: createHash("sha256").update(rawBody).digest("hex"),
  });

  if (error) return NextResponse.json({ error: "age_provider_event_rejected" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
