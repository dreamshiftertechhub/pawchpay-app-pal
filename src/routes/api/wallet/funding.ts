import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, corsPreflightResponse, errorResponse, HttpError, json, requireUser } from "@/lib/wallet-auth.server";
import { assertPaymentsEnabled, initializePayment } from "@/lib/paystack.server";

const Body = z.object({
  amount: z.number().int().min(100).max(1_000_000),
});

export const Route = createFileRoute("/api/wallet/funding")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflightResponse(request),
      POST: async ({ request }) => {
        try {
          assertPaymentsEnabled();
          const userId = await requireUser(request);
          const parsed = Body.safeParse(await request.json().catch(() => null));
          if (!parsed.success) throw new HttpError(400, "Enter an amount between ₦100 and ₦1,000,000.");
          const db = await admin();
          const { data: authData, error: authError } = await db.auth.admin.getUserById(userId);
          if (authError || !authData.user?.email) throw new HttpError(400, "A verified email address is required to fund your wallet.");
          const reference = `ppfund-${crypto.randomUUID()}`;
          const { error: insertError } = await db.from("payment_intents").insert({
            user_id: userId,
            reference,
            amount: parsed.data.amount,
            currency: "NGN",
            status: "pending",
            provider: "paystack",
          });
          if (insertError) throw new HttpError(503, "Could not create a payment request. Please try again.");
          try {
            const payment = await initializePayment({
              email: authData.user.email,
              amountNaira: parsed.data.amount,
              reference,
              callbackUrl: new URL("/?funding_reference=" + encodeURIComponent(reference), request.url).toString(),
            });
            const { error: updateError } = await db.from("payment_intents")
              .update({ provider_data: { authorization_url: payment.authorization_url, access_code: payment.access_code } })
              .eq("reference", reference)
              .eq("user_id", userId);
            if (updateError) console.error("[funding] could not store provider response", reference, updateError.message);
            return json({ authorizationUrl: payment.authorization_url, reference }, 200, request);
          } catch (error) {
            console.error("[funding] initialization failed", reference, error);
            await db.from("payment_intents").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
            throw error;
          }
        } catch (e) {
          return errorResponse(e, request);
        }
      },
    },
  },
});
