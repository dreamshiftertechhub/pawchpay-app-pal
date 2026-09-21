# Finish PawchPay: security, payments, savings, and polish

## Goal
Complete PawchPay as a cleaner, more professional mobile wallet while preserving its teal minimalist direction and the uploaded logo design.

## What will change
- Remove the logo’s dark rectangular background and place the transparent wordmark naturally on the teal splash screen.
- Remove the simulated phone time, signal, service, and battery strip from the app frame.
- Refine spacing, hierarchy, navigation, feedback, loading, empty, success, and error states across the existing screens without replacing PawchPay’s identity.
- Complete recipient selection and transfers with account verification, a server-checked transaction PIN, clear review details, duplicate-submit protection, and safe transaction status handling.
- Connect wallet funding and bank transfers to Paystack using the saved keys; verify successful funding server-side and process signed Paystack webhooks idempotently.
- Keep airtime wallet-funded for now because Paystack does not deliver airtime; the app will state this accurately rather than simulate external delivery.
- Add target savings: create a named goal, choose target amount/date, fund from wallet, show progress, and keep savings records per account.
- Strengthen data rules so users only access their own wallet, recipients, savings goals, and transactions.

## Technical details
- Add migrations for hashed transaction PIN data, payment references/events, beneficiaries, savings goals/contributions, grants, indexes, and strict row-level access.
- Use authenticated TanStack server functions for Paystack operations and a public webhook route with signature verification.
- Never expose the Paystack secret key or trust client-supplied payment success, balances, PIN validity, or transfer status.
- Rework the standalone app’s browser wiring to call the authenticated server endpoints and refresh live balances/history after confirmed operations.
- Preserve the existing route metadata and update only what is needed for the new app experience.

## Verification
- Check splash, signup/login security flow, dashboard, recipient creation, transfer PIN, funding handoff, bills/loans, savings creation/funding, and transaction history on mobile and desktop-sized previews.
- Confirm no console/runtime errors, a successful app build, and database security checks.
