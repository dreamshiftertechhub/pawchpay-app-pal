import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, corsPreflightResponse, errorResponse, HttpError, json, requireUser } from "@/lib/wallet-auth.server";
import { createRecipient, initiateTransfer, PaystackRejected, resolveAccount, verifyTransfer } from "@/lib/paystack.server";

const MIN = 100;
const MAX = 1_000_000;

const Body = z.object({
  reference: z.string().regex(/^[a-z0-9-]{16,50}$/),
  amount: z.number().int().min(MIN).max(MAX),
  accountNumber: z.string().regex(/^\d{10}$/),
  bankCode: z.string().regex(/^[0-9A-Za-z]{2,10}$/),
  bankName: z.string().min(2).max(80),
  pin: z.string().regex(/^\d{4}$/),
  note: z.string().max(100).optional().nullable(),
});

type Db = Awaited<ReturnType<typeof admin>>;

async function reconcile(db: Db, reference: string) {
  const v = await verifyTransfer(reference);
  if (!v) return;
  if (v.status === "success") {
    const { error } = await db.rpc("complete_transfer_by_reference", {
      p_reference: reference,
      p_provider_transfer_code: v.transfer_code,
    });
    if (error) throw error;
  } else if (v.status === "failed" || v.status === "reversed") {
    const { error } = await db.rpc("reverse_transfer_by_reference", {
      p_reference: reference,
      p_reason: `Transfer ${v.status}`,
    });
    if (error) throw error;
  }
}

