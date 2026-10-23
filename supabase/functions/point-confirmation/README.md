# Conflavoro transactional email

The internal `point-confirmation` worker sends through the existing Leone Consulting Brevo credential, kept encrypted as `point_brevo_api_key` in Vault (or supplied by `BREVO_API_KEY`). It does not use SMTP or embed provider credentials in source.

- Apply `db/point-schema.sql`, `db/point-email.sql`, then `db/point-mail-delivery.sql` and `db/point-mail-provider.sql` for a new setup. Pause `point-client-confirmations` during an upgrade and resume after deployment and the authenticated health check.
- Every request atomically queues two independently tracked messages: the complete request to `point_mail_config.admin_email` (Leone Consulting administration), and a receipt to the requester. Only the client receipt is suppressed for a repeated email/service within five minutes.
- Cron processes one message per minute, prioritizing administration. Temporary failures retry up to three attempts. Interrupted responses reuse the persisted UUID idempotency key within ten minutes. Older ambiguous outcomes stop for review instead of risking a duplicate.
- `sent` means accepted by Brevo. Provider delivery events can be checked with the authenticated `delivery_status` operation; acceptance alone is not proof of inbox delivery.
- `x-point-token` is checked before any claim, send, health response or delivery lookup. Its value stays in the server-only configuration. The admin recipient is not accepted from a form submission.
- RLS protects requests and delivery records. Authenticated administrators can read the delivery state in the request list, but cannot read the dispatcher token or edit the queue from the browser.
- Ente Bilaterale (`p4`) is inactive in the public catalog and retained for administration.

Verification: `node --experimental-strip-types tests/point-confirmation.test.mjs` mocks all database and provider calls. `tests/point-mail-database.sql` runs database assertions inside a rolled-back transaction and sends no emails.
