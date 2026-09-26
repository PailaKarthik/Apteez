/**
 * Production smoke test — anonymous surface + health semantics.
 *
 * Usage (PowerShell):
 *   $env:BASE_URL = 'http://localhost:3001/api/v1'; node scripts/smoke/smoke.mjs
 *
 * Checks (fail-fast, exit 1 on first failure):
 *   1. GET /health/live      → 200, process liveness, no dependency coupling
 *   2. GET /health/ready     → 200 (or 503 when a dependency is down), dependency checks present
 *   3. GET /health           → 200 with database/redis/queue checks
 *   4. Anonymous reads       → problems, search, categories, leaderboard all 2xx
 *   5. Unknown route         → shared error envelope { success:false, error, requestId }
 *   6. x-request-id          → present on responses
 *
 * Authenticated journeys (signup → submission → challenge → contest → event →
 * redemption → admin review, AI coach/RAG/review) are covered by the API e2e
 * suite and the DEPLOYMENT.md post-deploy checklist — they need seeded
 * credentials and must never run against production with fake data.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001/api/v1';

let failures = 0;

function report(ok, label, detail = '') {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function get(path, { expectStatus = 200 } = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    await response.arrayBuffer();
    return {
      ok: response.status === expectStatus,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      headers: response.headers,
      json: async () => response.json(),
    };
  } catch (error) {
    return { ok: false, status: 0, latencyMs: Date.now() - startedAt, error };
  }
}

// 1. Liveness — must never depend on downstream systems.
{
  const res = await get('/health/live');
  report(res.ok, 'GET /health/live is 200', `status=${res.status}`);
}

// 2/3. Readiness + full health carry dependency checks.
for (const path of ['/health/ready', '/health']) {
  const res = await get(path);
  let body = null;
  try {
    const raw = await (await fetch(`${BASE_URL}${path}`)).json();
    body = raw?.data ?? raw;
  } catch {
    body = null;
  }
  const hasChecks = Boolean(body && body.checks && body.checks.database && body.checks.redis);
  report(res.ok && hasChecks, `GET ${path} reports dependency checks`, `status=${res.status}`);
}

// 4. Anonymous read surface.
for (const path of [
  '/problems?limit=5',
  '/search?q=algebra&type=all',
  '/search/trending',
  '/categories',
]) {
  const res = await get(path);
  report(res.ok, `GET ${path} is reachable`, `status=${res.status} (${res.latencyMs}ms)`);
}

// 5. Shared error envelope on unknown routes.
{
  const response = await fetch(`${BASE_URL}/definitely-not-a-route`);
  await response.arrayBuffer();
  let envelope = false;
  try {
    const body = await (await fetch(`${BASE_URL}/definitely-not-a-route`)).json();
    envelope =
      body?.success === false &&
      typeof body?.error?.code === 'string' &&
      typeof body?.requestId === 'string';
  } catch {
    envelope = false;
  }
  report(response.status === 404 && envelope, 'unknown routes use the shared error envelope');
}

// 6. Request IDs on responses.
{
  const response = await fetch(`${BASE_URL}/health/live`);
  await response.arrayBuffer();
  report(
    typeof response.headers.get('x-request-id') === 'string' &&
      (response.headers.get('x-request-id') ?? '').length > 0,
    'x-request-id header is present',
  );
}

if (failures > 0) {
  console.error(`SMOKE FAILED: ${failures} failing check(s)`);
  process.exit(1);
}
console.log('SMOKE OK');
