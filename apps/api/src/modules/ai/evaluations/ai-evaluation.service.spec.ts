import { AiEvaluationService } from './ai-evaluation.service';
import { EVAL_VERSION } from './coach-fixtures';

function createService() {
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { service: new AiEvaluationService(logger as never), logger };
}

describe('AiEvaluationService', () => {
  it('runs all suites deterministically with a version stamp', () => {
    const { service, logger } = createService();
    const first = service.runAll();
    const second = service.runAll();
    expect(first.version).toBe(EVAL_VERSION);
    // ranAt is a wall-clock stamp by design; everything else must be stable.
    const { ranAt: _firstRanAt, ...firstRest } = first;
    const { ranAt: _secondRanAt, ...secondRest } = second;
    expect(firstRest).toEqual(secondRest);
    expect(first.cases.length).toBeGreaterThan(0);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(`version=${EVAL_VERSION}`),
      'AI',
    );
  });

  it('passes every fixture case (fixtures are written against the implementation)', () => {
    const { service } = createService();
    const run = service.runAll();
    expect(run.failed).toBe(0);
    expect(run.passed).toBe(run.cases.length);
  });

  it('covers all three approved capabilities', () => {
    const { service } = createService();
    const suites = new Set(service.runAll().cases.map((result) => result.suite));
    expect(suites).toEqual(
      new Set(['coach-grounding', 'rag-rerank', 'rag-exclusion', 'review-schema']),
    );
  });
});
