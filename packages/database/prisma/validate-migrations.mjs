/**
 * Migration-vs-schema drift check (cross-platform `db:validate`).
 *
 * Compares ./prisma/migrations against ./prisma/schema.prisma using a
 * disposable shadow database. Fails the build on any drift EXCEPT the
 * documented ORM-opaque artifacts below.
 *
 * KNOWN INTENTIONAL DRIFT (allowlisted): PostgreSQL artifacts the Prisma
 * schema cannot express but the application depends on —
 * - `problem_embeddings.embedding` (pgvector `vector(3072)` for
 *   gemini-embedding-001) + its HNSW
 *   cosine index (declared as `Unsupported` in schema.prisma; the column
 *   itself is in sync, only the custom index drifts),
 * - `problems.searchVector` (GENERATED tsvector) + its GIN index,
 * - trigram GIN indexes for ILIKE search (problems title/statement,
 *   discussion title).
 * These are created by idempotent raw SQL in their feature migrations and
 * must never be dropped — the baseline migration
 * (20260920000000_prompt20_schema_baseline) deliberately excludes them.
 * Anything else in the diff is a real schema/migration mismatch and fails.
 *
 * Requires SHADOW_DATABASE_URL pointing at an EMPTY PostgreSQL database
 * (it must not be the dev/test/prod database: Prisma applies migrations
 * to the shadow DB during comparison).
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const shadow = process.env.SHADOW_DATABASE_URL;
if (!shadow) {
  console.error('db:validate requires SHADOW_DATABASE_URL (an empty PostgreSQL database).');
  process.exit(1);
}

// Package-local Prisma binary (works regardless of the caller's cwd/PATH).
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const prismaBin = resolve(
  pkgRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);
const cwd = pkgRoot;
const baseArgs = [
  'migrate',
  'diff',
  '--from-migrations',
  './prisma/migrations',
  '--to-schema-datamodel',
  './prisma/schema.prisma',
  '--shadow-database-url',
  shadow,
];

const check = spawnSync(prismaBin, [...baseArgs, '--exit-code'], {
  cwd,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (check.status === 0) {
  console.log('db:validate: migrations and schema.prisma are in sync.');
  process.exit(0);
}
if (check.status !== 2) {
  process.exit(check.status ?? 1);
}

// Drift detected — inspect whether it is ONLY the known ORM-opaque artifacts.
const script = spawnSync(prismaBin, [...baseArgs, '--script'], {
  cwd,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (script.status !== 0) {
  console.error((script.stdout ?? '') + (script.stderr ?? ''));
  process.exit(1);
}

const KNOWN_PATTERNS = [
  /^DROP INDEX "(problem_embeddings_embedding_idx|problems_search_vector_idx|problems_title_trgm_idx|problems_statement_trgm_idx|discussion_posts_title_trgm_idx)";?$/,
  /^ALTER TABLE "problems" ALTER COLUMN "searchVector" DROP DEFAULT;?$/,
];

const statements = (script.stdout ?? '')
  .replace(/^--.*$/gm, '')
  .split(';')
  .map((part) => part.trim().replace(/\s+/g, ' '))
  .map((part) => (part.length > 0 ? `${part};` : ''))
  .filter((part) => part.length > 0 && part !== ';');

const unexpected = statements.filter(
  (statement) => !KNOWN_PATTERNS.some((pattern) => pattern.test(statement)),
);

if (unexpected.length === 0 && statements.length > 0) {
  console.log(
    'db:validate: only known ORM-opaque artifacts drift (search/vector indexes, generated searchVector default) — acknowledged, see validate-migrations.mjs header.',
  );
  process.exit(0);
}

console.error('db:validate: schema/migration drift detected:');
for (const statement of unexpected.length > 0 ? unexpected : statements) {
  console.error(`  ${statement}`);
}
process.exit(2);
