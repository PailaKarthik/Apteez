import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../common/errors/app-error';
import { AppLogger } from '../common/logger/app-logger';
import type { Env } from './env';

/**
 * Minimal centralized feature flags for risky/new functionality.
 *
 * Design constraints (deliberate):
 * - Plain environment variables, read once at boot and cached. Changing a
 *   flag is a redeploy, not a runtime mutation — there is no flag service to
 *   operate, secure, or debug at 3am.
 * - Server-side enforcement only. Frontend hiding is UX; every gate below is
 *   checked in the API before the risky code path runs.
 * - Optional percentage rollout for gradual enablement. Bucketing is a
 *   deterministic hash of (flag, user id), so a user sees a stable value
 *   across requests and instances with no stored state.
 * - Anonymous callers cannot be bucketed: when a rollout percentage is
 *   configured and no user id is available, the flag reads disabled
 *   (fail-closed for unauthenticated traffic).
 *
 * There is intentionally NO flag for Weekly Targets: the surface does not
 * exist yet, so there is nothing to gate. It stays "Coming Soon" in the UI.
 */

export const FEATURE_FLAGS = [
  {
    key: 'AI_PERFORMANCE_COACH',
    env: 'FEATURE_AI_PERFORMANCE_COACH',
    rolloutEnv: 'FEATURE_AI_PERFORMANCE_COACH_ROLLOUT',
    defaultEnabled: true,
    label: 'Performance Coach (LLM path)',
    offBehavior: 'Deterministic performance summary; profile works normally.',
  },
  {
    key: 'AI_SIMILAR_PROBLEMS',
    env: 'FEATURE_AI_SIMILAR_PROBLEMS',
    rolloutEnv: 'FEATURE_AI_SIMILAR_PROBLEMS_ROLLOUT',
    defaultEnabled: true,
    label: 'Similar Problems (vector retrieval)',
    offBehavior: 'Deterministic lexical related-problem fallback; never generated.',
  },
  {
    key: 'AI_CONTRIBUTION_REVIEW',
    env: 'FEATURE_AI_CONTRIBUTION_REVIEW',
    rolloutEnv: 'FEATURE_AI_CONTRIBUTION_REVIEW_ROLLOUT',
    defaultEnabled: true,
    label: 'Contribution AI review scheduling',
    offBehavior: 'Contribution stays PENDING for manual review.',
  },
  {
    key: 'REWARDS_REDEMPTION',
    env: 'FEATURE_REWARDS_REDEMPTION',
    rolloutEnv: 'FEATURE_REWARDS_REDEMPTION_ROLLOUT',
    defaultEnabled: true,
    label: 'Rewards redemption',
    offBehavior: 'Catalog/ledger reads work; redeem returns 503.',
  },
  {
    key: 'PUBLIC_EVENTS',
    env: 'FEATURE_PUBLIC_EVENTS',
    rolloutEnv: 'FEATURE_PUBLIC_EVENTS_ROLLOUT',
    defaultEnabled: true,
    label: 'Anonymous event discovery',
    offBehavior: 'Anonymous event listing returns 503; signed-in users unaffected.',
  },
  {
    key: 'COMMUNITY_CONTRIBUTIONS',
    env: 'FEATURE_COMMUNITY_CONTRIBUTIONS',
    rolloutEnv: 'FEATURE_COMMUNITY_CONTRIBUTIONS_ROLLOUT',
    defaultEnabled: true,
    label: 'Community contribution submission',
    offBehavior: 'Submit returns 503; reading own contributions still works.',
  },
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]['key'];

export class FeatureDisabledError extends AppError {
  constructor(featureLabel: string) {
    super('SERVICE_UNAVAILABLE', `${featureLabel} is temporarily disabled.`, 503);
    this.name = 'FeatureDisabledError';
  }
}

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

/** Parse a boolean env var; unknown values fall back to the default. */
export function parseFlagValue(
  raw: string | undefined,
  defaultEnabled: boolean,
): {
  enabled: boolean;
  recognized: boolean;
} {
  if (raw === undefined) {
    return { enabled: defaultEnabled, recognized: true };
  }
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return { enabled: true, recognized: true };
  }
  if (FALSE_VALUES.has(normalized)) {
    return { enabled: false, recognized: true };
  }
  return { enabled: defaultEnabled, recognized: false };
}

/** FNV-1a 32-bit hash — stable bucketing with no dependencies. */
export function hashBucket(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

/** Percentage check: `rollout` is 0–100 inclusive. */
export function inRollout(flagKey: string, userId: string, rollout: number): boolean {
  if (rollout <= 0) {
    return false;
  }
  if (rollout >= 100) {
    return true;
  }
  return hashBucket(`${flagKey}:${userId}`) < rollout;
}

export interface FlagState {
  key: FeatureFlagKey;
  label: string;
  enabled: boolean;
  rolloutPercent: number | null;
  offBehavior: string;
}

@Injectable()
export class FeatureFlagsService {
  private readonly states = new Map<FeatureFlagKey, { enabled: boolean; rollout: number | null }>();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {
    for (const flag of FEATURE_FLAGS) {
      const raw = this.config.get(flag.env, { infer: true }) as string | undefined;
      const parsed = parseFlagValue(raw, flag.defaultEnabled);
      if (!parsed.recognized) {
        this.logger.warn(
          `feature-flags.unrecognized-value flag=${flag.key} value=${raw} using-default=${flag.defaultEnabled}`,
          'Config',
        );
      }
      const rolloutRaw = this.config.get(flag.rolloutEnv, { infer: true }) as number | undefined;
      const rollout =
        rolloutRaw === undefined || Number.isNaN(rolloutRaw)
          ? null
          : Math.min(100, Math.max(0, Math.trunc(rolloutRaw)));
      this.states.set(flag.key, { enabled: parsed.enabled, rollout });
    }
  }

  /**
   * Server-side gate. When a rollout percentage is configured, authenticated
   * users are bucketed deterministically; anonymous callers read disabled.
   */
  isEnabled(key: FeatureFlagKey, opts?: { userId?: string }): boolean {
    const state = this.states.get(key);
    if (!state || !state.enabled) {
      return false;
    }
    if (state.rollout === null) {
      return true;
    }
    if (!opts?.userId) {
      return false;
    }
    return inRollout(key, opts.userId, state.rollout);
  }

  /** Throw a 503 FeatureDisabledError when the flag is off for this caller. */
  requireEnabled(key: FeatureFlagKey, opts?: { userId?: string }): void {
    if (!this.isEnabled(key, opts)) {
      const flag = FEATURE_FLAGS.find((entry) => entry.key === key);
      throw new FeatureDisabledError(flag?.label ?? key);
    }
  }

  /** Per-caller snapshot for the public UX endpoint (booleans only). */
  snapshot(userId?: string): Record<FeatureFlagKey, boolean> {
    const out = {} as Record<FeatureFlagKey, boolean>;
    for (const flag of FEATURE_FLAGS) {
      out[flag.key] = this.isEnabled(flag.key, userId ? { userId } : undefined);
    }
    return out;
  }

  /** Operator view: effective configuration, read-only (changes are deploys). */
  describe(): FlagState[] {
    return FEATURE_FLAGS.map((flag) => {
      const state = this.states.get(flag.key);
      return {
        key: flag.key,
        label: flag.label,
        enabled: state?.enabled ?? flag.defaultEnabled,
        rolloutPercent: state?.rollout ?? null,
        offBehavior: flag.offBehavior,
      };
    });
  }
}
