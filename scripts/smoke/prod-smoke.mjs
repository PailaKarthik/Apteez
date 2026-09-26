/**
 * Post-deploy smoke test for staging/production.
 *
 * Read-only by default: every check is a GET or an unauthenticated call
 * that must fail with the shared 401/404 envelope (proving route + auth
 * wiring without mutating anything).
 *
 * Optional staging write (exactly one controlled practice attempt):
 *   SMOKE_TARGET=staging SMOKE_ALLOW_WRITES=true
 *   SMOKE_EMAIL=... SMOKE_PASSWORD=...
 *   node scripts/smoke/prod-smoke.mjs
 * Writes are REFUSED unless SMOKE_TARGET=staging — production never sees a
 * write from this script.
 *
 * Usage:
 *   $env:BASE_URL='https://staging-api.example.com/api/v1'; node scripts/smoke/prod-smoke.mjs
 *
 * Exit 0 when every check passes/skips; exit 1 on the first failure class.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001/api/v1';
const TARGET = (process.env.SMOKE_TARGET ?? '').toLowerCase();
const ALLOW_WRITES =
  TARGET === 'staging' && (process.env.SMOKE_ALLOW_WRITES ?? '').toLowerCase() === 'true';

let failures = 0;
let skipped = 0;

function report(ok, label, detail = '') {
  if (ok === 'skip') {
    skipped += 1;
    console.log(`skip ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function request(method, path, { body, token, expectStatus = 200 } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return {
      ok: response.status === expectStatus,
      status: response.status,
      json,
      headers: response.headers,
    };
  } catch (error) {
    return { ok: false, status: 0, json: null, headers: new Headers(), error };
  }
}

const get = (path, opts) => request('GET', path, opts);
const post = (path, opts) => request('POST', path, opts);

const dataOf = (res) => res.json?.data ?? res.json;

// 1. Liveness — never depends on downstream systems.
{
  const res = await get('/health/live');
  report(res.ok && dataOf(res)?.status === 'ok', 'GET /health/live is 200', `status=${res.status}`);
}

// 2/3. Readiness + full health carry dependency checks and release identity.
for (const path of ['/health/ready', '/health']) {
  const res = await get(path);
  const body = dataOf(res);
  const hasChecks = Boolean(body?.checks?.database && body?.checks?.redis);
  const hasRelease = typeof body?.commit === 'string' && typeof body?.version === 'string';
  report(
    res.ok && hasChecks && hasRelease,
    `GET ${path} reports checks + release`,
    `status=${res.status}`,
  );
  if (body && body.commit === 'unknown') {
    console.log(
      '     note: commit=unknown — image did not inject GIT_SHA (see docs/launch-strategy.md)',
    );
  }
}

// 4. Public flag snapshot for UX gating (booleans only, rollout pre-evaluated).
{
  const res = await get('/flags');
  const flags = res.json?.data?.flags ?? res.json?.flags;
  const expected = [
    'AI_PERFORMANCE_COACH',
    'AI_SIMILAR_PROBLEMS',
    'AI_CONTRIBUTION_REVIEW',
    'REWARDS_REDEMPTION',
    'PUBLIC_EVENTS',
    'COMMUNITY_CONTRIBUTIONS',
  ];
  report(
    res.ok && expected.every((key) => typeof flags?.[key] === 'boolean'),
    'GET /flags exposes the six launch flags',
    `status=${res.status}`,
  );
}

// 5. Problem read: list then detail (detail id feeds the RAG check).
let problemId = null;
{
  const res = await get('/problems?limit=1');
  const items = dataOf(res)?.items ?? [];
  problemId = items[0]?.id ?? null;
  report(res.ok && problemId, 'GET /problems reads the library', `status=${res.status}`);
  if (problemId) {
    const detail = await get(`/problems/${problemId}`);
    report(detail.ok, 'GET /problems/:id reads a problem', `status=${detail.status}`);
  }
}

// 6. Search + RAG path (read-only; source reveals vector vs lexical).
{
  const res = await get('/search?q=algebra&type=all');
  report(res.ok, 'GET /search answers queries', `status=${res.status}`);
  const trending = await get('/search/trending');
  report(trending.ok, 'GET /search/trending is reachable', `status=${trending.status}`);
  if (problemId) {
    const similar = await get(`/search/similar?problemId=${problemId}&limit=3`);
    const items = similar.json?.data?.items ?? similar.json?.items ?? [];
    const sources = new Set(items.map((item) => item.source));
    report(
      similar.ok && Array.isArray(items),
      'GET /search/similar serves canonical rows',
      `status=${similar.status} sources=[${[...sources].join(',')}]`,
    );
    const fabricated = items.some((item) => !item.problem?.id);
    report(!fabricated, 'similar rows are hydrated library problems');
  }
}

// 7. Contest + event reads.
{
  const contests = await get('/contests?page=1&pageSize=1');
  report(contests.ok, 'GET /contests reads contests', `status=${contests.status}`);
  const events = await get('/events?page=1&pageSize=1');
  if (events.status === 503 && events.json?.error?.code === 'SERVICE_UNAVAILABLE') {
    report('skip', 'GET /events anonymous discovery (PUBLIC_EVENTS flag off)');
  } else {
    report(events.ok, 'GET /events reads events', `status=${events.status}`);
  }
}

// 8. Rewards reads (catalog is anonymous; rules need a session; redemption
// is never smoke-tested).
{
  const catalog = await get('/rewards/catalog?page=1&pageSize=1');
  report(catalog.ok, 'GET /rewards/catalog reads the catalog', `status=${catalog.status}`);
  const rules = await get('/rewards/rules', { expectStatus: 401 });
  report(
    rules.ok && rules.json?.success === false,
    'GET /rewards/rules requires a session',
    `status=${rules.status}`,
  );
}

// 9. Challenge + learning reads.
{
  const domains = await get('/challenges/domains');
  report(domains.ok, 'GET /challenges/domains reads challenge config', `status=${domains.status}`);
  const paths = await get('/learning/paths');
  report(paths.ok, 'GET /learning/paths reads learning paths', `status=${paths.status}`);
}

// 10. Auth wiring without mutation: protected routes must 401 with the envelope.
for (const [label, method, path] of [
  ['GET /auth/me requires a session', 'GET', '/auth/me'],
  ['GET /profile/me requires a session', 'GET', '/profile/me'],
  ['GET /ai/usage requires privileges', 'GET', '/ai/usage'],
  ['GET /admin/users requires privileges', 'GET', '/admin/users'],
  ['POST /contributions requires a session', 'POST', '/contributions'],
]) {
  const res =
    method === 'GET'
      ? await get(path, { expectStatus: 401 })
      : await post(path, { expectStatus: 401, body: {} });
  const envelope = res.json?.success === false && typeof res.json?.error?.code === 'string';
  report(res.ok && envelope, `${label} (401 envelope)`, `status=${res.status}`);
}

// 11. Practice wiring without mutation: starting an attempt anonymously 401s.
if (problemId) {
  const res = await post(`/problems/${problemId}/attempts`, { expectStatus: 401, body: {} });
  report(
    res.ok && res.json?.success === false,
    'POST /problems/:id/attempts requires a session',
    `status=${res.status}`,
  );
}

// 12. Contract invariants.
{
  const res = await get('/api-v1-nope');
  report(
    res.status === 404 && res.json?.success === false,
    'unknown routes use the shared error envelope',
    `status=${res.status}`,
  );
  const headed = await get('/health/live');
  report(Boolean(headed.headers.get('x-request-id')), 'x-request-id header is present');
}

// 13. Optional staging write: exactly one practice attempt on a throwaway login.
if (ALLOW_WRITES) {
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;
  if (!email || !password) {
    report(false, 'staging write needs SMOKE_EMAIL + SMOKE_PASSWORD');
  } else if (!problemId) {
    report(false, 'staging write needs a readable problem');
  } else {
    const login = await post('/auth/login', { body: { email, password } });
    const cookie = login.headers.get('set-cookie');
    const token = cookie?.split(';')[0]?.split('=').slice(1).join('=');
    report(login.ok && Boolean(token), 'staging login issues a session', `status=${login.status}`);
    if (token) {
      const authed = (path, opts = {}) => request(opts.method ?? 'GET', path, { ...opts, token });
      const me = await authed('/auth/me');
      report(me.ok, 'staging session reads /auth/me', `status=${me.status}`);
      const rulesAuthed = await authed('/rewards/rules');
      report(rulesAuthed.ok, 'staging session reads earning rules', `status=${rulesAuthed.status}`);
      // Option ids come from the problem detail (attempt start never leaks answers).
      const detailRes = await authed(`/problems/${problemId}`);
      const detailBody = detailRes.json?.data ?? detailRes.json;
      const optionId = detailBody?.options?.[0]?.id;
      report(
        detailRes.ok && Boolean(optionId),
        'staging reads answer options',
        `status=${detailRes.status}`,
      );
      if (optionId) {
        const start = await authed(`/problems/${problemId}/attempts`, {
          method: 'POST',
          body: {},
          expectStatus: 201,
        });
        const attempt = start.json?.data ?? start.json;
        report(
          start.ok && Boolean(attempt?.id),
          'staging starts a practice attempt',
          `status=${start.status}`,
        );
        if (attempt?.id) {
          const submit = await authed(`/problems/${problemId}/attempts/${attempt.id}/submit`, {
            method: 'POST',
            body: { selectedOptionId: optionId },
          });
          const result = submit.json?.data ?? submit.json;
          report(
            submit.ok && typeof result?.result?.isCorrect === 'boolean',
            'staging submits one answer (server-scored)',
            `status=${submit.status}`,
          );
        }
      }
    }
  }
} else {
  console.log(
    '     note: staging write skipped (set SMOKE_TARGET=staging + SMOKE_ALLOW_WRITES=true for the controlled attempt)',
  );
}

console.log(
  failures === 0
    ? `\nPROD-SMOKE OK (${skipped} skipped)`
    : `\nPROD-SMOKE FAILED (${failures} failures)`,
);
process.exit(failures === 0 ? 0 : 1);
