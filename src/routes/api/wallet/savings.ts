import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, corsPreflightResponse, errorResponse, HttpError, json, requireUser } from "@/lib/wallet-auth.server";

const CATEGORIES = ["education", "business", "travel", "rent", "gadget", "emergency", "custom"] as const;
const Create = z.object({
  action: z.literal("create"),
  name: z.string().trim().min(2).max(40),
  targetAmount: z.number().int().min(1000).max(100_000_000),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  category: z.enum(CATEGORIES).optional(),
});
const SetCategory = z.object({
  action: z.literal("setCategory"),
  goalId: z.string().uuid(),
  category: z.enum(CATEGORIES),
});
const Fund = z.object({
  action: z.literal("fund"),
  goalId: z.string().uuid(),
  amount: z.number().int().min(100).max(10_000_000),
  pin: z.string().regex(/^\d{4}$/),
});
const Withdraw = z.object({
  action: z.literal("withdraw"),
  goalId: z.string().uuid(),
  amount: z.number().int().min(100).max(10_000_000),
  pin: z.string().regex(/^\d{4}$/),
  reference: z.string().uuid(),
});

export const Route = createFileRoute("/api/wallet/savings")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflightResponse(request),
      GET: async ({ request }) => {
        try {
          const userId = await requireUser(request);
          const db = await admin();
          const { data, error } = await db
            .from("savings_goals")
            .select("id,name,target_amount,saved_amount,target_date,status,created_at,category")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
          if (error) throw error;
          return json({ goals: data }, 200, request);
        } catch (e) {
          return errorResponse(e, request);
        }
      },
      POST: async ({ request }) => {
        try {
          const userId = await requireUser(request);
          const raw = await request.json().catch(() => null);
          const db = await admin();
          if (raw?.action === "create") {
            const p = Create.safeParse(raw);
            if (!p.success) throw new HttpError(400, "Enter a goal name and a target of at least ₦1,000.");
            if (p.data.targetDate && new Date(p.data.targetDate) <= new Date())
              throw new HttpError(400, "Choose a target date in the future.");
            const { count } = await db
              .from("savings_goals")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId);
            if ((count ?? 0) >= 20) throw new HttpError(400, "You can have up to 20 savings goals.");
            const { data, error } = await db
              .from("savings_goals")
              .insert({
                user_id: userId,
                name: p.data.name,
                target_amount: p.data.targetAmount,
                target_date: p.data.targetDate || null,
                category: p.data.category || "custom",
              })
              .select("id")
              .single();
            if (error) throw error;
            return json({ id: data.id }, 200, request);
          }
          if (raw?.action === "setCategory") {
            const p = SetCategory.safeParse(raw);
            if (!p.success) throw new HttpError(400, "Unknown category.");
            // Only fills in goals still on the default, so one device never
            // overwrites a category another device already chose.
            const { error } = await db
              .from("savings_goals")
              .update({ category: p.data.category })
              .eq("id", p.data.goalId)
              .eq("user_id", userId)
              .eq("category", "custom");
            if (error) throw error;
            return json({ ok: true }, 200, request);
          }
          const isWithdraw = raw?.action === "withdraw";
          const p = (isWithdraw ? Withdraw : Fund).safeParse(raw);
          if (!p.success) throw new HttpError(400, "Check the amount, goal, PIN and withdrawal reference.");
          const { data: pinOk, error: pinErr } = await db.rpc("verify_transaction_pin_for_user", {
            p_user_id: userId,
            p_pin: p.data.pin,
          });
          if (pinErr) throw new HttpError(pinErr.message.includes("not been set") ? 428 : 423, pinErr.message);
          if (!pinOk) throw new HttpError(401, "Incorrect PIN.");
          if (isWithdraw) {
            const withdrawal = p.data as z.infer<typeof Withdraw>;
            const { error } = await db.rpc("withdraw_savings_goal_for_user", {
              p_user_id: userId,
              p_goal_id: withdrawal.goalId,
              p_amount: withdrawal.amount,
              p_reference: withdrawal.reference,
            });
            if (error) {
              if (/exceeds savings balance/i.test(error.message)) throw new HttpError(400, "Withdrawal exceeds the amount saved in this goal.");
              if (/not found|closed/i.test(error.message)) throw new HttpError(404, "Savings goal not found or closed.");
              if (/reference already used/i.test(error.message)) throw new HttpError(409, "This withdrawal reference has already been used.");
              throw error;
            }
            return json({ ok: true, status: "success" }, 200, request);
          }
          const funding = p.data as z.infer<typeof Fund>;
          const { error } = await db.rpc("fund_savings_goal_for_user", {
            p_user_id: userId,
            p_goal_id: funding.goalId,
            p_amount: funding.amount,
            p_reference: funding.reference,
          });
          if (error) {
            if (/insufficient/i.test(error.message)) throw new HttpError(400, "Insufficient wallet balance.");
            if (/reference already used/i.test(error.message)) throw new HttpError(409, "This savings reference has already been used.");
            if (/not found|goal|inactive/i.test(error.message)) throw new HttpError(404, "Savings goal not found.");
            throw error;
          }
          return json({ ok: true }, 200, request);
        } catch (e) {
          return errorResponse(e, request);
        }
      },
    },
  },
});
