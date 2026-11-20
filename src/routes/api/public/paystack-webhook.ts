import { createFileRoute } from "@tanstack/react-router";
import { verifySignature } from "@/lib/paystack.server";

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (!(await verifySignature(raw, request.headers.get("x-paystack-signature")))) {
          return new Response("Invalid signature", { status: 401 });
        }
        let payload: { event?: string; data?: { id?: number | string; reference?: string; transfer_code?: string } };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        const event = String(payload.event || "");
        const reference = payload.data?.reference ? String(payload.data.reference) : null;
        const eventKey = `${event}:${payload.data?.id ?? reference ?? ""}`;

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: seen } = await db.from("paystack_events").select("id").eq("event_key", eventKey).maybeSingle();
        if (seen) return new Response("ok");
        const { error: insErr } = await db
          .from("paystack_events")
          .insert({ event_key: eventKey, event_type: event, reference, payload: payload as never });
        if (insErr) {
          if (insErr.code === "23505") return new Response("ok");
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
          }

          if (settlementError) {
            // Do not leave a failed settlement marked as processed: Paystack
            // must be able to retry this webhook after the ledger issue is fixed.
            console.error("[webhook] transfer settlement failed", reference, settlementError.message);
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
