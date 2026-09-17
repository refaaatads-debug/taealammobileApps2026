---
name: Production API TLS
description: Certificate coverage required for the mobile API hostname used by EAS builds.
---

The API hostname configured in mobile runtime environments must present a certificate whose subject alternative names include that exact hostname. A health response obtained only with disabled certificate verification does not prove that Android clients can use the API.

**Why:** Native clients enforce certificate validation, so a hostname/certificate mismatch blocks every authenticated API request before the application can attach or validate a Supabase Bearer token.

**How to apply:** When auditing a new mobile runtime or changing the API domain, test the exact HTTPS hostname with normal certificate verification and inspect the certificate SANs. Do not add an insecure TLS exception to the app; repair the production certificate/DNS configuration instead.