/**
 * Post-deploy verification (13 steps). Automated checks run here; steps that
 * need a human dashboard get MANUAL verdicts that the operator must sign off
 * in the release log — the deploy is NOT successful merely because the
 * container started.
 *
 * Usage:
 *   $env:BASE_URL='https://staging-api.example.com/api/v1'; node scripts/deploy/verify-deploy.mjs
 *   # optional: EXPECT_COMMIT=abc1234 node scripts/deploy/verify-deploy.mjs
 *
 * Exit 0 when every automated check passes (manual steps listed at the end);
 * exit 1 on any automated failure.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001/api/v1';
const EXPECT_COMMIT = process.env.EXPECT_COMMIT ?? null;
const ORIGIN = BASE_URL.replace(/\/api\/v1\/?$/, '');

let failures = 0;
const manual = [];

function pass(step, detail = '') {
  console.log(`ok     [${step}]${detail ? ` ${detail}` : ''}`);
}

function fail(step, detail = '') {
  failures += 1;
  console.error(`FAIL   [${step}]${detail ? ` — ${detail}` : ''}`);
}

function needsHuman(step, detail) {
  manual.push({ step, detail });
  console.log(`manual [${step}] ${detail}`);
}

async function get(path, { base = BASE_URL } = {}) {
  try {
    const response = await fetch(`${base}${path}`);
    // Read text first: engine.io handshakes are not valid JSON (`0{...}`),
    // and the body stream can only be consumed once.
    const text = await response.text().catch(() => '');
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, json, text, headers: response.headers };
  } catch (error) {
    return { status: 0, json: null, text: '', headers: new Headers(), error };
  }
}

const dataOf = (res) => res.json?.data ?? res.json;

// 1. Deployment version.
{
  const res = await get('/health');
  const body = dataOf(res);
  if (res.status === 200 && body?.version && body?.commit) {
    const match = EXPECT_COMMIT ? body.commit.startsWith(EXPECT_COMMIT) : true;
    if (match) {
      pass(1, `version=${body.version} commit=${body.commit} tag=${body.tag ?? 'none'}`);
    } else {
      fail(1, `commit ${body.commit} does not match EXPECT_COMMIT=${EXPECT_COMMIT}`);
    }
    if (body.commit === 'unknown') {
      needsHuman(
        1,
        'commit=unknown — image did not inject GIT_SHA; fix build args before calling this a release',
      );
    }
  } else {
    fail(1, `health unreachable (status=${res.status})`);
  }
}

// 2. Health endpoints.
{
  const live = await get('/health/live');
  const ready = await get('/health/ready');
  if (live.status === 200) {
    pass(2, 'live=200');
  } else {
    fail(2, `live status=${live.status}`);
  }
  if (ready.status === 200) {
    pass(2, 'ready=200');
  } else {
    fail(2, `ready status=${ready.status} — dependencies degraded, see step 4-6`);
  }
}

// 3. API availability.
{
  const res = await get('/problems?limit=1');
  if (res.status === 200) {
    pass(3, 'problem library reachable');
  } else {
    fail(3, `problems status=${res.status}`);
  }
}

// 4/5. Database + Redis connectivity (via ready checks).
{
  const res = await get('/health/ready');
  const checks = dataOf(res)?.checks;
  if (checks?.database?.status === 'up') {
    pass(4, `database up (${checks.database.latencyMs}ms)`);
  } else {
    fail(4, `database status=${checks?.database?.status ?? res.status}`);
  }
  if (checks?.redis?.status === 'up') {
    pass(5, `redis up (${checks.redis.latencyMs}ms)`);
  } else {
    fail(5, `redis status=${checks?.redis?.status ?? res.status}`);
  }
}

// 6. Worker availability (queue depth readable + failed counts surfaced).
{
  const res = await get('/health/ready');
  const queues = dataOf(res)?.checks?.queues ?? {};
  const names = Object.keys(queues);
  const down = names.filter((name) => queues[name]?.status !== 'up');
  if (names.length > 0 && down.length === 0) {
    const failed = names.map((name) => `${name}:failed=${queues[name]?.failed ?? '?'}`).join(' ');
    pass(6, `queues readable (${failed})`);
    const totalFailed = names.reduce((sum, name) => sum + (queues[name]?.failed ?? 0), 0);
    if (totalFailed > 100) {
      needsHuman(
        6,
        `${totalFailed} failed jobs visible — triage via GET /admin/queues before peak traffic`,
      );
    }
  } else {
    fail(6, `queues down=[${down.join(',')}] (status=${res.status})`);
  }
  needsHuman(
    6,
    'confirm the worker process (start:worker) is running its repeatable sweeps, not just the API',
  );
}

// 7. WebSocket connectivity (transport handshake only — no session, no mutation).
{
  const res = await get('/socket.io/?EIO=4&transport=polling', { base: ORIGIN });
  if (res.status === 200 && /^0\{/.test(res.text)) {
    pass(7, 'socket.io polling handshake answers with an open packet');
  } else {
    fail(
      7,
      `socket.io handshake status=${res.status} body=${JSON.stringify(res.text.slice(0, 60))}`,
    );
  }
}

// 8. Object storage.
needsHuman(
  8,
  'upload one avatar/asset on staging (or check S3 2xx in storage logs); no public storage endpoint exists by design',
);

// 9. Authentication (401 envelope proves the session layer rejects properly).
{
  const res = await get('/auth/me');
  if (res.status === 401 && res.json?.success === false) {
    pass(9, 'session layer rejects anonymous /auth/me with the envelope');
  } else {
    fail(9, `/auth/me status=${res.status} (expected 401 envelope)`);
  }
}

// 10. Search.
{
  const res = await get('/search?q=algebra&type=all');
  if (res.status === 200) {
    pass(10, 'search answers queries');
  } else {
    fail(10, `search status=${res.status}`);
  }
}

// 11. Core practice flow (read-only here; the write leg lives in prod-smoke staging mode).
{
  const list = await get('/problems?limit=1');
  const id = (list.json?.data?.items ?? list.json?.items ?? [])[0]?.id;
  if (id) {
    const detail = await get(`/problems/${id}`);
    if (detail.status === 200) {
      pass(11, 'practice read leg works (list → detail)');
    } else {
      fail(11, `problem detail status=${detail.status}`);
    }
    needsHuman(
      11,
      'run the controlled staging attempt: SMOKE_TARGET=staging node scripts/smoke/prod-smoke.mjs',
    );
  } else {
    fail(11, 'no problem available for the practice leg');
  }
}

// 12. Monitoring.
needsHuman(
  12,
  'open Sentry + log aggregator for this release/commit; confirm error stream is flowing (not silent)',
);

// 13. Error-rate spike check.
needsHuman(
  13,
  'compare 5xx/4xx rate vs pre-deploy baseline for 15 min; roll back on deployment-shaped spikes (see docs/rollback.md)',
);

console.log(
  failures === 0
    ? `\nVERIFY OK — automated checks passed, ${manual.length} manual sign-offs outstanding`
    : `\nVERIFY FAILED (${failures} automated failures, ${manual.length} manual steps unstarted)`,
);
for (const item of manual) {
  console.log(`  manual [${item.step}]: ${item.detail}`);
}
process.exit(failures === 0 ? 0 : 1);
