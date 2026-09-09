---
name: Payment return verification
description: Durable rule for subscription checkout returns on the Ajyal mobile client.
---

The mobile client must not treat `success_url`, a payment-return route, or the presence of an existing active subscription as proof that the current checkout succeeded. It may reread confirmed `user_subscriptions` and payment records and present the current account state, but it must not create subscriptions, add minutes, write payment records, or infer Stripe transaction success without a verified provider/session correlation and server-side idempotent flow.

**Why:** The available source documents require Webhook/provider/database confirmation and idempotency, while the mobile checkout only receives a redirect URL and the production Webhook contract is not available in the workspace.

**How to apply:** Keep provider confirmation server-authoritative. Treat missing Webhook/session identifiers as `UNVERIFIED` or `BLOCKED`, and do not replace the platform Edge Function or change production URLs/schema/RLS to make the mobile flow appear complete.