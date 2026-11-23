# Saved profile number as login number, branch design only

23 November2026. Not enabled in any app or server.

Use the same normalized number already in the user's profile, not a second login number. A unique profile match is necessary, but not sufficient evidence of account ownership. Contact fields are editable without SMS verification, and possession of a phone now cannot prove it was correctly entered on the legacy account or has not been recycled.

Read-only aggregate audit:30nonempty profile phone rows,22valid Saudi mobile-format rows,8invalid/non-Saudi.11distinct valid numbers,8unique rows,3duplicate groups containing14rows. One of8unique rows lacks a role. Zero verified matching auth-phone bindings. Format and uniqueness are not trust.

Legacy first use: existing email/Google proves account ownership, prefill saved number, send SMS OTP, verify phone_change on the authenticated SAME uid. This confirmation establishes the saved number as future login number. Do not change profile text into a trusted binding silently. Existing verified bindings may use SMS-only login thereafter. No automatic signup, no merges, no session from public profile lookup.

Ambiguous/duplicate/unverified bindings fail closed to email/Google without revealing account existence or names. Roles/profile/banned status must still pass existing gates. No automatic reassignment of a number used by a different account. Any number edit invalidates the login binding and requires re-verification. Future recycled-number risk needs reauth/notification/recovery policy.

Provider readiness, rate limits, bot protection, resend cooldown, secure server verification and runtime tests required before enablement. Preview does not send network auth requests.
