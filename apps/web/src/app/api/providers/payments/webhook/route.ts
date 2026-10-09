import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getConfiguredPaymentGateway } from "@/lib/payments/runtime";
import { getPaymentProviderBridgeConfig } from "@/lib/supabase/env";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { providerWebhookSignature } from "@/lib/providers/bridge";

export const runtime = "nodejs";

function idempotency(prefix: string, value: string) {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 48);
  return `${prefix}:${digest}`;
}

export async function POST(request: Request) {
  const gateway = getConfiguredPaymentGateway();
  if (!gateway) {
    return NextResponse.json({ error: "payment_provider_unavailable" }, { status: 503 });
  }

  const config = getPaymentProviderBridgeConfig();
  const rawBody = await request.text();
  const signature = providerWebhookSignature(request.headers, config.webhookSignatureHeader);
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");

  let event;
  try {
    event = await gateway.verifyWebhook({ rawBody, signature });
  } catch {
    return NextResponse.json({ error: "invalid_payment_webhook" }, { status: 401 });
  }

  const service = createServiceSupabaseClient();
  const { data: existingTransaction, error: lookupError } = await service
    .from("payment_transactions")
    .select("id,funding_commitment_id")
    .eq("provider_key", event.providerKey)
    .eq("provider_transaction_ref", event.transactionRef)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: "payment_transaction_lookup_failed" }, { status: 503 });
  }

  if (existingTransaction) {
    const { data: commitment, error: commitmentError } = await service
      .from("funding_commitments")
      .select("public_id")
      .eq("id", existingTransaction.funding_commitment_id)
      .maybeSingle();
    if (commitmentError || commitment?.public_id !== event.commitmentPublicId) {
      return NextResponse.json({ error: "payment_commitment_mismatch" }, { status: 409 });
    }
  } else {
    const { error: checkoutError } = await service.rpc("assert_initial_payment_provider_event", {
      requested_commitment_public_id: event.commitmentPublicId,
      requested_provider_key: event.providerKey,
      requested_state: event.state,
      requested_authorized_minor: event.authorizedMinor,
      requested_captured_minor: event.capturedMinor,
      requested_occurred_at: event.occurredAt,
    });
    if (checkoutError) {
      return NextResponse.json({ error: "payment_checkout_event_rejected" }, { status: 409 });
    }

    const transitionKey = idempotency("provider-event", event.eventId);
    const { error: transitionError } = await service.rpc("record_payment_transition", {
      requested_commitment_public_id: event.commitmentPublicId,
      requested_provider_key: event.providerKey,
      requested_customer_ref: event.customerRef,
      requested_payment_method_ref: event.paymentMethodRef,
      requested_transaction_ref: event.transactionRef,
      requested_state: event.state,
      requested_authorized_minor: event.authorizedMinor,
      requested_captured_minor: event.capturedMinor,
      requested_refunded_minor: event.refundedMinor,
      requested_idempotency_key: transitionKey,
    });

    if (transitionError) {
      return NextResponse.json({ error: "payment_transition_rejected" }, { status: 409 });
    }
  }

  const { data: webhookData, error: webhookError } = await service.rpc("apply_payment_webhook", {
    requested_provider_key: event.providerKey,
    requested_event_id: event.eventId,
    requested_transaction_ref: event.transactionRef,
    requested_state: event.state,
    requested_authorized_minor: event.authorizedMinor,
    requested_captured_minor: event.capturedMinor,
    requested_refunded_minor: event.refundedMinor,
    requested_occurred_at: event.occurredAt,
    requested_payload_hash: payloadHash,
  });

  if (webhookError) {
    return NextResponse.json({ error: "payment_webhook_rejected" }, { status: 409 });
  }

  const webhookResult = webhookData && typeof webhookData === "object" && !Array.isArray(webhookData)
    ? webhookData as Record<string, unknown>
    : null;
  const ignored = webhookResult?.ignored === true;

  if (!ignored && ["captured", "partially_refunded", "refunded"].includes(event.state)) {
    const { error: ledgerError } = await service.rpc("sync_payment_ledger", {
      requested_provider_key: event.providerKey,
      requested_provider_transaction_ref: event.transactionRef,
      requested_processing_fee_minor: event.processingFeeMinor,
      requested_idempotency_key: idempotency("ledger-sync", event.eventId),
    });
    if (ledgerError) {
      return NextResponse.json({ error: "payment_ledger_sync_rejected" }, { status: 409 });
    }
  }

  return NextResponse.json({ ok: true });
}
