import { z } from 'zod';

/**
 * Environment validation (fail fast). Every variable the foundation reads is
 * declared here; provider-specific and future variables (Google OAuth,
 * server sessions) are optional and clearly marked in `.env.example`.
 * The application refuses to boot when this schema rejects the environment.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    APP_VERSION: z.string().default('0.1.0'),
    // Release identity for operators (injected at build/deploy; never secrets).
    GIT_SHA: z.string().default('unknown'),
    RELEASE_TAG: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'verbose']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    // Redis (Upstash). ONE effective URL for every consumer — app client,
    // BullMQ, throttler storage, locks, caches — resolved by
    // resolveRedisUrl() below. UPSTASH_REDIS_URL is the Upstash TCP/TLS
    // endpoint (`rediss://default:<password>@<host>:6379` from the Upstash
    // console's Node/ioredis tab); REDIS_URL is the local/test override
    // (`redis://localhost:6379`). ioredis negotiates TLS from the scheme,
    // so Upstash needs no extra client options. There is intentionally no
    // UPSTASH_REDIS_TOKEN here: the token is for the REST API, which
    // nothing in this codebase uses (BullMQ, Lua scripts and blocking
    // commands all require the Redis protocol).
    UPSTASH_REDIS_URL: z.string().optional(),
    REDIS_URL: z.string().optional(),

    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),

    THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

    COOKIE_SECRET: z.string().optional(),

    SESSION_COOKIE_NAME: z.string().min(1).max(64).default('apteez_session'),
    // Absolute session lifetime in seconds (sliding refresh keeps active
    // sessions alive; 14 days by default).
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(1209600),

    // Auth endpoint rate limits (Redis-backed, per IP).
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
    AUTH_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    // Per-account login attempt budget (brute-force protection).
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
    LOGIN_ATTEMPT_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),

    // Practice answer-submission rate limit (Redis-backed, per IP). Generous
    // enough that normal drilling is never interrupted.
    PRACTICE_RATE_LIMIT: z.coerce.number().int().positive().default(60),
    PRACTICE_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

    // Challenge matchmaking rate limit (Redis-backed, per IP).
    CHALLENGE_RATE_LIMIT: z.coerce.number().int().positive().default(30),
    CHALLENGE_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

    // Timed challenge matches: how long one run lasts, in whole minutes.
    // Endless questions until the clock runs out; highest score wins.
    CHALLENGE_DURATION_MINUTES: z.coerce.number().int().min(1).max(10).default(2),
    // Solo fallback: seconds of searching before a lone player gets a solo
    // run against the house bot (unrated) instead of waiting forever.
    CHALLENGE_SOLO_WAIT_SECONDS: z.coerce.number().int().min(5).max(120).default(15),

    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./.data/storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),

    APP_URL: z.string().default('http://localhost:3000'),
    // Public base URL of this API; used to mint storage URLs for the local
    // provider so the client never learns a filesystem path.
    API_URL: z.string().url().default('http://localhost:3001'),

    // Google OAuth. Optional: the app boots and serves everything else
    // when these are unset; OAuth routes fail gracefully instead.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.string().url().optional(),

    // Transactional email (Resend HTTP API, free 100/day). Optional: auth
    // never depends on it — OTP sends are skipped with a warning when the
    // key is unset, and request-verify fails gracefully instead.
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('ApteeZ <onboarding@resend.dev>'),

    // AI providers. All optional: every AI feature degrades gracefully
    // (deterministic fallbacks) when unconfigured. Keys never reach clients.
    // Chosen stack: Groq for chat (OpenAI-compatible), Google Gemini for
    // embeddings (OpenAI-compatible endpoint). Pin explicit values in .env;
    // defaults below only keep local boot working.
    LLM_PROVIDER: z.string().default('openai-compatible'),
    LLM_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().default('llama-3.3-70b-versatile'),
    LLM_BASE_URL: z.string().url().optional(),
    EMBEDDING_PROVIDER: z.string().default('openai-compatible'),
    EMBEDDING_API_KEY: z.string().optional(),
    EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(3072),
    EMBEDDING_BASE_URL: z.string().url().optional(),
    // Per-user daily AI request budget (Redis counter, fail-open).
    AI_DAILY_LIMIT: z.coerce.number().int().positive().default(50),

    // Feature flags (Prompt 24). Base switches accept true/false/1/0
    // (unset = default on); optional _ROLLOUT vars enable a deterministic
    // percentage rollout (0-100) bucketed by user id. See
    // config/feature-flags.ts. No flag exists for Weekly Targets — the
    // surface is not built, so there is nothing to gate.
    FEATURE_AI_PERFORMANCE_COACH: z.string().optional(),
    FEATURE_AI_PERFORMANCE_COACH_ROLLOUT: z.coerce.number().int().min(0).max(100).optional(),
    FEATURE_AI_SIMILAR_PROBLEMS: z.string().optional(),
    FEATURE_AI_SIMILAR_PROBLEMS_ROLLOUT: z.coerce.number().int().min(0).max(100).optional(),
    FEATURE_AI_CONTRIBUTION_REVIEW: z.string().optional(),
    FEATURE_AI_CONTRIBUTION_REVIEW_ROLLOUT: z.coerce.number().int().min(0).max(100).optional(),
    FEATURE_REWARDS_REDEMPTION: z.string().optional(),
    FEATURE_REWARDS_REDEMPTION_ROLLOUT: z.coerce.number().int().min(0).max(100).optional(),
    FEATURE_PUBLIC_EVENTS: z.string().optional(),
    FEATURE_PUBLIC_EVENTS_ROLLOUT: z.coerce.number().int().min(0).max(100).optional(),
    FEATURE_COMMUNITY_CONTRIBUTIONS: z.string().optional(),
    FEATURE_COMMUNITY_CONTRIBUTIONS_ROLLOUT: z.coerce.number().int().min(0).max(100).optional(),

    // Sentry error tracking. Optional: when SENTRY_DSN is unset, Sentry is
    // never initialized and error handling behaves exactly as before.
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  })
  .superRefine((value, ctx) => {
    const redisUrl = value.UPSTASH_REDIS_URL ?? value.REDIS_URL;
    if (!redisUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['UPSTASH_REDIS_URL'],
        message: 'Set UPSTASH_REDIS_URL (Upstash TCP endpoint) or REDIS_URL (local/test)',
      });
    } else if (!/^rediss?:\/\//i.test(redisUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [value.UPSTASH_REDIS_URL ? 'UPSTASH_REDIS_URL' : 'REDIS_URL'],
        message: 'Redis URL must start with redis:// or rediss:// (TLS)',
      });
    }
    if (value.NODE_ENV === 'production') {
      if (!value.COOKIE_SECRET || value.COOKIE_SECRET === 'change-me-in-production') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECRET'],
          message: 'COOKIE_SECRET must be set to a unique secret in production',
        });
      }
    }
    if (value.STORAGE_PROVIDER === 's3') {
      const required = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
      for (const key of required) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_PROVIDER=s3`,
          });
        }
      }
      if (!value.S3_ENDPOINT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_ENDPOINT'],
          message: 'S3_ENDPOINT is required when STORAGE_PROVIDER=s3',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * The single Redis URL every consumer must use — RedisService, BullMQ
 * (queue.module), throttler storage. Upstash wins when set so production
 * can never silently fall back to a local instance; callers must not read
 * either variable directly.
 */
export function resolveRedisUrl(
  upstashUrl: string | undefined,
  fallbackUrl: string | undefined,
): string {
  const url = clean(upstashUrl) ?? clean(fallbackUrl);
  if (!url) {
    throw new Error(
      'No Redis URL configured: set UPSTASH_REDIS_URL (Upstash TCP endpoint) or REDIS_URL (local/test).',
    );
  }
  return url;
}

/** ConfigModule `validate` hook — throws a readable error on boot. */
export function validateEnv(config: Record<string, unknown>): Env {
  // Normalize first: an empty `KEY=` line behaves exactly like an unset key
  // (falls back to defaults / sibling fallbacks) instead of failing
  // url()/enum checks or shadowing real values with ''.
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    normalized[key] = typeof value === 'string' && value.trim().length === 0 ? undefined : value;
  }
  const parsed = envSchema.safeParse(normalized);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

/** Empty/whitespace strings count as unset (dotenv `KEY=` lines). */
function clean(value: string | undefined): string | undefined {
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
}

/** Split the CORS allowlist (comma-separated) into origins. */
export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