async function currentStatus(db: Db, userId: string, reference: string) {
  const { data, error } = await db
    .from("transfer_requests")
    .select("status, amount, recipient_name")
    .eq("reference", reference)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const Route = createFileRoute("/api/wallet/transfer")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflightResponse(request),
      // Status check: reconciles a pending transfer with Paystack.
      GET: async ({ request }) => {
        try {
          const userId = await requireUser(request);
          const reference = new URL(request.url).searchParams.get("reference") || "";
          if (!/^[a-z0-9-]{16,50}$/.test(reference)) throw new HttpError(400, "Invalid reference.");
          const db = await admin();
          const row = await currentStatus(db, userId, reference);
          if (!row) throw new HttpError(404, "Transfer not found.");
          if (row.status === "pending") await reconcile(db, reference);
          return json(await currentStatus(db, userId, reference), 200, request);
        } catch (e) {
          return errorResponse(e, request);
        }
      },
      POST: async ({ request }) => {
        try {
          const userId = await requireUser(request);
          const parsed = Body.safeParse(await request.json().catch(() => null));
          if (!parsed.success)
            throw new HttpError(400, `Check the transfer details. Amount must be between ₦${MIN} and ₦${MAX.toLocaleString()}.`);
          const t = parsed.data;
          const db = await admin();

          // Idempotency: a repeated reference returns the original outcome, never a second send.
          const { data: existing, error: existingError } = await db
            .from("transfer_requests")
            .select("user_id, status")
            .eq("reference", t.reference)
            .maybeSingle();
          if (existingError) throw new HttpError(503, "Could not verify this transfer reference. Please try again.");
          if (existing) {
            if (existing.user_id !== userId) throw new HttpError(409, "Duplicate reference.");
            return json({ status: existing.status, reference: t.reference, duplicate: true }, 200, request);
          }

          const { data: pinOk, error: pinErr } = await db.rpc("verify_transaction_pin_for_user", { p_user_id: userId, p_pin: t.pin });
          if (pinErr) throw new HttpError(pinErr.message.includes("not been set") ? 428 : 423, pinErr.message);
          if (!pinOk) throw new HttpError(401, "Incorrect PIN. Your account locks after 5 wrong attempts.");

          // Never trust the client-supplied name: re-verify with the bank.
          const accountName = await resolveAccount(t.accountNumber, t.bankCode);

          // Prepare the provider recipient before reserving wallet funds. If
          // Paystack cannot create the recipient, the user's wallet is untouched.
          let recipient: string;
          try {
            recipient = await createRecipient(accountName, t.accountNumber, t.bankCode);
          } catch (e) {
            if (e instanceof PaystackRejected) throw new HttpError(502, "The bank recipient could not be prepared. No money was deducted.");
            throw e;
          }

          const { error: resErr } = await db.rpc("reserve_transfer_for_user", {
            p_user_id: userId,
            p_reference: t.reference,
            p_amount: t.amount,
            p_recipient_name: accountName,
            p_account_number: t.accountNumber,
            p_bank_code: t.bankCode,
            p_bank_name: t.bankName,
            ...(t.note ? { p_note: t.note } : {}),
          });
          if (resErr) throw new HttpError(resErr.message.includes("Insufficient") ? 402 : 400, resErr.message);

          try {
            const { data: ben } = await db
              .from("beneficiaries")
              .select("id")
              .eq("user_id", userId)
              .eq("account_number", t.accountNumber)
              .eq("bank_code", t.bankCode)
              .maybeSingle();
            if (ben) await db.from("beneficiaries").update({ recipient_code: recipient, name: accountName }).eq("id", ben.id);
            else
              await db.from("beneficiaries").insert({
                user_id: userId,
                name: accountName,
                account_number: t.accountNumber,
                bank_code: t.bankCode,
                bank_name: t.bankName,
                recipient_code: recipient,
              });

            const tr = await initiateTransfer({ amountNaira: t.amount, recipient, reference: t.reference, reason: t.note || "PawchPay transfer" });
            if (tr.status === "success") {
              const { error: settleError } = await db.rpc("complete_transfer_by_reference", {
                p_reference: t.reference,
                p_provider_transfer_code: tr.transfer_code,
              });
              if (settleError) {
                // Paystack accepted the transfer, but the ledger did not confirm
                // settlement. Keep it pending so webhook/status reconciliation can retry.
                console.error("[transfer settlement pending]", t.reference, settleError.message);
                return json({ status: "pending", reference: t.reference, recipientName: accountName }, 200, request);
              }
              return json({ status: "success", reference: t.reference, recipientName: accountName }, 200, request);
            }
            if (tr.status === "otp") {
              const { error: reverseError } = await db.rpc("reverse_transfer_by_reference", {
                p_reference: t.reference,
                p_reason: "Provider requires OTP",
              });
              if (reverseError) {
                console.error("[transfer reversal pending]", t.reference, reverseError.message);
                return json({ status: "pending", reference: t.reference, recipientName: accountName }, 200, request);
              }
              throw new HttpError(503, "Transfers are temporarily unavailable. Your money has been returned to your wallet.");
            }
            await db.from("transfer_requests").update({ provider_transfer_code: tr.transfer_code }).eq("reference", t.reference);
            return json({ status: "pending", reference: t.reference, recipientName: accountName }, 200, request);
          } catch (e) {
            if (e instanceof PaystackRejected) {
              console.error("[transfer rejected]", t.reference, e.message);
              const { error: reverseError } = await db.rpc("reverse_transfer_by_reference", {
                p_reference: t.reference,
                p_reason: "Rejected by provider",
              });
              if (reverseError) {
                console.error("[transfer reversal pending]", t.reference, reverseError.message);
                return json({ status: "pending", reference: t.reference, recipientName: accountName }, 200, request);
              }
              throw new HttpError(502, "The bank transfer could not be started. Your money has been returned to your wallet.");
            }
            if (e instanceof HttpError) throw e;
            // Unknown outcome (network): keep pending; webhook or status check will settle it.
            console.error("[transfer unknown]", t.reference, e);
            return json({ status: "pending", reference: t.reference, recipientName: accountName }, 200, request);
          }
        } catch (e) {
          return errorResponse(e, request);
        }
      },
    },
  },
});
