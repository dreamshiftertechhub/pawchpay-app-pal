import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, errorResponse, HttpError, json, requireUser } from "@/lib/wallet-auth.server";

const Body = z.object({
  pin: z.string().regex(/^\d{4}$/),
  currentPin: z.string().regex(/^\d{4}$/).optional(),
});

async function hasPin(userId: string) {
  const db = await admin();
  const { data } = await db.from("transaction_security").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

export const Route = createFileRoute("/api/wallet/pin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const userId = await requireUser(request);
          return json({ hasPin: await hasPin(userId) });
        } catch (e) {
          return errorResponse(e);
        }
      },
      POST: async ({ request }) => {
        try {
          const userId = await requireUser(request);
          const parsed = Body.safeParse(await request.json().catch(() => null));
          if (!parsed.success) throw new HttpError(400, "PIN must be exactly 4 digits.");
          const db = await admin();
          if (await hasPin(userId)) {
            if (!parsed.data.currentPin) throw new HttpError(400, "Enter your current PIN.");
            const { data: ok, error } = await db.rpc("verify_transaction_pin_for_user", {
              p_user_id: userId,
              p_pin: parsed.data.currentPin,
            });
            if (error) throw new HttpError(423, error.message);
            if (!ok) throw new HttpError(401, "Current PIN is incorrect.");
          }
          const { error } = await db.rpc("set_transaction_pin_for_user", { p_user_id: userId, p_pin: parsed.data.pin });
          if (error) throw new HttpError(400, error.message);
          return json({ ok: true });
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
