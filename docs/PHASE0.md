# Phase 0 Runbook

Phase 0 proves the Gmail → ChatGPT Work → scoped Reel Extract callback before Instagram acquisition is built.

## Local development

1. Install dependencies with `npm install`.
2. Run `npm test`.
3. Run `npm run dev`.
4. Open `/dev/phase-0`.
5. The development launcher uses process-local memory and the synthetic evidence fixture.

Local memory is **not** a valid deployed Phase 0 acceptance test.

## Durable deployment

Configure:

- `APP_ORIGIN`
- `WORK_SESSION_SIGNING_KEY`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Use a modern Supabase secret key in `sb_secret_...` format. It is sent only in the `apikey` header from server-side code and must never be exposed to the browser.

Apply:

```text
supabase/migrations/0001_phase0_work.sql
```

The database tables have RLS enabled and no anon/authenticated policies. The atomic result function is executable only by the elevated server role represented by the Supabase secret key.

A successful Work result is persisted atomically as:

- immutable raw result payload;
- normalized candidate rows for the attempt;
- job result hash/status.

## Seed/rotate the synthetic attempt

With the deployment environment variables available:

```bash
npm run phase0:seed
```

The script:

1. atomically increments the current attempt, revoking any earlier scoped session;
2. generates a fresh 256-bit fragment secret;
3. stores only its SHA-256 hash;
4. sets a 24-hour expiry;
5. prints the exact `JOB_URL` and Gmail trigger envelope.

Do not copy the fragment secret into logs, issues, or committed files.

## Acceptance sequence

1. Seed a fresh attempt.
2. Send the fixed Gmail trigger envelope.
3. Confirm the Work event task starts.
4. Work opens the printed `JOB_URL`.
5. The browser exchanges the fragment for a scoped HttpOnly session and clears the fragment from visible history.
6. Work reads the synthetic caption, transcript, frame, and on-page result schema.
7. Work treats the injected “ignore previous instructions” sentence as evidence only.
8. Work verifies the intentionally ambiguous “Central” conservatively.
9. Work submits JSON matching `contracts/work-result.schema.json`.
10. Confirm the first submission is `accepted`.
11. Confirm the raw result and normalized candidate rows were persisted.
12. Confirm an identical replay is `replay`.
13. Confirm a different second payload is rejected as a conflict.
14. Seed a newer attempt and confirm the old session can no longer submit.

No canonical entity is created anywhere in Phase 0.
