# Load / stress scaffold

Minimal, dependency-free load probes for high-risk read paths. Run against a
local or staging API — **never production**:

```powershell
$env:BASE_URL = 'http://localhost:3001/api/v1'
$env:CONCURRENCY = '4'
$env:ITERATIONS = '10'
node scripts/load/probe.mjs
```

Defaults (4×10 = 80 requests) fit inside the stock per-IP throttle budget
(100 req / 60s). If you raise the volume, expect HTTP 429s past the budget —
that is the Redis-backed limiter working as designed, and the probe reports
them as failures so throttling behavior itself stays observable. For a clean
run after a throttled one, flush a THROWAWAY Redis only (Upstash dashboard →
data browser → flush, or a local `redis-cli -u <dev-only-url> FLUSHALL`) —
never the shared/staging/prod database, since counters persist across runs.

The script reports actual measured latency (p50/p95/max) per endpoint and
exits non-zero if any request fails. It records real numbers only — no
fabricated baselines. Extend `ENDPOINTS` in `probe.mjs` to cover new hot
paths (matchmaking, contest submit, event registration, AI coach).
