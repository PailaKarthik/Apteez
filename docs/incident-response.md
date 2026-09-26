# Incident response

## Levels

- **P0** — critical system unavailable / security emergency (site down,
  auth broken, data at risk). All hands; rollback/flag-kill first.
- **P1** — major feature unavailable (redemption, contests, RAG all-down
  with no fallback). Owner + one helper.
- **P2** — significant degradation (elevated 5xx, slow retrieval, queue
  backlog growing). Owner investigates within the hour.
- **P3** — minor issue (single-endpoint errors, cosmetic, isolated reports).
  Normal backlog with a note.

## Flow

1. **Detection:** alerts (`docs/alerting.md`), `/health` degradation, user
   feedback triage (`/admin/feedback`), error-rate watch after deploys.
2. **Owner:** on-call names one owner; everyone else assists or stays out.
3. **Mitigation before diagnosis:** flag-kill (`docs/feature-flags.md`) or
   rollback (`docs/rollback.md`), then investigate. Runbooks:
   `docs/runbooks.md`.
4. **Communication:** incident channel, user-facing status note for P0/P1,
   what is affected + workaround + next update time. No speculation.
5. **Recovery:** verify with smoke + `deploy:verify`, watch the monitoring
   window, confirm error rates returned to baseline.
6. **Post-incident review (P0/P1):** timeline, root cause, what mitigated it,
   action items with owners. Blameless; the artifact is prevention.

## Security incidents (minimal path)

Events: suspicious admin role change, leaked key, auth-failure spike,
point/reward abuse, contest manipulation, unauthorized access attempts.

- **Identify:** `GET /admin/audit-logs` (who did what, when, from which IP),
  `GET /admin/users` detail (points, reports, sessions context),
  `GET /admin/rate-limits` (abuse shape), Sentry requestIds.
- **Contain:** suspend/ban via `PATCH /admin/users/:id/status` — this now
  **revokes all live sessions immediately** (verified); disable the abused
  surface via feature flag; rotate the leaked credential (env/secret store,
  never in code).
- **Recover:** audit log confirms scope; compensating ledger actions for
  point abuse (admin refund/cancel — never raw SQL edits); force re-login by
  the session revoke above (there is no password-change endpoint yet — see
  `docs/tech-debt.md`, so rotation = revoke + user sets a new credential via
  the account flow when it lands).
- Internal controls stay staff-only: no security affordances in the user UI.

## Account / session response

Sessions are opaque Redis tokens. `SessionService.revokeAllForUser` is the
single invalidation path, invoked automatically on suspend/ban and usable
from any future compromise flow. No second auth system exists.
