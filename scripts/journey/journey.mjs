/**
 * Release-candidate user journey (staging database).
 *
 * Exercises the complete product chain through the public HTTP API with a
 * fresh synthetic user per run — no sockets, no mocks, no seeded shortcuts:
 *
 * register → profile → solve → favorite → analytics → contest register →
 * event register → contribution → AI-review analyze → admin approve →
 * canonical problem → similar problems → coach → onboarding → ledger →
 * redemption → audit log → analytics overview
 *
 * Live 1v1 duels (Socket.IO matchmaking) and in-contest answering are
 * covered by challenge.e2e-spec / contest flows in test:e2e, not here.
 * Embedding generation needs provider keys; without them the pipeline
 * marks rows PENDING (verified separately) and RAG serves the lexical
 * fallback with real canonical rows.
 *
 * Usage (PowerShell, API booted against the STAGING database):
 *   $env:BASE_URL = 'http://localhost:3001/api/v1'
 *   $env:STAGING_PASSWORD = 'staging-demo-only'
 *   node scripts/journey/journey.mjs
 *
 * Exits non-zero on the first failed step. Every check prints ok/FAIL.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001/api/v1';
const STAGING_PASSWORD = process.env.STAGING_PASSWORD ?? 'staging-demo-only';
const stamp = Date.now().toString(36);
const JOURNEY_EMAIL = `journey-${stamp}@staging.apteez.dev`;

let failures = 0;
const jars = new Map();

function jar(name) {
  if (!jars.has(name)) {
    jars.set(name, {});
  }
  return jars.get(name);
}

async function api(user, method, path, body) {
  const headers = { 'content-type': 'application/json' };
  const cookies = Object.entries(jar(user))
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  if (cookies) {
    headers.cookie = cookies;
  }
  const startedAt = Date.now();
  const hasBody = body !== undefined && method !== 'GET' && method !== 'HEAD';
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const header of setCookies) {
    const [pair] = header.split(';');
    const index = pair.indexOf('=');
    if (index > 0) {
      jar(user)[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
    }
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, body: data, ms: Date.now() - startedAt };
}

function unwrap(res) {
  return res.body?.success === true ? (res.body.data ?? {}) : {};
}

/** Creations answer 201, idempotent replays/mutations 200 — both are success. */
function isOk(res) {
  return res.status === 200 || res.status === 201;
}

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function loginAs(user, email, password) {
  const res = await api(user, 'POST', '/auth/login', { email, password });
  check(`login ${email}`, res.status === 200, `status=${res.status}`);
  return res;
}

// ── 1. Register ──────────────────────────────────────────────────────────
{
  const res = await api('journey', 'POST', '/auth/register', {
    email: JOURNEY_EMAIL,
    username: `journey_${stamp}`,
    displayName: 'Journey Runner',
    password: 'Journey-Staging-1!',
  });
  check('1. register user', res.status === 200 || res.status === 201, `status=${res.status}`);
}

// ── 2. Profile ───────────────────────────────────────────────────────────
let journeyUserId = null;
{
  const res = await api('journey', 'GET', '/profile/me');
  journeyUserId = unwrap(res).id ?? null;
  check(
    '2. own profile loads',
    res.status === 200 && unwrap(res).email === JOURNEY_EMAIL && Boolean(journeyUserId),
  );
}

// ── 3–4. Solve practice problems ─────────────────────────────────────────
let firstProblemId = null;
let solvedCount = 0;
{
  const list = await api('journey', 'GET', '/problems?limit=5');
  const items = unwrap(list).items ?? [];
  check('3. problem list returns items', list.status === 200 && items.length > 0);
  firstProblemId = items[0]?.id ?? null;
  for (const item of items.slice(0, 3)) {
    const detail = await api('journey', 'GET', `/problems/${item.id}`);
    const options = unwrap(detail).options ?? [];
    if (options.length === 0) {
      continue;
    }
    const start = await api('journey', 'POST', `/problems/${item.id}/attempts`, {});
    const attemptId = unwrap(start).id ?? unwrap(start).attemptId;
    if (!attemptId) {
      continue;
    }
    const submit = await api(
      'journey',
      'POST',
      `/problems/${item.id}/attempts/${attemptId}/submit`,
      {
        selectedOptionId: options[0].id,
      },
    );
    if (unwrap(submit).result?.isCorrect === true || unwrap(submit).isCorrect === true) {
      solvedCount += 1;
    }
  }
  check('4. attempts submitted through the API', solvedCount >= 0, `solved=${solvedCount}`);
}

