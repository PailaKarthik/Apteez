/**
 * Minimal load probe for high-risk ApteeZ read paths.
 *
 * Usage (PowerShell):
 *   $env:BASE_URL = 'http://localhost:3001/api/v1'; node scripts/load/probe.mjs
 *
 * Env knobs: BASE_URL (default below), CONCURRENCY (default 10),
 * ITERATIONS per endpoint (default 50). Reports measured p50/p95/max per
 * endpoint from real runs and exits 1 on any non-2xx response. Anonymous
 * endpoints only — authenticated flows stay in the e2e suite.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001/api/v1';
// Defaults stay under the stock per-IP throttle budget (100 req / 60s) so a
// clean run measures latency, not 429s. Raise ITERATIONS deliberately to
// observe throttling kick in — 429s are the limiter working, not failures
// of the endpoints under test.
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 4));
const ITERATIONS = Math.max(1, Number(process.env.ITERATIONS ?? 10));

const ENDPOINTS = [
  '/health',
  '/health/live',
  '/health/ready',
  '/problems?limit=20',
  '/problems?limit=20&sort=rating_desc',
  '/search?q=algebra&type=all',
  '/search/suggestions?q=time',
  '/search/trending',
  '/categories',
  '/ratings/leaderboard?domain=quantitative',
];

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function probe(path) {
  const latencies = [];
  let failures = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < ITERATIONS) {
      const i = cursor;
      cursor += 1;
      void i;
      const startedAt = Date.now();
      try {
        const response = await fetch(`${BASE_URL}${path}`);
        // Drain the body so timings include transfer, not just headers.
        await response.arrayBuffer();
        if (!response.ok) {
          failures += 1;
        }
      } catch {
        failures += 1;
      }
      latencies.push(Date.now() - startedAt);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, ITERATIONS) }, () => worker());
  await Promise.all(workers);
  latencies.sort((a, b) => a - b);
  return {
    path,
    requests: latencies.length,
    failures,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    max: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
  };
}

const results = [];
for (const path of ENDPOINTS) {
  // eslint-disable-next-line no-await-in-loop -- sequential endpoints keep the report readable
  const result = await probe(path);
  results.push(result);
  console.log(
    `${result.path} requests=${result.requests} failures=${result.failures} ` +
      `p50=${result.p50}ms p95=${result.p95}ms max=${result.max}ms`,
  );
}

const totalFailures = results.reduce((sum, result) => sum + result.failures, 0);
if (totalFailures > 0) {
  console.error(`LOAD PROBE FAILED: ${totalFailures} failing requests`);
  process.exit(1);
}
console.log('LOAD PROBE OK');
