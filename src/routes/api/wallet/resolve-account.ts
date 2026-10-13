import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { errorResponse, HttpError, json, requireUser } from "@/lib/wallet-auth.server";
import { listBanks, resolveAccount } from "@/lib/paystack.server";

const Body = z.object({ accountNumber: z.string().regex(/^\d{10}$/), bankCode: z.string().regex(/^[0-9A-Za-z]{2,10}$/) });

export const Route = createFileRoute("/api/wallet/resolve-account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireUser(request);
          return json({ banks: await listBanks() });
        } catch (e) {
          return errorResponse(e);
        }
      },
      POST: async ({ request }) => {
        try {
          await requireUser(request);
          const parsed = Body.safeParse(await request.json().catch(() => null));
          if (!parsed.success) throw new HttpError(400, "Enter a 10-digit account number and choose a bank.");
          const name = await resolveAccount(parsed.data.accountNumber, parsed.data.bankCode);
          return json({ accountName: name });
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