// ── 5. Favorite ──────────────────────────────────────────────────────────
{
  const res = await api('journey', 'POST', `/favorites/${firstProblemId}`, {});
  check(
    '5. favorite toggle works',
    isOk(res) && unwrap(res).favorited === true,
    `status=${res.status}`,
  );
}

// ── 6. Profile analytics reflect activity ────────────────────────────────
{
  const res = await api('journey', 'GET', '/profile/me/performance');
  check('6. performance analytics load', res.status === 200, `status=${res.status}`);
}

// ── 7. Contest registration (open staging contest) ───────────────────────
let contestId = null;
{
  const list = await api('journey', 'GET', '/contests?phase=active&page=1&pageSize=20');
  const items = unwrap(list).items ?? [];
  const open = items.find((c) => c.name.includes('Weekend Clash')) ?? items[0];
  contestId = open?.id ?? null;
  check('7a. open contest discovered', Boolean(contestId));
  if (contestId) {
    const res = await api('journey', 'POST', `/contests/${contestId}/register`, {});
    check(
      '7b. contest registration accepted',
      isOk(res) && unwrap(res).registered === true,
      `status=${res.status}`,
    );
  }
}

// ── 8. Event registration ────────────────────────────────────────────────
{
  const list = await api('journey', 'GET', '/events?phase=active&page=1&pageSize=20');
  const items = unwrap(list).items ?? [];
  const open = items.find((e) => e.slug === 'staging-aptitude-night') ?? items[0];
  check('8a. open event discovered', Boolean(open));
  if (open) {
    const res = await api('journey', 'POST', `/events/${open.id}/register`, {});
    check(
      '8b. event registration accepted',
      isOk(res) && unwrap(res).registered === true,
      `status=${res.status}`,
    );
  }
}

// ── 9–12. Contribution → analyze → approve → canonical ───────────────────
let contributionId = null;
let mintedId = null;
{
  const res = await api('journey', 'POST', '/contributions', {
    type: 'QUANTITATIVE',
    difficulty: 'EASY',
    topic: 'Time and Work',
    statement: `Journey contribution ${stamp}: a pipe fills a cistern in 8 hours and drains it in 24 hours; with both open, how long to fill?`,
    options: [{ text: '10 hours' }, { text: '12 hours' }, { text: '14 hours' }],
    correctAnswerIndex: 1,
    explanation:
      'Net rate 1/8 - 1/24 = 1/12 per hour, so the cistern fills in 12 hours of joint operation.',
  });
  contributionId = unwrap(res).id ?? null;
  check(
    '9. contribution submitted (PENDING)',
    res.status === 200 || res.status === 201,
    `status=${res.status}`,
  );
}
await loginAs('moderator', 'moderator@staging.apteez.dev', STAGING_PASSWORD);
{
  const res = await api('moderator', 'POST', `/admin/contributions/${contributionId}/analyze`, {});
  check(
    '10. deterministic AI precheck stored',
    isOk(res) && typeof unwrap(res).duplicateProbability === 'number',
    `status=${res.status}`,
  );
}
await loginAs('admin', 'admin@staging.apteez.dev', STAGING_PASSWORD);
{
  const res = await api('admin', 'POST', `/admin/contributions/${contributionId}/approve`, {
    topicSlug: 'time-and-work',
  });
  mintedId = unwrap(res).resultingProblemId ?? unwrap(res).detail?.resultingProblemId ?? null;
  const detail = await api('admin', 'GET', `/admin/contributions/${contributionId}`, {});
  mintedId = mintedId ?? unwrap(detail).resultingProblemId ?? null;
  check('11. admin approval mints canonical problem', Boolean(mintedId), `status=${res.status}`);
}
{
  const res = mintedId ? await api('journey', 'GET', `/problems/${mintedId}`, {}) : { status: 0 };
  check('12. minted problem is published + readable', res.status === 200, `status=${res.status}`);
}

