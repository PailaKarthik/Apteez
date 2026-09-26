import { FeatureFlagsService, hashBucket, inRollout, parseFlagValue } from './feature-flags';

describe('parseFlagValue', () => {
  it('defaults when unset', () => {
    expect(parseFlagValue(undefined, true)).toEqual({ enabled: true, recognized: true });
    expect(parseFlagValue(undefined, false)).toEqual({ enabled: false, recognized: true });
  });

  it('parses common boolean spellings', () => {
    for (const raw of ['true', '1', 'yes', 'on', ' TRUE ']) {
      expect(parseFlagValue(raw, false).enabled).toBe(true);
    }
    for (const raw of ['false', '0', 'no', 'off', ' FALSE ']) {
      expect(parseFlagValue(raw, true).enabled).toBe(false);
    }
  });

  it('falls back to default on unrecognized values', () => {
    expect(parseFlagValue('maybe', true)).toEqual({ enabled: true, recognized: false });
  });
});

describe('rollout bucketing', () => {
  it('is stable per user and bounded', () => {
    const first = hashBucket('AI_PERFORMANCE_COACH:user-1');
    expect(hashBucket('AI_PERFORMANCE_COACH:user-1')).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(100);
  });

  it('honors 0/100 boundaries', () => {
    expect(inRollout('K', 'user-1', 0)).toBe(false);
    expect(inRollout('K', 'user-1', 100)).toBe(true);
  });

  it('splits a population at roughly the configured rate', () => {
    let inside = 0;
    const total = 2000;
    for (let index = 0; index < total; index += 1) {
      if (inRollout('K', `user-${index}`, 25)) {
        inside += 1;
      }
    }
    const rate = (inside / total) * 100;
    expect(rate).toBeGreaterThan(15);
    expect(rate).toBeLessThan(35);
  });
});

describe('FeatureFlagsService', () => {
  function serviceWith(env: Record<string, string | number | undefined>) {
    const config = { get: (key: string) => env[key] };
    const logger = { warn: jest.fn(), log: jest.fn() };
    return {
      service: new FeatureFlagsService(config as never, logger as never),
      logger,
    };
  }

  it('defaults to enabled with no env configured', () => {
    const { service } = serviceWith({});
    expect(service.isEnabled('AI_PERFORMANCE_COACH')).toBe(true);
    expect(service.isEnabled('REWARDS_REDEMPTION', { userId: 'u1' })).toBe(true);
  });

  it('disables via env and throws a 503 requireEnabled', () => {
    const { service } = serviceWith({ FEATURE_REWARDS_REDEMPTION: 'false' });
    expect(service.isEnabled('REWARDS_REDEMPTION')).toBe(false);
    expect(() => service.requireEnabled('REWARDS_REDEMPTION')).toThrow(
      expect.objectContaining({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' }),
    );
  });

  it('fail-closes anonymous callers when a rollout is configured', () => {
    const { service } = serviceWith({ FEATURE_AI_SIMILAR_PROBLEMS_ROLLOUT: 100 });
    expect(service.isEnabled('AI_SIMILAR_PROBLEMS')).toBe(false);
    expect(service.isEnabled('AI_SIMILAR_PROBLEMS', { userId: 'u1' })).toBe(true);
  });

  it('buckets authenticated users under partial rollouts', () => {
    const { service } = serviceWith({ FEATURE_PUBLIC_EVENTS_ROLLOUT: 0 });
    expect(service.isEnabled('PUBLIC_EVENTS', { userId: 'u1' })).toBe(false);
  });

  it('warns on unrecognized values and keeps the default', () => {
    const { service, logger } = serviceWith({ FEATURE_PUBLIC_EVENTS: 'eventually' });
    expect(service.isEnabled('PUBLIC_EVENTS')).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('feature-flags.unrecognized-value'),
      'Config',
    );
  });
});
