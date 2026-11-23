import { createFileRoute } from "@tanstack/react-router";
import { paymentsEnabled, verifySignature, verifyPayment } from "@/lib/paystack.server";

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!paymentsEnabled()) return new Response("PawchPay payments are temporarily disabled", { status: 503 });
        const raw = await request.text();
        if (!(await verifySignature(raw, request.headers.get("x-paystack-signature")))) {
          return new Response("Invalid signature", { status: 401 });
        }
        let payload: { event?: string; data?: { id?: number | string; reference?: string; transfer_code?: string; status?: string; amount?: number; currency?: string } };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        const event = String(payload.event || "");
        const reference = payload.data?.reference ? String(payload.data.reference) : null;
        const handledEvent = event === "charge.success" || event === "transfer.success" ||
          event === "transfer.failed" || event === "transfer.reversed";
        if (handledEvent && !reference) return new Response("Missing transaction reference", { status: 400 });
        const eventKey = `${event}:${payload.data?.id ?? reference ?? ""}`;

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        // The event row is a deduplication record, not proof that settlement
        // completed. Always retry the idempotent ledger RPCs for duplicate
        // deliveries; otherwise a failed delete could permanently suppress
        // a later Paystack retry.
        const { error: insErr } = await db
          .from("paystack_events")
          .insert({ event_key: eventKey, event_type: event, reference, payload: payload as never });
        if (insErr && insErr.code !== "23505") {
          console.error("[webhook] store failed", insErr.message);
          return new Response("retry", { status: 500 });
        }

        if (reference) {
          let settlementError: { message: string } | null = null;
          if (event === "transfer.success") {
            const { error } = await db.rpc("complete_transfer_by_reference", {
              p_reference: reference,
              ...(payload.data?.transfer_code ? { p_provider_transfer_code: payload.data.transfer_code } : {}),
            });
            settlementError = error;
          } else if (event === "transfer.failed" || event === "transfer.reversed") {
            const { error } = await db.rpc("reverse_transfer_by_reference", {
              p_reference: reference,
              p_reason: event === "transfer.failed" ? "Transfer failed" : "Transfer reversed",
            });
            settlementError = error;
          } else if (event === "charge.success") {
            // Verify against Paystack's API as well as the signed webhook.
            const verified = await verifyPayment(reference);
            if (!verified || verified.status !== "success" || verified.currency !== "NGN" ||
                payload.data?.currency !== "NGN" || verified.reference !== reference ||
                !Number.isSafeInteger(payload.data?.amount) || !payload.data.amount ||
                verified.amount !== payload.data.amount) {
              console.error("[webhook] funding verification mismatch", reference);
              const { error: deleteError } = await db.from("paystack_events").delete().eq("event_key", eventKey);
              if (deleteError) console.error("[webhook] could not release unverified funding event", eventKey, deleteError.message);
              return new Response("verification failed", { status: 500 });
            }
            const { data: credited, error } = await db.rpc("confirm_funding_by_reference", {
              p_reference: reference,
              p_amount: verified.amount / 100,
            });
            settlementError = error || (!credited ? { message: "Funding reference or amount did not match a pending payment intent." } : null);
          }

          if (settlementError) {
            // Do not leave a failed settlement marked as processed: Paystack
            // must be able to retry this webhook after the ledger issue is fixed.
            console.error("[webhook] payment settlement failed", reference, settlementError.message);
            const { error: deleteError } = await db.from("paystack_events").delete().eq("event_key", eventKey);
            if (deleteError) console.error("[webhook] could not release event for retry", eventKey, deleteError.message);
            return new Response("retry", { status: 500 });
          }
        }
        return new Response("ok");
      },
    },
  },
});
