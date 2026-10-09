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
    event = await gateway.verifyWebhook({ rawBody, signature });
  } catch {
    return NextResponse.json({ error: "invalid_payout_webhook" }, { status: 401 });
  }

  const service = createServiceSupabaseClient();
  const { error } = await service.rpc("apply_verified_payout_provider_event", {
    requested_payout_public_id: event.payoutPublicId,
    requested_provider_key: event.providerKey,
    requested_event_id: event.eventId,
    requested_provider_payout_ref: event.providerPayoutRef,
    requested_state: event.state,
    requested_reported_amount_minor: event.reportedAmountMinor,
    requested_occurred_at: event.occurredAt,
  });

  if (error) return NextResponse.json({ error: "payout_provider_event_rejected" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
