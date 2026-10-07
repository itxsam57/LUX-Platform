import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getConfiguredPayoutGateway } from "@/lib/payouts/runtime";
import { providerWebhookSignature } from "@/lib/providers/bridge";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getPayoutProviderBridgeConfig } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gateway = getConfiguredPayoutGateway();
  if (!gateway) return NextResponse.json({ error: "payout_provider_unavailable" }, { status: 503 });

  const config = getPayoutProviderBridgeConfig();
  const rawBody = await request.text();
  const signature = providerWebhookSignature(request.headers, config.webhookSignatureHeader);

  let event;
  try {
    event = await gateway.verifyRecipientWebhook({ rawBody, signature });
  } catch {
    return NextResponse.json({ error: "invalid_payout_recipient_webhook" }, { status: 401 });
  }

  const service = createServiceSupabaseClient();
  const { error } = await service.rpc("apply_payout_recipient_provider_event", {
    requested_provider_key: event.providerKey,
    requested_event_id: event.eventId,
    requested_subject_user_id: event.subjectId,
    requested_recipient_reference: event.recipientReference,
    requested_state: event.state,
    requested_ownership_verified: event.ownershipVerified,
    requested_occurred_at: event.occurredAt,
    requested_payload_hash: createHash("sha256").update(rawBody).digest("hex"),
  });

  if (error) return NextResponse.json({ error: "payout_recipient_event_rejected" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
