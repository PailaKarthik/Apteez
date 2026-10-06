/**
 * Region move: transfer the Neon database Ohio (us-east-2) → Singapore (ap-southeast-1).
 *
 * Same architecture, new region — managed Neon stays the ONLY permanent
 * database (see DEPLOYMENT.md §7). The script dumps the old database and
 * restores it into a fresh, empty Singapore project, then runs `migrate deploy`
 * so schema and data are guaranteed in sync. Code changes are NOT needed:
 * only the DATABASE_URL / DIRECT_URL values change afterwards.
 *
 * Prerequisites (once):
 *   1. Neon console → New Project → region ap-southeast-1 (Singapore). Do NOT seed it.
 *   2. Copy its DIRECT (no pooler) and POOLED (-pooler, ?pgbouncer=true) URLs.
 *   3. PostgreSQL 16+ client tools on PATH (pg_dump, pg_restore, psql):
 *      Windows: `winget install PostgreSQL.16` (client tools only are enough).
 *
 * Usage (PowerShell):
 *   $env:OLD_DIRECT_URL='<Ohio direct connection>'
 *   $env:NEW_DIRECT_URL='<Singapore direct connection>'
 *   node scripts/db/region-move.mjs --yes
 *
 * Safety: refuses to run without --yes; refuses when old and new point at
 * the same host; refuses when the target already holds ApteeZ tables
 * (restore must land on an empty project, never on top of live data).
 * The old database is only READ (pg_dump) — this script never writes to it.
 *
 * Exit 0 when the Singapore database is restored, migrated and verified.
 * Afterwards: swap DATABASE_URL/DIRECT_URL in .env to the Singapore URLs,
 * point UPSTASH_REDIS_URL at a Singapore Upstash database, restart the API.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const OLD_DIRECT_URL = process.env.OLD_DIRECT_URL ?? '';
const NEW_DIRECT_URL = process.env.NEW_DIRECT_URL ?? '';

function fail(message) {
  console.error(`region-move: ${message}`);
  process.exit(1);
}

function run(cmd, cmdArgs, { input, env } = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    input,
    env: env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) {
    fail(`cannot execute '${cmd}': ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`'${cmd} ${cmdArgs.join(' ')}' failed:\n${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

function hostOf(url) {
  const match = /@([^/:?]+)/.exec(url);
  return match ? match[1] : '(unparseable)';
}

function psql(url, sql) {
  return run('psql', [url, '-tAc', sql]);
}

// ── Guards ────────────────────────────────────────────────────────────────
if (!args.has('--yes')) {
  fail('refusing to run without --yes. Re-run as: node scripts/db/region-move.mjs --yes');
}
if (!OLD_DIRECT_URL || !NEW_DIRECT_URL) {
  fail('set OLD_DIRECT_URL (Ohio direct) and NEW_DIRECT_URL (Singapore direct) first.');
}
if (hostOf(OLD_DIRECT_URL) === hostOf(NEW_DIRECT_URL)) {
  fail(`old and new point at the same host (${hostOf(OLD_DIRECT_URL)}). Refusing.`);
}
for (const tool of ['pg_dump', 'pg_restore', 'psql']) {
  run(process.platform === 'win32' ? 'where' : 'which', [tool]);
}
console.log(`region-move: ${hostOf(OLD_DIRECT_URL)} → ${hostOf(NEW_DIRECT_URL)}`);

// ── 0. Target must be empty (never restore over live data) ────────────────
const existingTables = psql(
  NEW_DIRECT_URL,
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
);
if (existingTables !== '0') {
  fail(
    `target already holds ${existingTables} tables — restore into a FRESH Singapore project, never over existing data.`,
  );
}
console.log('region-move: target is empty, proceeding.');

// ── 1. Sanity: both endpoints answer ───────────────────────────────────────
const oldVersion = psql(OLD_DIRECT_URL, 'SHOW server_version;');
const newVersion = psql(NEW_DIRECT_URL, 'SHOW server_version;');
console.log(`region-move: source PG ${oldVersion}, target PG ${newVersion}`);

// ── 2. Dump (read-only on the source) ──────────────────────────────────────
const dumpFile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'apteez-region-move-')),
  'apteez.dump',
);
console.log('region-move: dumping source (custom format, this takes a while)…');
run('pg_dump', ['-Fc', '--no-owner', '--no-privileges', OLD_DIRECT_URL, '-f', dumpFile]);
console.log(
  `region-move: dump written (${(fs.statSync(dumpFile).size / 1024 / 1024).toFixed(1)} MB)`,
);

// ── 3. Restore into Singapore ─────────────────────────────────────────────────
console.log('region-move: restoring into Singapore target…');
run('pg_restore', ['--no-owner', '--no-privileges', '-d', NEW_DIRECT_URL, dumpFile]);

// ── 4. Migrate deploy against the new database (idempotent) ────────────────
console.log('region-move: running prisma migrate deploy against Singapore…');
{
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['--filter', '@apteez/database', 'db:deploy'],
    {
      env: { ...process.env, DATABASE_URL: NEW_DIRECT_URL, DIRECT_URL: NEW_DIRECT_URL },
      encoding: 'utf8',
      shell: false,
    },
  );
  const out = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0) {
    fail(`migrate deploy failed:\n${out.trim()}`);
  }
  console.log(out.trim().split('\n').slice(-3).join('\n'));
}

// ── 5. Verify: extensions + row-count parity on the big tables ─────────────
const vector = psql(NEW_DIRECT_URL, "SELECT count(*) FROM pg_extension WHERE extname = 'vector';");
console.log(
  `region-move: pgvector extension present: ${vector === '1' ? 'yes' : 'NO — check RAG migration'}`,
);
for (const table of ['problems', 'users', 'submissions']) {
  const oldCount = psql(OLD_DIRECT_URL, `SELECT count(*) FROM "${table}";`);
  const newCount = psql(NEW_DIRECT_URL, `SELECT count(*) FROM "${table}";`);
  const mark = oldCount === newCount ? 'ok' : 'MISMATCH';
  console.log(`region-move: ${mark} ${table}: source=${oldCount} target=${newCount}`);
  if (oldCount !== newCount) {
    fail(`row-count mismatch on ${table} — do NOT cut over.`);
  }
}

console.log('');
console.log('region-move complete. Cut over:');
console.log(
  '  1. .env: DATABASE_URL=<Singapore pooled, ?pgbouncer=true>, DIRECT_URL=<Singapore direct>',
);
console.log(
  '  2. Upstash console → new database in ap-southeast-1 → UPSTASH_REDIS_URL=<it> (sessions reset: users re-login once)',
);
console.log('  3. Restart API + worker. Expect warm SELECT ~5ms instead of ~1600ms.');
console.log(`  4. Dump kept at: ${dumpFile} (delete after verification)`);