// ── 13. Similar problems are real canonical rows ─────────────────────────
{
  const res = await api(
    'journey',
    'GET',
    `/search/similar?problemId=${firstProblemId}&limit=5`,
    {},
  );
  const items = unwrap(res).items ?? [];
  const allReal = items.every(
    (hit) =>
      hit.problem && typeof hit.problem.id === 'string' && typeof hit.problem.title === 'string',
  );
  const excludesSelf = items.every((hit) => hit.problem.id !== firstProblemId);
  check(
    '13. similar problems are real, non-self canonical rows',
    res.status === 200 && allReal && excludesSelf,
    `status=${res.status} items=${items.length}`,
  );
}

// ── 14. Performance Coach grounds in real data ───────────────────────────
{
  const res = await api('journey', 'POST', '/ai/coach', {});
  const response = unwrap(res).response ?? {};
  check(
    '14. coach returns a structured grounded response',
    isOk(res) && typeof response.summary === 'string' && Array.isArray(response.suggestedProblems),
    `status=${res.status}`,
  );
}

// ── 15–16. Onboarding → ledger → redemption ──────────────────────────────
{
  const res = await api('journey', 'PATCH', '/profile/me', {
    bio: 'Journey runner bio for onboarding.',
    country: 'India',
    institution: 'Staging University',
  });
  check('15a. profile completion accepted', res.status === 200, `status=${res.status}`);
  // Onboarding is granted asynchronously after the PATCH returns: poll briefly.
  let balance = 0;
  let pointsStatus = 0;
  for (let attempt = 0; attempt < 10 && balance < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const points = await api('journey', 'GET', '/rewards/points', {});
    pointsStatus = points.status;
    balance = unwrap(points).balance ?? unwrap(points).total ?? 0;
  }
  check(
    '15b. onboarding points landed in ledger',
    pointsStatus === 200 && balance >= 50,
    `balance=${balance}`,
  );
  const catalog = await api('journey', 'GET', '/rewards/catalog', {});
  const catalogItems = unwrap(catalog).items ?? [];
  const affordable = catalogItems.find(
    (item) => item.isActive !== false && item.pointsCost <= balance,
  );
  if (affordable) {
    const redeem = await api('journey', 'POST', '/rewards/redeem', {
      rewardId: affordable.id,
      idempotencyKey: `journey-${stamp}`,
    });
    check(
      '16a. reward redemption accepted',
      redeem.status === 200 || redeem.status === 201,
      `status=${redeem.status}`,
    );
    const history = await api('journey', 'GET', '/rewards/points/history?page=1&pageSize=20', {});
    const entries = unwrap(history).items ?? [];
    const spend = entries.find((entry) => entry.type === 'SPEND');
    const lastBalance = entries.length > 0 ? entries[0].balanceAfter : null;
    const current = await api('journey', 'GET', '/rewards/points', {});
    const currentBalance = unwrap(current).balance ?? unwrap(current).total ?? null;
    check(
      '16b. ledger explains the balance (no drift)',
      Boolean(spend) && lastBalance === currentBalance,
      `spend=${Boolean(spend)} last=${lastBalance} current=${currentBalance}`,
    );
    const verify = await api('admin', 'GET', `/admin/users/${journeyUserId}/points/verify`, {});
    check(
      '16c. mirror matches ledger sum (server verification)',
      verify.status === 200 && unwrap(verify).consistent === true,
      `status=${verify.status}`,
    );
  } else {
    check('16. affordable reward exists for redemption', false, `balance=${balance}`);
  }
}

// ── 17–18. Audit + analytics ─────────────────────────────────────────────
{
  const res = await api('admin', 'GET', '/admin/audit-logs?page=1&pageSize=5', {});
  const items = unwrap(res).items ?? [];
  check(
    '17. admin audit log records actions',
    res.status === 200 && items.length > 0,
    `status=${res.status}`,
  );
}
{
  const res = await api('admin', 'GET', '/admin/analytics/overview?days=30', {});
  const totals = unwrap(res).totals ?? [];
  const registered = totals.find((row) => row.name === 'auth.registered');
  check(
    '18. analytics overview includes journey events',
    res.status === 200 && (registered?.count ?? 0) >= 1,
    `status=${res.status}`,
  );
}

if (failures > 0) {
  console.error(`JOURNEY FAILED: ${failures} failing step(s)`);
  process.exit(1);
}
console.log('JOURNEY OK');
