import { HttpError } from "./wallet-auth.server";

const BASE = "https://api.paystack.co";

export class PaystackRejected extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: any; data: T }> {
  const secret = process.env["PAYSTACK_SECRET_KEY"];
  if (!secret) throw new HttpError(503, "Payments are not configured yet.");
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body: any = await res.json().catch(() => ({}));
  return { ok: res.ok && body?.status === true, status: res.status, body, data: body?.data as T };
}

export async function listBanks() {
  const r = await call<Array<{ name: string; code: string; active: boolean; type: string }>>(
    "/bank?country=nigeria&currency=NGN&perPage=200",
  );
  if (!r.ok) throw new HttpError(502, "Could not load banks right now.");
  return r.data.filter((b) => b.active).map((b) => ({ name: b.name, code: b.code }));
}

export async function resolveAccount(accountNumber: string, bankCode: string) {
  const r = await call<{ account_name: string; account_number: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  );
  if (!r.ok) throw new HttpError(422, "We couldn't verify that account. Check the number and bank.");
  return r.data.account_name;
}

export async function createRecipient(name: string, accountNumber: string, bankCode: string) {
  const r = await call<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({ type: "nuban", name, account_number: accountNumber, bank_code: bankCode, currency: "NGN" }),
  });
  if (!r.ok) throw new PaystackRejected(r.body?.message || "Recipient rejected");
  return r.data.recipient_code;
}

/** Throws PaystackRejected only when Paystack explicitly refused; network errors propagate as-is (outcome unknown). */
export async function initiateTransfer(input: { amountNaira: number; recipient: string; reference: string; reason: string }) {
  const r = await call<{ status: string; transfer_code: string }>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(input.amountNaira * 100),
      recipient: input.recipient,
      reference: input.reference,
      reason: input.reason.slice(0, 100),
      currency: "NGN",
    }),
  });
  if (!r.ok) {
    if (r.status >= 500) throw new Error("Paystack unavailable");
    throw new PaystackRejected(r.body?.message || "Transfer rejected");
  }
  return r.data;
}

export async function verifyTransfer(reference: string) {
  const r = await call<{ status: string; transfer_code: string; amount: number }>(
    `/transfer/verify/${encodeURIComponent(reference)}`,
  );
  return r.ok ? r.data : null;
}

export async function verifySignature(rawBody: string, signature: string | null) {
  const secret = process.env["PAYSTACK_SECRET_KEY"];
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
