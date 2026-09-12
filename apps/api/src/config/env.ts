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
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'verbose']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

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
  })
  .superRefine((value, ctx) => {
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
    }
  });

export type Env = z.infer<typeof envSchema>;

/** ConfigModule `validate` hook — throws a readable error on boot. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

/** Split the CORS allowlist (comma-separated) into origins. */
export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
