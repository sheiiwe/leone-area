# Point customer confirmations

Runs only in Leone Consulting project `uljdbdbkiulbcquuhfwd`.

- `db/point-email.sql` adds the transactional outbox and a one-minute cron dispatcher.
- Only new `point_richieste` inserts enqueue confirmations. No historical backfill.
- Recipient is the submitted email; title and partner are authoritative request snapshots. No extra recipients, marketing or automatic Conflavoro referral.
- Same email/service within five minutes receives one confirmation, while every request remains recorded.
- Uses existing server secrets `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` over TLS port 465.
- Edge JWT check is replaced by a dedicated random internal token, kept in an RLS-protected server-only table. The browser cannot call the dispatcher or alter the queue.
- Sends one message per cron invocation; transient failures retry after five minutes, up to three attempts. `sending` after an ambiguous crash requires manual verification before any resend.
- `point_mail_outbox` records `pending`, `sending`, `sent` (SMTP accepted), `failed`, `suppressed`. SMTP acceptance does not guarantee inbox delivery.

Verification: `node --experimental-strip-types tests/point-confirmation.test.mjs` mocks all network and SMTP. Database enqueue, duplicate suppression and access controls were verified in a rolled-back transaction; authenticated production health check returned HTTP 200 with SMTP configuration present. No real customer email was sent during testing.
