/**
 * E2E safety guard. Runs before any e2e spec (see test/jest-e2e.json).
 * Refuses to boot against a production-looking database so a misconfigured
 * DATABASE_URL can never wipe real data. Use a dedicated test database —
 * either local or a Neon test branch:
 *   DATABASE_URL=postgresql://USER:PASSWORD@ep-xyz.neon.tech/apteez_test?sslmode=require
 *
 * Redis comes from UPSTASH_REDIS_URL/REDIS_URL like every other consumer;
 * point e2e at a SEPARATE Upstash database (the suites share throttle
 * budgets and session state). No suite wipes Redis (no FLUSHALL anywhere),
 * but shared keys with dev would still flake results.
 *
 * Loads the repository-root `.env` for missing variables only (explicit
 * environment always wins), so `pnpm test:e2e` works out of the box locally
 * while CI can inject its own values.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

for (const candidate of [
  resolve(dirname(__dirname), '.env'),
  resolve(dirname(__dirname), '..', '..', '.env'),
]) {
  if (!existsSync(candidate)) {
    continue;
  }
  for (const line of readFileSync(candidate, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Test-environment tuning (explicit environment always wins). Nine suites
 * boot nine app instances in parallel workers against one Redis: without a
 * dedicated budget they throttle each other (429s) and the run measures the
 * limiter instead of the product. Rate limiting itself is covered by
 * dedicated unit coverage + the load probe — not by these journeys.
 */
for (const [key, value] of [
  ['THROTTLE_LIMIT', '10000'],
  ['AUTH_RATE_LIMIT', '1000'],
  ['PRACTICE_RATE_LIMIT', '1000'],
  ['CHALLENGE_RATE_LIMIT', '1000'],
] as const) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const databaseUrl = process.env.DATABASE_URL ?? '';
const nodeEnv = process.env.NODE_ENV ?? '';

// A test database is explicit: name contains `_test`, or localhost.
// Anything else — including Neon dev/staging/production branches — is
// refused, as is any run with NODE_ENV=production.
const isTestDb = /_test\b|_test\?/i.test(databaseUrl);
const isLocalhost = /localhost|127\.0\.0\.1/i.test(databaseUrl);

if (!databaseUrl) {
  throw new Error('E2E guard: DATABASE_URL is not set. Refusing to run.');
}

if (nodeEnv === 'production' || !(isTestDb || isLocalhost)) {
  throw new Error(
    'E2E guard: refusing to run against a non-test database. ' +
      `NODE_ENV=${nodeEnv || '(unset)'}. ` +
      'Point DATABASE_URL at an isolated test database (.*_test, e.g. a Neon test branch).',
  );
}
