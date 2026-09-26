import { CatalogService, assembleExamPatterns, difficultyBand } from './catalog.service';

function tag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tag1',
    name: 'SSC',
    slug: 'ssc',
    description: null,
    problemCount: 0,
    ...overrides,
  };
}

describe('difficultyBand', () => {
  it('labels empty folders New', () => {
    expect(difficultyBand({ easy: 0, medium: 0, hard: 0 })).toBe('New');
  });

  it('applies the documented thresholds', () => {
    expect(difficultyBand({ easy: 1, medium: 1, hard: 8 })).toBe('Hard');
    expect(difficultyBand({ easy: 7, medium: 2, hard: 1 })).toBe('Easy');
    expect(difficultyBand({ easy: 4, medium: 4, hard: 2 })).toBe('Easy–Med');
    expect(difficultyBand({ easy: 2, medium: 5, hard: 3 })).toBe('Med–Hard');
    expect(difficultyBand({ easy: 2, medium: 6, hard: 2 })).toBe('Medium');
    expect(difficultyBand({ easy: 19, medium: 19, hard: 12 })).toBe('Mixed');
  });
});

describe('assembleExamPatterns', () => {
  it('keeps empty folders with zeroed mixes', () => {
    const [pattern] = assembleExamPatterns([tag({ problemCount: 0 })], []);
    expect(pattern.problemCount).toBe(0);
    expect(pattern.topCategories).toEqual([]);
    expect(pattern.difficultyMix).toEqual({ easy: 0, medium: 0, hard: 0 });
    expect(pattern.difficultyBand).toBe('New');
  });

  it('groups buckets into top categories and mixes, capped at three', () => {
    const buckets = [
      {
        examTagId: 'tag1',
        categoryName: 'Quant',
        categorySlug: 'quant',
        difficulty: 'EASY',
        count: 5,
      },
      {
        examTagId: 'tag1',
        categoryName: 'Quant',
        categorySlug: 'quant',
        difficulty: 'HARD',
        count: 1,
      },
      {
        examTagId: 'tag1',
        categoryName: 'Logic',
        categorySlug: 'logic',
        difficulty: 'MEDIUM',
        count: 4,
      },
      {
        examTagId: 'tag1',
        categoryName: 'Verbal',
        categorySlug: 'verbal',
        difficulty: 'EASY',
        count: 3,
      },
      { examTagId: 'tag1', categoryName: 'DI', categorySlug: 'di', difficulty: 'MEDIUM', count: 2 },
      // Other tags never leak in.
      {
        examTagId: 'tag2',
        categoryName: 'Quant',
        categorySlug: 'quant',
        difficulty: 'EASY',
        count: 99,
      },
    ];
    const [pattern] = assembleExamPatterns([tag({ problemCount: 14 })], buckets);
    expect(pattern.problemCount).toBe(14);
    expect(pattern.difficultyMix).toEqual({ easy: 8, medium: 6, hard: 1 });
    expect(pattern.topCategories.map((c) => c.slug)).toEqual(['quant', 'logic', 'verbal']);
    expect(pattern.topCategories[0]).toMatchObject({ name: 'Quant', problemCount: 6 });
  });
});

function createPrisma() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

describe('CatalogService home aggregates', () => {
  it('listExamPatterns passes live tags and buckets through the assembler', async () => {
    const prisma = createPrisma();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      {
        id: 't1',
        name: 'SSC',
        slug: 'ssc',
        description: null,
        categoryName: 'Quant',
        categorySlug: 'quant',
        difficulty: 'EASY',
        count: 2,
      },
    ]);
    const service = new CatalogService(prisma as never);
    const patterns = await service.listExamPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({ slug: 'ssc', problemCount: 2, difficultyBand: 'Easy' });
    expect(patterns[0]?.topCategories).toEqual([{ name: 'Quant', slug: 'quant', problemCount: 2 }]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('listPracticeAreas returns zeros for anonymous callers without touching submissions', async () => {
    const prisma = createPrisma();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      {
        id: 'c1',
        name: 'Quantitative',
        slug: 'quant',
        description: null,
        icon: null,
        problemCount: 4,
        solvedCount: 0,
      },
    ]);
    const service = new CatalogService(prisma as never);
    const areas = await service.listPracticeAreas(undefined);
    expect(areas).toEqual([
      {
        id: 'c1',
        name: 'Quantitative',
        slug: 'quant',
        description: null,
        icon: null,
        problemCount: 4,
        solvedCount: 0,
        completionPct: 0,
      },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('listPracticeAreas caps solved counts and derives percentages', async () => {
    const prisma = createPrisma();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      {
        id: 'c1',
        name: 'Quantitative',
        slug: 'quant',
        description: null,
        icon: null,
        problemCount: 4,
        solvedCount: 10,
      },
      {
        id: 'c2',
        name: 'Empty',
        slug: 'empty',
        description: null,
        icon: null,
        problemCount: 0,
        solvedCount: 3,
      },
    ]);
    const service = new CatalogService(prisma as never);
    const areas = await service.listPracticeAreas('user1');
    expect(areas[0]).toMatchObject({ solvedCount: 4, completionPct: 100 });
    expect(areas[1]).toMatchObject({ solvedCount: 0, completionPct: 0 });
  });
});
