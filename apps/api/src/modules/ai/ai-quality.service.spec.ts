import { AiFeedbackValidationError, AiQualityService } from './ai-quality.service';

function createService() {
  const prisma = {
    aiFeedback: { create: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
    contributionAiReview: { findFirst: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
    aiUsageLog: {
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    ragRetrievalLog: {
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn(),
    },
  };
  const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  const service = new AiQualityService(prisma as never, logger as never);
  return { service, prisma };
}

describe('AiQualityService feedback intake', () => {
  it('records coach and similar verdicts', async () => {
    const { service, prisma } = createService();
    (prisma.aiFeedback.create as jest.Mock).mockResolvedValue({ id: 'a1' });
    await expect(
      service.recordFeedback('u1', { feature: 'performance-coach', verdict: 'helpful' }),
    ).resolves.toEqual({ id: 'a1' });
    await expect(
      service.recordFeedback('u1', {
        feature: 'similar-problems',
        targetId: '11111111-1111-4111-8111-111111111111',
        verdict: 'relevant',
      }),
    ).resolves.toEqual({ id: 'a1' });
  });

  it('rejects cross-feature verdicts', async () => {
    const { service } = createService();
    await expect(
      service.recordFeedback('u1', { feature: 'performance-coach', verdict: 'relevant' }),
    ).rejects.toBeInstanceOf(AiFeedbackValidationError);
  });

  it('refuses public contribution-review verdicts (admin decisions only)', async () => {
    const { service } = createService();
    await expect(
      service.recordFeedback('u1', { feature: 'contribution-review', verdict: 'agree' }),
    ).rejects.toBeInstanceOf(AiFeedbackValidationError);
  });
});

describe('AiQualityService review outcomes', () => {
  it('records agreement and contradiction, skips REVIEW recommendations', async () => {
    const { service, prisma } = createService();
    (prisma.contributionAiReview.findFirst as jest.Mock).mockResolvedValue({
      recommendation: 'APPROVE',
    });
    (prisma.aiFeedback.create as jest.Mock).mockResolvedValue({ id: 'a1' });
    await service.recordReviewOutcome({
      contributionId: 'c1',
      decision: 'APPROVED',
      reviewerId: 'admin1',
    });
    expect(prisma.aiFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verdict: 'agree' }) }),
    );
    (prisma.contributionAiReview.findFirst as jest.Mock).mockResolvedValue({
      recommendation: 'APPROVE',
    });
    await service.recordReviewOutcome({
      contributionId: 'c1',
      decision: 'REJECTED',
      reviewerId: 'admin1',
    });
    expect(prisma.aiFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verdict: 'disagree' }) }),
    );
    (prisma.contributionAiReview.findFirst as jest.Mock).mockResolvedValue({
      recommendation: 'REVIEW',
    });
    (prisma.aiFeedback.create as jest.Mock).mockClear();
    await service.recordReviewOutcome({
      contributionId: 'c1',
      decision: 'APPROVED',
      reviewerId: 'admin1',
    });
    expect(prisma.aiFeedback.create).not.toHaveBeenCalled();
  });

  it('stays silent when no AI review exists or telemetry fails', async () => {
    const { service, prisma } = createService();
    (prisma.contributionAiReview.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.recordReviewOutcome({ contributionId: 'c1', decision: 'APPROVED', reviewerId: 'a' }),
    ).resolves.toBeUndefined();
    (prisma.contributionAiReview.findFirst as jest.Mock).mockRejectedValue(new Error('db down'));
    await expect(
      service.recordReviewOutcome({ contributionId: 'c1', decision: 'APPROVED', reviewerId: 'a' }),
    ).resolves.toBeUndefined();
  });
});

describe('AiQualityService overview', () => {
  it('aggregates usage, feedback, rag and review signals', async () => {
    const { service, prisma } = createService();
    (prisma.aiUsageLog.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        {
          feature: 'performance-coach',
          _count: { _all: 10 },
          _avg: { latencyMs: 1200, toolCount: 3 },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ feature: 'performance-coach', _count: { _all: 4 } }]);
    (prisma.aiFeedback.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { feature: 'performance-coach', verdict: 'helpful', _count: { _all: 6 } },
      ])
      .mockResolvedValueOnce([{ verdict: 'agree', _count: { _all: 2 } }]);
    (prisma.ragRetrievalLog.groupBy as jest.Mock).mockResolvedValueOnce([
      { source: 'vector', _count: { _all: 8 } },
      { source: 'lexical-fallback', _count: { _all: 2 } },
    ]);
    (prisma.ragRetrievalLog.aggregate as jest.Mock).mockResolvedValue({
      _avg: { resultCount: 4.5, latencyMs: 90 },
    });
    (prisma.contributionAiReview.groupBy as jest.Mock).mockResolvedValueOnce([
      { recommendation: 'APPROVE', _count: { _all: 3 } },
    ]);
    const overview = await service.overview(7);
    expect(overview.windowDays).toBe(7);
    expect(overview.usage[0]).toMatchObject({
      feature: 'performance-coach',
      calls: 10,
      fallbacks: 4,
      fallbackRate: 0.4,
    });
    expect(overview.rag).toMatchObject({
      total: 10,
      vector: 8,
      lexicalFallback: 2,
      fallbackRate: 0.2,
    });
    expect(overview.review).toMatchObject({
      overridesAgree: 2,
      recommendationSplit: { APPROVE: 3, REVIEW: 0, REJECT: 0 },
    });
  });
});
