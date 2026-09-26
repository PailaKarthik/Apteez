import { AI_REVIEWER_MODEL, AiProcessor } from './ai.processor';

const CONTRIBUTION = {
  id: 'c1',
  status: 'PENDING',
  title: 'Sample arithmetic question',
  statement: 'What is 2 + 2? A simple arithmetic question for testing purposes.',
  options: [
    { text: '3', isCorrect: false },
    { text: '4', isCorrect: true },
  ],
  explanation: 'Basic addition: two plus two equals four, always and forever.',
  difficulty: 'EASY',
  topic: { name: 'Arithmetic' },
};

function createProcessor() {
  const prisma = {
    contribution: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    contributionAiReview: { findFirst: jest.fn(), create: jest.fn() },
  };
  const embeddings = {};
  const usage = { record: jest.fn().mockResolvedValue(undefined) };
  const structured = { generate: jest.fn() };
  const flags = { isEnabled: jest.fn().mockReturnValue(true) };
  const llm = { isConfigured: jest.fn().mockReturnValue(true) };
  const queue = { add: jest.fn() };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const processor = new AiProcessor(
    prisma as never,
    embeddings as never,
    usage as never,
    structured as never,
    flags as never,
    llm as never,
    queue as never,
    logger as never,
  );
  return { processor, prisma, usage, structured, flags, llm };
}

function reviewJob(contributionId = 'c1') {
  return { id: 'job1', name: 'ai.contribution-review', data: { contributionId } } as never;
}

describe('AiProcessor contribution review', () => {
  it('defers to manual review when the flag is off (no model call)', async () => {
    const { processor, prisma, usage, structured, flags } = createProcessor();
    (flags.isEnabled as jest.Mock).mockReturnValue(false);
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValue(CONTRIBUTION);
    await processor.process(reviewJob());
    expect(structured.generate).not.toHaveBeenCalled();
    expect(prisma.contributionAiReview.create).not.toHaveBeenCalled();
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'contribution-review', model: 'review-deferred' }),
    );
  });

  it('defers when no LLM provider is configured', async () => {
    const { processor, prisma, usage, structured, llm } = createProcessor();
    (llm.isConfigured as jest.Mock).mockReturnValue(false);
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValue(CONTRIBUTION);
    await processor.process(reviewJob());
    expect(structured.generate).not.toHaveBeenCalled();
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'review-deferred' }),
    );
  });

  it('stores an advisory ai-reviewer-v1 row on success and never publishes', async () => {
    const { processor, prisma, usage, structured } = createProcessor();
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValue(CONTRIBUTION);
    (prisma.contributionAiReview.findFirst as jest.Mock).mockResolvedValue({
      duplicateProbability: 0.1,
      issues: [],
    });
    (structured.generate as jest.Mock).mockResolvedValue({
      ok: true,
      value: {
        topic: 'Arithmetic',
        subtopic: null,
        difficulty: 'EASY',
        duplicateProbability: 0.1,
        answerConsistent: true,
        issues: [],
        recommendation: 'APPROVE',
      },
      attempts: 1,
      error: null,
    });
    (prisma.contributionAiReview.create as jest.Mock).mockResolvedValue({ id: 'r1' });
    await processor.process(reviewJob());
    expect(prisma.contributionAiReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ model: AI_REVIEWER_MODEL, recommendation: 'APPROVE' }),
      }),
    );
    // Advisory only: no status transition anywhere in the review path.
    expect(prisma.contribution.update).not.toHaveBeenCalled();
    expect(prisma.contribution.updateMany).not.toHaveBeenCalled();
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'contribution-review',
        model: AI_REVIEWER_MODEL,
        success: true,
      }),
    );
  });

  it('stays PENDING with a failure usage row when structured output fails', async () => {
    const { processor, prisma, usage, structured } = createProcessor();
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValue(CONTRIBUTION);
    (prisma.contributionAiReview.findFirst as jest.Mock).mockResolvedValue(null);
    (structured.generate as jest.Mock).mockResolvedValue({
      ok: false,
      value: null,
      attempts: 2,
      error: 'duplicateProbability: expected number',
    });
    await expect(processor.process(reviewJob())).resolves.toBeUndefined();
    expect(prisma.contributionAiReview.create).not.toHaveBeenCalled();
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'contribution-review',
        model: AI_REVIEWER_MODEL,
        success: false,
      }),
    );
  });

  it('skips decided or missing contributions without telemetry', async () => {
    const { processor, prisma, usage, structured } = createProcessor();
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValue({
      ...CONTRIBUTION,
      status: 'APPROVED',
    });
    await processor.process(reviewJob());
    expect(structured.generate).not.toHaveBeenCalled();
    expect(usage.record).not.toHaveBeenCalled();
  });
});
