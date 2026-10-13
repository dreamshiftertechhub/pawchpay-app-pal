# PawchPay — Secure transaction connection (phase plan)

## Current status (inspected, nothing changed)
- **GitHub:** latest saved change is "Made it a real app installer" (includes the installable-app work and the package update). Lovable syncs to GitHub automatically once a repo is connected, but I cannot see your repository from here — confirm in **+ menu → GitHub** that this change appears there.
- **Secure database functions already in place (kept as-is, no new migrations, no grant changes):** `set_transaction_pin_for_user`, `verify_transaction_pin_for_user` (5 wrong tries → 15-min lock), `reserve_transfer_for_user`, `complete_transfer_by_reference`, `reverse_transfer_by_reference`, `confirm_funding_by_reference`, `purchase_airtime_for_user`, `fund_savings_goal_for_user`. All are callable by the server only.
- **What is broken today:**
  - The app's money actions call `wallet_credit` / `wallet_debit`, which the browser is no longer allowed to call — so they fail.
  - Inline screen code overrides some of those actions with fake results: transfer always says "Transfer successful", funding says "Funding initiated", airtime says "Airtime purchased" to a hardcoded `0801 234 5678`.
  - The PIN screen only checks that 4 digits were typed; it never verifies the PIN.

## What will change
1. **PIN setup and check** — First transfer prompts "Create your transaction PIN" (enter + confirm). Every transfer then checks the PIN on the server. Wrong-PIN count and lockout messages come from the server.
2. **Transfers (wallet → bank via Paystack)**
   - Look up the account name with Paystack before review; user must see the verified name.
   - On PIN approval the server: verifies PIN → reserves funds with a unique reference (one request = one reference, so a double tap cannot send twice) → creates the Paystack recipient → starts the transfer.
   - The result screen shows **"Transfer pending"**, never "successful", until Paystack confirms.
   - Paystack confirmation arrives via a signed webhook: success → `complete_transfer_by_reference`; failed/reversed → `reverse_transfer_by_reference` (money returned to the wallet automatically). If Paystack rejects the request immediately, funds are reversed at once and a clear failure is shown.
   - Saved recipients come from the user's own `beneficiaries` list instead of the fake contacts.
3. **Funding and airtime** — Both buttons show "Coming soon — not yet available" and move no money. No simulated success.
4. **Remove fakes** — Fake contacts, hardcoded phone/name/balance placeholders and success messages in these flows are removed; balances and history only come from the database.
5. **Design and installable app** — Visual design, splash and install-to-home-screen setup stay unchanged.

## Exact files
- **New** `src/lib/wallet-auth.server.ts` — verifies the caller's sign-in token server-side and returns the user ID (never trusts a user ID from the browser).
- **New** `src/lib/paystack.server.ts` — Paystack calls (resolve account, bank list, create recipient, start transfer) using the saved secret key, server-only.
- **New** `src/routes/api/wallet/pin.ts` — set PIN / PIN status.
- **New** `src/routes/api/wallet/resolve-account.ts` — verified account-name lookup.
- **New** `src/routes/api/wallet/transfer.ts` — PIN check, reserve, send, immediate reversal on rejection.
- **New** `src/routes/api/public/paystack-webhook.ts` — signature-checked (HMAC SHA-512), deduplicated via `paystack_events`, completes or reverses transfers.
- **Edit** `public/pawch-backend.js` — remove `wallet_credit`/`wallet_debit`; call the new endpoints with the sign-in token; PIN, beneficiaries, pending states.
- **Edit** `public/pawchpay.html` — remove the inline fake `doTransfer`/`fundVia`/`buyAirtime`/fake PIN check and fake contacts; add PIN-create sheet and "coming soon" states; markup/style otherwise untouched.
- **Edit** `roadmap.md`, `AGENTS.md` — record progress and the "money actions go through verified server endpoints" rule.

## Missing requirements from you / providers
- **Paystack:** business account verified, **Transfers enabled**, and a funded Paystack balance. Test keys work for testing but no real money moves.
- **Webhook URL** to paste in Paystack Dashboard → Settings → API Keys & Webhooks: `https://pawchpay-app-pal.lovable.app/api/public/paystack-webhook` (after publishing).
- **Paystack "transfer OTP"** must be **disabled** in Paystack settings, otherwise transfers wait for an SMS code the app cannot supply.
- **Later phases:** funding (Paystack checkout + verification), airtime/bills provider (e.g. VTpass), KYC provider, savings screens, native Android/iOS packaging.

## Technical details
- The app screen is a standalone page inside a frame, so it cannot use the framework's internal server-function calls; it will call plain server routes with `Authorization: Bearer <access token>`. Each route validates the token with the auth service, derives `userId`, then uses the server-only admin client to call the secure SQL functions with that `userId`.
- Idempotency: client generates a UUID reference per confirmed transfer; `transfer_requests.reference` uniqueness plus a pre-check rejects replays; button disabled while in flight.
- Webhook: raw body HMAC check with `PAYSTACK_SECRET_KEY`, `event_key` insert into `paystack_events` before processing; handles `transfer.success`, `transfer.failed`, `transfer.reversed`.
- Input validation with zod (amount > 0 and ≤ limit, 10-digit account, known bank code, 4-digit PIN).
- Verification: build check, plus a signed-in browser run of PIN setup, wrong PIN, account lookup, transfer to Paystack test mode (pending → webhook simulation), and confirming funding/airtime move no money. No production data will be altered beyond that test account's own test transactions.
