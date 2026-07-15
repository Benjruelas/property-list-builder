# Connected Quote Payments

## Goal

Complete the partially built quote-payment flow with Stripe-hosted Checkout,
Stripe Link and eligible financing, Stripe Connect Standard accounts, and a
safe owner-only action for recording external payments.

Payments will be team-owned when a user belongs to a team, with a personal
connected account fallback for solo users.

## Architecture decisions

- Use Stripe Connect Standard accounts and direct charges so each contractor
  receives funds and owns disputes and refunds in their Stripe Dashboard. Team
  admins connect one business account; solo users connect a personal account.
- Keep Stripe-hosted Checkout. Remove the hard-coded card-only method list so
  Stripe dynamic payment methods can present Link and eligible Link funding
  options such as Klarna. Availability remains controlled by Stripe, geography,
  amount, and each connected account's payment-method settings.
- Treat the webhook as the payment source of truth. A Checkout redirect alone
  must never display an unverified paid state.
- Keep the first release to one-time USD payments, full-quote payment, and
  manual external settlement. Partial payments, deposits, refunds, and platform
  application fees remain separate follow-ups.

## Implementation

1. Add server-authoritative Connect account storage in
   [`api/lib/stripeConnectStore.js`](../api/lib/stripeConnectStore.js), keyed by
   team or user and containing the Stripe account ID plus normalized onboarding,
   charge, and payout readiness. Do not place account IDs in the
   client-synchronized user-data blob.
2. Add authenticated onboarding and status actions in
   [`api/stripe-connect.js`](../api/stripe-connect.js): resolve team-admin versus
   solo ownership, create or reuse a Standard account, issue single-use Account
   Links, refresh status from Stripe, and return only safe readiness fields.
   Add a client wrapper in
   [`src/utils/stripeConnect.js`](../src/utils/stripeConnect.js).
3. Add payment setup UI: a team-admin payment section alongside existing
   business settings in
   [`src/components/TeamDetails.jsx`](../src/components/TeamDetails.jsx), with a
   solo-user fallback in
   [`src/components/SettingsPanel.jsx`](../src/components/SettingsPanel.jsx).
   Show disconnected, onboarding-required, restricted, and ready states.
4. Replace the incomplete paid paths with a shared, idempotent settlement
   service in [`api/lib/quotePayments.js`](../api/lib/quotePayments.js). It will
   atomically set `status`, `paidAt`, `paymentSource`, processor IDs, and webhook
   event ID; then reuse
   [`api/lib/syncQuoteToDeal.js`](../api/lib/syncQuoteToDeal.js) to settle deal
   rows and trigger the existing paid notification exactly once.
5. Extend the owner-authenticated quote API in
   [`api/quotes.js`](../api/quotes.js) with an explicit `mark-paid-external`
   action rather than permitting arbitrary status patches. Require an accepted,
   unpaid, owner-owned quote; record an external-payment audit timestamp and
   source; and route it through the same settlement service as Stripe.
6. Update
   [`src/components/quotes/QuoteEditor.jsx`](../src/components/quotes/QuoteEditor.jsx)
   to replace `paymentEnabled: false` with an "Accept online payments" toggle
   gated by resolved Connect readiness. Add payment state and a
   confirmation-based "Mark paid externally" action to
   [`src/components/quotes/QuoteDetails.jsx`](../src/components/quotes/QuoteDetails.jsx),
   backed by [`src/utils/quotes.js`](../src/utils/quotes.js).
7. Update Checkout creation in
   [`api/public-quote.js`](../api/public-quote.js): resolve the quote owner's
   team or personal connected account, reject stale or unavailable accounts,
   create a direct-charge Checkout Session in that account, prefill client
   email, use dynamic payment methods for Link and financing eligibility, and
   persist the session and account identifiers. Keep acceptance and
   minimum-amount checks.
8. Harden webhook handling in
   [`api/stripe-webhook.js`](../api/stripe-webhook.js) and add
   [`api/stripe-connect-webhook.js`](../api/stripe-connect-webhook.js): preserve
   raw request bytes, validate separate endpoint secrets, process
   connected-account `checkout.session.completed` events using `event.account`,
   update `account.updated` readiness, reject account and quote mismatches, and
   deduplicate events. Update local webhook passthrough in
   [`scripts/viteApiDevPlugin.js`](../scripts/viteApiDevPlugin.js) if needed for
   raw-body fidelity.
9. Fix
   [`src/components/quotes/PublicQuotePage.jsx`](../src/components/quotes/PublicQuotePage.jsx)
   so `?payment=success` shows a verifying state and reloads until the
   webhook-confirmed quote is paid. Canceling Checkout returns to the accepted
   quote without changing its status.
10. Document `STRIPE_CONNECT_WEBHOOK_SECRET`, Connect webhook registration,
    Link and Klarna enablement, and onboarding behavior in
    [`.env.example`](../.env.example) and [`README.md`](../README.md). Stripe's
    eligibility rules mean financing must be described as available when
    offered, not guaranteed.

## Verification

- Add focused tests for Connect ownership and readiness, owner authorization,
  legal status transitions, settlement idempotency, connected-account mismatch
  rejection, webhook signature and event routing, dynamic Checkout parameters,
  external-payment deal synchronization, and success-page verification.
- Run the Vitest suite and production build.
- In Stripe test mode, manually exercise Standard-account onboarding, accepted
  quote Checkout with Link, an eligible financing offer, webhook completion,
  duplicate webhook delivery, canceled Checkout, and external mark-paid
  behavior.

## Delivery checklist

- [ ] Add Connect account persistence, onboarding/status API, and team/solo
      settings UI.
- [ ] Create the shared idempotent quote settlement service and external-payment
      action.
- [ ] Route hosted Checkout through connected accounts with Link and dynamic
      financing methods.
- [ ] Implement raw-body Connect webhook verification, account updates, and
      event deduplication.
- [ ] Enable payment controls and webhook-confirmed public payment status.
- [ ] Add payment tests, configuration documentation, and verify build and
      test-mode flows.
