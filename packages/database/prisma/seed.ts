import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Prisma, PrismaClient } from '../generated/client';

/**
 * Development seed for the ApteeZ database foundation.
 *
 * Seeds structural data only — roles, permissions, dev users, the seven
 * aptitude categories, a few topics, exam tags and a default Favorites
 * collection. No fake problems, submissions or activity: difficulties and
 * statuses are native database enums (nothing to seed), and content rows
 * belong to later prompts.
 *
 * Everything is upsert-based (idempotent) and clearly namespaced:
 * `@apteez.dev` emails plus "Development seed …" descriptions distinguish
 * seed rows from production content.
 *
 * Dev credentials are development-only and documented here openly:
 *   admin@apteez.dev / member@apteez.dev, password `apteez-dev-only`.
 * Passwords use the same scrypt parameters as the API PasswordService.
 */
const prisma = new PrismaClient();

const DEV_PASSWORD = 'apteez-dev-only';

function devPasswordHash(): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(DEV_PASSWORD, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt}$${derived.toString('hex')}`;
}

// Structural RBAC + taxonomy live in ./seed-data (shared with the production
// bootstrap). This dev seed adds clearly-marked dev content on top.
import {
  ACHIEVEMENTS,
  CATEGORIES,
  EXAM_TAGS,
  PERMISSIONS,
  REWARD_RULES,
  ROLES,
  SUBTOPICS,
  TOPICS,
  seedRbac,
  seedOrganizations,
  seedRewards,
  seedTaxonomy,
} from './seed-data';

const DEV_USERS: Array<{
  email: string;
  username: string;
  displayName: string;
  bio: string;
  roles: string[];
}> = [
  {
    email: 'admin@apteez.dev',
    username: 'apteez_admin',
    displayName: 'ApteeZ Admin (dev)',
    bio: 'Development seed administrator.',
    roles: ['admin'],
  },
  {
    email: 'member@apteez.dev',
    username: 'apteez_member',
    displayName: 'ApteeZ Member (dev)',
    bio: 'Development seed member.',
    roles: ['user'],
  },
];

async function seedUsers(): Promise<void> {
  const passwordHash = devPasswordHash();
  for (const dev of DEV_USERS) {
    const user = await prisma.user.upsert({
      where: { email: dev.email },
      update: {
        username: dev.username,
        displayName: dev.displayName,
        bio: dev.bio,
        passwordHash,
        isActive: true,
      },
      create: {
        email: dev.email,
        username: dev.username,
        displayName: dev.displayName,
        bio: dev.bio,
        passwordHash,
        emailVerified: new Date(),
      },
    });
    for (const roleName of dev.roles) {
      const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }
    // Exactly one default Favorites collection per user (DB-enforced).
    await prisma.favoriteCollection.upsert({
      where: { ownerId_name: { ownerId: user.id, name: 'Favorites' } },
      update: { isDefault: true, defaultSlot: user.id },
      create: { ownerId: user.id, name: 'Favorites', isDefault: true, defaultSlot: user.id },
    });
  }
}

function seededId(prefix: string, index: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

interface SeedOption {
  text?: string;
  assetKey?: string;
  isCorrect?: boolean;
}

interface SeedProblem {
  title: string;
  statement?: string;
  contentMode?: 'TEXT_ONLY' | 'IMAGE_ONLY' | 'TEXT_AND_IMAGE';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  rating: number;
  explanation?: string;
  shortcut?: string;
  source?: string;
  sourceYear?: number;
  categorySlug: string;
  topicSlug: string;
  subtopicSlug?: string;
  examSlugs: string[];
  assets?: Array<{ objectKey: string; mimeType: string; altText: string }>;
  options: SeedOption[];
}

const SEED_IMAGE_KEY = 'seed/problems/diagram-placeholder.svg';

const SEED_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 240" role="img" aria-label="Rotating polygon sequence">
  <rect width="480" height="240" fill="#f8fafc"/>
  <g fill="none" stroke="#4f46e5" stroke-width="3">
    <polygon points="60,120 90,68 120,120 90,172"/>
    <polygon points="180,120 210,60 240,90 210,180 180,150"/>
    <polygon points="300,120 330,55 360,80 360,160 330,185"/>
    <polygon points="420,120 450,50 480,120 450,190"/>
  </g>
  <g fill="#1e1b4b" font-family="Arial, sans-serif" font-size="16" text-anchor="middle">
    <text x="90" y="215">A</text>
    <text x="210" y="215">B</text>
    <text x="330" y="215">C</text>
    <text x="450" y="215">D</text>
  </g>
</svg>
`;

/**
 * Writes the demo question image into the local storage provider's root so
 * the image-backed seed problems render end to end. Remote providers (s3)
 * manage assets themselves, so this is a local-development convenience.
 */
function seedLocalAssets(): void {
  if ((process.env.STORAGE_PROVIDER ?? 'local') !== 'local') {
    return;
  }
  const configuredDir = process.env.STORAGE_LOCAL_DIR ?? './.data/storage';
  // The API resolves relative storage paths from apps/api (its cwd).
  const apiDir = resolve(__dirname, '../../../apps/api');
  const target = resolve(apiDir, configuredDir, SEED_IMAGE_KEY);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, SEED_IMAGE_SVG, 'utf8');
}

const PROBLEMS: SeedProblem[] = [
  {
    title: 'Time and Work: two workers combining rates',
    statement:
      'A can complete a job in 12 days and B can complete it in 18 days. Working together, in how many days will they finish the job?',
    difficulty: 'EASY',
    rating: 1100,
    explanation:
      'Combined rate = 1/12 + 1/18 = 5/36 of the job per day, so the job takes 36/5 = 7.2 days.',
    shortcut: 'Use the product-over-sum rule: (12 × 18) / (12 + 18).',
    source: 'ApteeZ seed',
    sourceYear: 2024,
    categorySlug: 'quantitative',
    topicSlug: 'time-and-work',
    examSlugs: ['ssc', 'banking', 'placement'],
    options: [
      { text: '6.5 days' },
      { text: '7.2 days', isCorrect: true },
      { text: '8 days' },
      { text: '9 days' },
    ],
  },
  {
    title: 'Pipes and Cisterns: filling with a leak',
    statement:
      'A pipe fills a tank in 6 hours. A leak empties it in 12 hours. With both open, how long does the tank take to fill?',
    difficulty: 'MEDIUM',
    rating: 1300,
    explanation: 'Net rate = 1/6 − 1/12 = 1/12 of the tank per hour, so it fills in 12 hours.',
    categorySlug: 'quantitative',
    topicSlug: 'time-and-work',
    subtopicSlug: 'pipes-and-cisterns',
    examSlugs: ['ssc', 'railway'],
    options: [
      { text: '9 hours' },
      { text: '10 hours' },
      { text: '12 hours', isCorrect: true },
      { text: '18 hours' },
    ],
  },
  {
    title: 'Percentages: successive discount',
    statement:
      'A shirt is marked at ₹2,000. Two successive discounts of 10% and 20% are applied. What is the final selling price?',
    difficulty: 'EASY',
    rating: 1000,
    explanation: 'Final price = 2000 × 0.9 × 0.8 = ₹1,440.',
    shortcut: 'Successive discounts multiply: net factor 0.9 × 0.8 = 0.72.',
    source: 'ApteeZ seed',
    sourceYear: 2023,
    categorySlug: 'quantitative',
    topicSlug: 'percentages',
    examSlugs: ['banking', 'placement', 'general'],
    options: [
      { text: '₹1,400' },
      { text: '₹1,440', isCorrect: true },
      { text: '₹1,500' },
      { text: '₹1,600' },
    ],
  },
  {
    title: 'Percentages: population growth over two years',
    statement:
      'The population of a town increases by 10% in the first year and decreases by 10% in the second. What is the net change?',
    difficulty: 'MEDIUM',
    rating: 1200,
    explanation: 'Net factor = 1.1 × 0.9 = 0.99, a net decrease of 1%.',
    categorySlug: 'quantitative',
    topicSlug: 'percentages',
    examSlugs: ['ssc', 'upsc'],
    options: [
      { text: 'No change' },
      { text: '1% increase' },
      { text: '1% decrease', isCorrect: true },
      { text: '2% decrease' },
    ],
  },
  {
    title: 'Number Series: find the missing term',
    statement: 'Find the next term in the series: 2, 6, 12, 20, 30, ?',
    difficulty: 'EASY',
    rating: 1000,
    explanation: 'Differences are 4, 6, 8, 10, so the next difference is 12 and the term is 42.',
    shortcut: 'Terms are n(n + 1): 42 = 6 × 7.',
    categorySlug: 'logical-reasoning',
    topicSlug: 'number-series',
    examSlugs: ['tcs-nqt', 'placement', 'general'],
    options: [{ text: '36' }, { text: '40' }, { text: '42', isCorrect: true }, { text: '44' }],
  },
  {
    title: 'Number Series: missing term in a geometric series',
    statement: 'Find the missing term: 3, 9, 27, ?, 243.',
    difficulty: 'EASY',
    rating: 1000,
    explanation: 'Each term is multiplied by 3, so the missing term is 81.',
    categorySlug: 'logical-reasoning',
    topicSlug: 'number-series',
    examSlugs: ['railway', 'general'],
    options: [{ text: '54' }, { text: '72' }, { text: '81', isCorrect: true }, { text: '96' }],
  },
  {
    title: 'Blood Relations: identifying the relation',
    statement:
      'Pointing to a photograph, Ravi said, "She is the daughter of my grandfather\u2019s only son." How is the girl related to Ravi?',
    difficulty: 'MEDIUM',
    rating: 1300,
    explanation:
      'My grandfather\u2019s only son is Ravi\u2019s father, so the girl is Ravi\u2019s sister.',
    categorySlug: 'logical-reasoning',
    topicSlug: 'blood-relations',
    examSlugs: ['ssc', 'banking'],
    options: [
      { text: 'Cousin' },
      { text: 'Sister', isCorrect: true },
      { text: 'Niece' },
      { text: 'Aunt' },
    ],
  },
  {
    title: 'Blood Relations: family tree deduction',
    statement:
      'A is the father of B. B is the sister of C. C is the son of D. How is D related to A?',
    difficulty: 'HARD',
    rating: 1600,
    explanation:
      'C\u2019s parent D is also B\u2019s parent, and A is B\u2019s father — so D is A\u2019s wife.',
    categorySlug: 'logical-reasoning',
    topicSlug: 'blood-relations',
    examSlugs: ['ssc', 'railway', 'upsc'],
    options: [
      { text: 'Mother' },
      { text: 'Wife', isCorrect: true },
      { text: 'Sister' },
      { text: 'Cannot be determined' },
    ],
  },
  {
    title: 'Reading Comprehension: inference from a passage',
    statement:
      'Read the passage: "Despite heavy investment in automation, the factory\u2019s output barely changed, because the new machines needed frequent manual recalibration." Which conclusion is best supported?',
    difficulty: 'MEDIUM',
    rating: 1200,
    explanation:
      'The passage attributes the flat output to frequent manual recalibration, so automation alone did not deliver the expected gain.',
    categorySlug: 'verbal',
    topicSlug: 'reading-comprehension',
    examSlugs: ['upsc', 'placement'],
    options: [
      { text: 'Automation always reduces output.' },
      { text: 'The machines were not worth installing.', isCorrect: true },
      { text: 'Manual labour is unnecessary.' },
      { text: 'The factory invested too little.' },
    ],
  },
  {
    title: 'Data Interpretation: bar chart percentage share',
    statement:
      'A bar chart shows quarterly sales of 120, 150, 90 and 140 units. What percentage of the annual total came from the highest quarter?',
    difficulty: 'MEDIUM',
    rating: 1300,
    explanation: 'Total = 500; the highest quarter is 150, which is 30% of the total.',
    categorySlug: 'data-interpretation',
    topicSlug: 'bar-charts',
    examSlugs: ['banking', 'tcs-nqt'],
    options: [{ text: '25%' }, { text: '28%' }, { text: '30%', isCorrect: true }, { text: '32%' }],
  },
  {
    title: 'Data Interpretation: average from a table',
    statement:
      'A table lists monthly expenses of ₹1,200, ₹1,500, ₹900 and ₹1,400. What is the average monthly expense?',
    difficulty: 'EASY',
    rating: 1000,
    explanation: 'Sum = 5,000 over 4 months, so the average is ₹1,250.',
    categorySlug: 'data-interpretation',
    topicSlug: 'bar-charts',
    examSlugs: ['banking', 'general'],
    options: [
      { text: '₹1,200' },
      { text: '₹1,250', isCorrect: true },
      { text: '₹1,300' },
      { text: '₹1,350' },
    ],
  },
  {
    title: 'Visual Reasoning: figure sequence (image)',
    statement: 'Study the figure sequence and identify the next shape in the pattern.',
    contentMode: 'TEXT_AND_IMAGE',
    difficulty: 'MEDIUM',
    rating: 1300,
    explanation: 'The figure rotates 90° clockwise and gains one side each step.',
    categorySlug: 'visual',
    topicSlug: 'figure-series',
    examSlugs: ['tcs-nqt', 'placement'],
    assets: [
      {
        objectKey: SEED_IMAGE_KEY,
        mimeType: 'image/svg+xml',
        altText: 'Sequence of rotating polygons',
      },
    ],
    options: [
      { text: 'Pentagon rotated 90° clockwise', isCorrect: true },
      { text: 'Square rotated 45°' },
      { text: 'Hexagon rotated 90° counter-clockwise' },
      { text: 'Triangle rotated 180°' },
    ],
  },
  {
    title: 'Visual Reasoning: odd figure out (image only)',
    contentMode: 'IMAGE_ONLY',
    difficulty: 'HARD',
    rating: 1600,
    explanation: 'Every figure except one is symmetric about a vertical axis.',
    categorySlug: 'visual',
    topicSlug: 'figure-series',
    examSlugs: ['tcs-nqt', 'gate'],
    assets: [
      {
        objectKey: SEED_IMAGE_KEY,
        mimeType: 'image/svg+xml',
        altText: 'Four candidate figures arranged in a row',
      },
    ],
    options: [
      { text: 'Figure A' },
      { text: 'Figure B' },
      { text: 'Figure C', isCorrect: true },
      { text: 'Figure D' },
    ],
  },
  {
    title: 'Cryptarithmetic: SEND + MORE = MONEY',
    statement:
      'In the alphametic SEND + MORE = MONEY, each letter is a distinct digit. What digit does M represent?',
    difficulty: 'HARD',
    rating: 1700,
    explanation: 'The sum of two four-digit numbers yields a five-digit result, so M must be 1.',
    shortcut: 'A five-digit sum from two four-digit numbers always starts with 1.',
    source: 'ApteeZ seed',
    sourceYear: 2022,
    categorySlug: 'cryptarithmetic',
    topicSlug: 'alphametics',
    examSlugs: ['gate', 'placement'],
    options: [{ text: '0' }, { text: '1', isCorrect: true }, { text: '2' }, { text: '9' }],
  },
  {
    title: 'Game-Based Aptitude: resource allocation round',
    statement:
      'In the allocation game, you have three moves to distribute 10 tokens between two bins. Which opening move maximises the guaranteed final total?',
    difficulty: 'MEDIUM',
    rating: 1400,
    explanation:
      'Opening with an even split keeps both future response trees symmetric and guarantees the higher floor.',
    categorySlug: 'game-based',
    topicSlug: 'resource-games',
    examSlugs: ['tcs-nqt', 'gate'],
    options: [
      { text: '5 and 5', isCorrect: true },
      { text: '10 and 0' },
      { text: '7 and 3' },
      { text: '8 and 2' },
    ],
  },
];

async function seedProblems(): Promise<void> {
  const member = await prisma.user.findUniqueOrThrow({ where: { email: 'member@apteez.dev' } });
  const favorites = await prisma.favoriteCollection.findFirstOrThrow({
    where: { ownerId: member.id, isDefault: true },
  });

  for (let index = 0; index < PROBLEMS.length; index += 1) {
    const seed = PROBLEMS[index]!;
    const problemId = seededId('a', index + 1);
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: seed.categorySlug },
    });
    const topic = await prisma.topic.findFirstOrThrow({
      where: { categoryId: category.id, slug: seed.topicSlug },
    });
    const subtopic = seed.subtopicSlug
      ? await prisma.subtopic.findFirstOrThrow({
          where: { topicId: topic.id, slug: seed.subtopicSlug },
        })
      : null;

    const data = {
      title: seed.title,
      statement: seed.statement ?? null,
      contentMode: seed.contentMode ?? 'TEXT_ONLY',
      difficulty: seed.difficulty,
      rating: seed.rating,
      status: 'PUBLISHED' as const,
      explanation: seed.explanation ?? null,
      shortcut: seed.shortcut ?? null,
      source: seed.source ?? null,
      sourceYear: seed.sourceYear ?? null,
      creatorId: member.id,
      categoryId: category.id,
      topicId: topic.id,
      subtopicId: subtopic?.id ?? null,
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    await prisma.problem.upsert({
      where: { id: problemId },
      update: data,
      create: { id: problemId, ...data },
    });

    for (let optionIndex = 0; optionIndex < seed.options.length; optionIndex += 1) {
      const option = seed.options[optionIndex]!;
      const optionId = seededId('b', (index + 1) * 10 + optionIndex);
      const optionData = {
        problemId,
        position: optionIndex,
        text: option.text ?? null,
        assetKey: option.assetKey ?? null,
        isCorrect: option.isCorrect ?? false,
      };
      await prisma.problemOption.upsert({
        where: { problemId_position: { problemId, position: optionIndex } },
        update: {
          text: optionData.text,
          assetKey: optionData.assetKey,
          isCorrect: optionData.isCorrect,
        },
        create: { id: optionId, ...optionData },
      });
    }

    const assetKeys = seed.assets ?? [];
    for (let assetIndex = 0; assetIndex < assetKeys.length; assetIndex += 1) {
      const asset = assetKeys[assetIndex]!;
      const assetId = seededId('c', (index + 1) * 10 + assetIndex);
      await prisma.problemAsset.upsert({
        where: { id: assetId },
        update: { objectKey: asset.objectKey, mimeType: asset.mimeType, altText: asset.altText },
        create: {
          id: assetId,
          problemId,
          kind: 'QUESTION_IMAGE',
          objectKey: asset.objectKey,
          mimeType: asset.mimeType,
          sizeBytes: 2048,
          position: assetIndex,
          altText: asset.altText,
        },
      });
    }

    for (const examSlug of seed.examSlugs) {
      const tag = await prisma.examTag.findUniqueOrThrow({ where: { slug: examSlug } });
      await prisma.problemExam.upsert({
        where: { problemId_examTagId: { problemId, examTagId: tag.id } },
        update: {},
        create: { problemId, examTagId: tag.id },
      });
    }
  }

  // A few attempts so the UI can show accuracy/solved states immediately.
  const attempted = [1, 2, 3, 5, 9];
  for (const index of attempted) {
    const problemId = seededId('a', index);
    const existing = await prisma.submission.findFirst({ where: { userId: member.id, problemId } });
    if (existing) {
      continue;
    }
    const correctOption = await prisma.problemOption.findFirst({
      where: { problemId, isCorrect: true },
      select: { id: true },
    });
    const correct = index % 2 === 1;
    const seconds = 45 + index * 7;
    const submittedAt = new Date('2026-01-02T00:00:00.000Z');
    await prisma.submission.create({
      data: {
        userId: member.id,
        problemId,
        selectedOptionId: correct ? (correctOption?.id ?? null) : null,
        status: 'SUBMITTED',
        isCorrect: correct,
        timeSpentSeconds: seconds,
        clientTimeSpentSeconds: seconds,
        startedAt: new Date(submittedAt.getTime() - seconds * 1000),
        submittedAt,
        context: 'PRACTICE',
      },
    });
  }

  for (const index of [1, 5, 14]) {
    const problemId = seededId('a', index);
    await prisma.favoriteCollectionItem.upsert({
      where: { collectionId_problemId: { collectionId: favorites.id, problemId } },
      update: {},
      create: { collectionId: favorites.id, problemId },
    });
  }
}

// ─── Learning seed (Prompt 12) ───────────────────────────────────────────────

interface SeedLearningBlock {
  kind: 'heading' | 'text' | 'formula' | 'note' | 'example' | 'list';
  value: string;
  items?: string[];
}

interface SeedLearningLesson {
  slug: string;
  title: string;
  concept: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  estimatedMinutes: number;
  content: SeedLearningBlock[];
  examSlugs: string[];
  practiceCount: number;
}

interface SeedLearningTopic {
  slug: string;
  title: string;
  summary: string;
  /** Shared taxonomy Topic anchor for practice-link resolution. */
  topicSlug?: string;
  lessons: SeedLearningLesson[];
}

function lblock(value: string): SeedLearningBlock {
  return { kind: 'text', value };
}

// 3 fully-authored domains; the remaining 4 get empty published paths so the
// Explore grid represents all seven without forcing content.
const SEED_LEARNING_QUANT_PERCENTAGES: SeedLearningTopic[] = [
  {
    slug: 'percentages',
    title: 'Percentages',
    summary: 'Percentage change, successive variation and fraction–percent conversion.',
    topicSlug: 'percentages',
    lessons: [
      {
        slug: 'percentages-basics',
        title: 'Percentages — the basics',
        concept: 'Percentage fundamentals',
        difficulty: 'EASY',
        estimatedMinutes: 6,
        examSlugs: ['ssc', 'banking', 'placement'],
        practiceCount: 5,
        content: [
          { kind: 'heading', value: 'What is a percentage?' },
          lblock(
            'A percentage is a fraction with denominator 100. 25% means 25 out of 100, i.e. one quarter. Converting between fraction, ratio and percentage is the root of this topic.',
          ),
          { kind: 'formula', value: 'x% of y = (x / 100) × y = (y / 100) × x' },
          { kind: 'note', value: 'x% of y equals y% of x, so 8% of 25 equals 25% of 8 = 2.' },
          { kind: 'example', value: '15% of 240: 10% = 24 and 5% = 12, so 15% = 24 + 12 = 36.' },
          {
            kind: 'list',
            value: 'Common conversions to memorise',
            items: ['1/2 = 50%', '1/3 ≈ 33.33%', '1/4 = 25%', '1/5 = 20%', '1/8 = 12.5%'],
          },
        ],
      },
      {
        slug: 'percentages-successive-change',
        title: 'Successive percentage change',
        concept: 'Successive percentage change',
        difficulty: 'MEDIUM',
        estimatedMinutes: 8,
        examSlugs: ['ssc', 'banking', 'tcs-nqt'],
        practiceCount: 5,
        content: [
          { kind: 'heading', value: 'Two changes applied one after another' },
          lblock(
            'When a value grows by a% then b%, the combined change is not (a + b)%. Apply the second change to the new value.',
          ),
          {
            kind: 'formula',
            value: 'Net change = a + b + (a × b)/100  (signs included; + increase, − decrease)',
          },
          { kind: 'note', value: 'A 10% increase followed by a 10% decrease nets −1%, not 0%.' },
          {
            kind: 'example',
            value: '100 → +20% → 120 → −10% → 108. Net +8%; formula: 20 − 10 − 2 = 8%.',
          },
        ],
      },
    ],
  },
];

const SEED_LEARNING_QUANT_REST: SeedLearningTopic[] = [
  {
    slug: 'ratio-proportion',
    title: 'Ratio & Proportion',
    summary: 'Sharing, comparison and direct/inverse proportion.',
    lessons: [
      {
        slug: 'ratio-basics',
        title: 'Ratios — sharing and comparison',
        concept: 'Ratio fundamentals',
        difficulty: 'EASY',
        estimatedMinutes: 6,
        examSlugs: ['ssc', 'railway', 'placement'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'What a ratio means' },
          lblock(
            'A ratio a : b compares two quantities of the same unit; the total has a + b equal parts.',
          ),
          { kind: 'formula', value: 'If a : b and c : d, the compound ratio is ac : bd' },
          { kind: 'example', value: 'Split 120 as 3 : 5 → 3/8 × 120 = 45 and 5/8 × 120 = 75.' },
          {
            kind: 'note',
            value: 'Only a common factor may be cancelled on both sides. 6:9 ≡ 2:3.',
          },
        ],
      },
      {
        slug: 'proportion-basics',
        title: 'Proportion — direct and inverse',
        concept: 'Direct and inverse proportion',
        difficulty: 'MEDIUM',
        estimatedMinutes: 8,
        examSlugs: ['ssc', 'banking', 'gate'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Two quantities moving together' },
          lblock(
            'Direct proportion scales both quantities by the same factor; inverse proportion moves them in opposite directions.',
          ),
          { kind: 'formula', value: 'Direct: a/b = c/d ⇒ ad = bc   •   Inverse: a × b = c × d' },
          {
            kind: 'example',
            value: '4 workers finish a job in 9 days; 6 workers take 9 × 4/6 = 6 days (inverse).',
          },
        ],
      },
    ],
  },
  {
    slug: 'profit-loss',
    title: 'Profit & Loss',
    summary: 'Cost price, selling price, margin and discount chains.',
    lessons: [
      {
        slug: 'profit-loss-basics',
        title: 'Profit and loss fundamentals',
        concept: 'Profit and loss basics',
        difficulty: 'EASY',
        estimatedMinutes: 7,
        examSlugs: ['ssc', 'banking', 'placement'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Cost price, selling price and margin' },
          lblock(
            'Profit (or loss) is always measured against the cost price unless stated otherwise.',
          ),
          {
            kind: 'formula',
            value: 'Profit% = (SP − CP)/CP × 100   •   Loss% = (CP − SP)/CP × 100',
          },
          {
            kind: 'example',
            value: 'Bought at 500, sold at 600: profit 100 → profit% = 100/500 × 100 = 20%.',
          },
          {
            kind: 'note',
            value: 'A 25% loss means SP = 75% of CP — often hidden in dual-discount questions.',
          },
        ],
      },
      {
        slug: 'profit-loss-discounts',
        title: 'Discounts and marked price',
        concept: 'Discounts',
        difficulty: 'MEDIUM',
        estimatedMinutes: 9,
        examSlugs: ['ssc', 'banking', 'tcs-nqt'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Marked price → discount → selling price' },
          lblock(
            'Discounts apply to the marked price. A two-step chain uses successive-percentage logic.',
          ),
          { kind: 'formula', value: 'SP = MP × (1 − d1/100) × (1 − d2/100)' },
          {
            kind: 'example',
            value:
              'MP 400, successive 10% and 20% → SP = 400 × 0.9 × 0.8 = 288. Equivalent discount = 28%.',
          },
        ],
      },
    ],
  },
];

const SEED_LEARNING_QUANT = [...SEED_LEARNING_QUANT_PERCENTAGES, ...SEED_LEARNING_QUANT_REST];

const SEED_LEARNING_LOGICAL: SeedLearningTopic[] = [
  {
    slug: 'syllogisms',
    title: 'Syllogisms',
    summary: 'Statement–conclusion logic with all/some/no interactions.',
    lessons: [
      {
        slug: 'syllogisms-basics',
        title: 'The four statement forms',
        concept: 'Syllogism forms',
        difficulty: 'EASY',
        estimatedMinutes: 6,
        examSlugs: ['ssc', 'railway', 'placement'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'All, Some and No' },
          lblock(
            'Syllogisms test deductions from two categorical statements. Represent each statement with overlapping circles (Venn diagrams) before judging a conclusion.',
          ),
          {
            kind: 'list',
            value: 'The four standard forms',
            items: ['All A are B', 'Some A are B', 'No A are B', 'Some A are not B'],
          },
          {
            kind: 'note',
            value:
              'If "All A are B" and "All B are C", then definitely "All A are C" — but A and C may still be the same set.',
          },
          {
            kind: 'example',
            value:
              'All doctors are graduates. Some graduates are teachers. Conclusion "Some teachers are doctors" does not follow — teachers may live entirely outside doctors.',
          },
        ],
      },
      {
        slug: 'syllogisms-possibilities',
        title: 'Possibility conclusions',
        concept: 'Possibility vs definite conclusions',
        difficulty: 'MEDIUM',
        estimatedMinutes: 8,
        examSlugs: ['ssc', 'banking'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Can vs must' },
          lblock(
            'The word "can" (possibility) is weaker than "is" (definite). A definite conclusion fails if even one valid Venn arrangement contradicts it.',
          ),
          {
            kind: 'formula',
            value: 'Conclusion holds ONLY IF every valid arrangement satisfies it',
          },
          {
            kind: 'example',
            value:
              'Some pens are blue. All blue items are ink. "Some ink can be pens" follows; "Some pens are definitely ink" also follows since Every blue pen is ink.',
          },
        ],
      },
    ],
  },
  {
    slug: 'blood-relations',
    title: 'Blood Relations',
    summary: 'Family-tree deductions from relationship phrases.',
    topicSlug: 'blood-relations',
    lessons: [
      {
        slug: 'blood-relations-basics',
        title: 'Mapping family relationships',
        concept: 'Relationship mapping',
        difficulty: 'EASY',
        estimatedMinutes: 7,
        examSlugs: ['ssc', 'banking', 'placement'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Draw the family tree' },
          lblock(
            'Convert every relative phrase into nodes and edges. Use generations (parents above, children below) and mark gender symbols on each node.',
          ),
          {
            kind: 'list',
            value: 'Core mappings',
            items: [
              "Father's brother → uncle",
              "Mother's sister → aunt",
              "Brother's son → nephew",
              "Sister's daughter → niece",
            ],
          },
          {
            kind: 'note',
            value:
              'Watch the gender of the speaker — "my mother\'s husband is my father" only holds when "my" is not a step/adopted context.',
          },
          {
            kind: 'example',
            value:
              "A is B's sister; B is C's father; C is D's brother. D is A's nephew/niece (gender of D unknown).",
          },
        ],
      },
      {
        slug: 'blood-relations-puzzles',
        title: 'Coded relationship puzzles',
        concept: 'Coded relations',
        difficulty: 'MEDIUM',
        estimatedMinutes: 9,
        examSlugs: ['ssc', 'banking', 'railway'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Hyphen/memory codes' },
          lblock(
            'Coded questions use short tokens such as A + B (husband), A − B (brother), A × B (father). Decode the chain left-to-right, staying alert to reversal.',
          ),
          {
            kind: 'example',
            value:
              "If P × Q − R means Q is R's brother and P is Q's father, then R is P's child (gender unknown).",
          },
          {
            kind: 'note',
            value:
              'Reverse phrases ("brother of X\'s father") change the anchor person — resolve from the innermost phrase outward.',
          },
        ],
      },
    ],
  },
  {
    slug: 'seating-arrangement',
    title: 'Seating Arrangement',
    summary: 'Linear and circular arrangement deductions.',
    lessons: [
      {
        slug: 'seating-linear',
        title: 'Linear arrangements',
        concept: 'Linear seating',
        difficulty: 'MEDIUM',
        estimatedMinutes: 8,
        examSlugs: ['ssc', 'banking'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Build a straight line' },
          lblock(
            'Place one clue that fixes an absolute position first (e.g. "A sits at an extreme end"), then attach relative clues around it.',
          ),
          {
            kind: 'note',
            value:
              'Distinguish "facing north" left/right from "facing south" — left and right swap with the facing direction.',
          },
          {
            kind: 'example',
            value:
              'Six people in a row facing north. If B sits third from left and C is immediately right of B, C is position 4.',
          },
        ],
      },
      {
        slug: 'seating-circular',
        title: 'Circular arrangements',
        concept: 'Circular seating',
        difficulty: 'HARD',
        estimatedMinutes: 10,
        examSlugs: ['ssc', 'banking', 'placement'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Circles and facing' },
          lblock(
            'On a circle, "immediate right" depends on whether everyone faces the centre or outside. Fix the circle by anchoring a person first.',
          ),
          {
            kind: 'formula',
            value:
              'Facing centre: clockwise = your right   •   Facing outside: clockwise = your left',
          },
          {
            kind: 'example',
            value:
              "Eight friends around a table facing the centre with A and B opposite: A at 12, B at 6; C 2 seats right of A sits at 3 o'clock.",
          },
        ],
      },
    ],
  },
];

const SEED_LEARNING_VERBAL: SeedLearningTopic[] = [
  {
    slug: 'reading-comprehension',
    title: 'Reading Comprehension',
    summary: 'Purpose, inference and vocabulary within passages.',
    topicSlug: 'reading-comprehension',
    lessons: [
      {
        slug: 'reading-comprehension-strategy',
        title: 'Active reading strategy',
        concept: 'Comprehension strategy',
        difficulty: 'MEDIUM',
        estimatedMinutes: 8,
        examSlugs: ['ssc', 'banking', 'placement'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Skim, map, then attack the questions' },
          lblock(
            'Before reading questions, skim the passage for its topic and tone, then read the questions and return to the passage for evidence.',
          ),
          {
            kind: 'list',
            value: 'A reliable sequence',
            items: [
              'Read the first and last sentence of each paragraph',
              "Identify the author's stance (supportive, critical, neutral)",
              'Find the exact line supporting each answer',
            ],
          },
          {
            kind: 'note',
            value:
              'Inference questions ask what can be concluded, not what is explicitly printed — but never further than the text implies.',
          },
          {
            kind: 'example',
            value:
              'A passage praising free trade yet conceding short-term job losses: "critical of free trade" is wrong; "cautiously supportive" fits better.',
          },
        ],
      },
      {
        slug: 'reading-comprehension-vocabulary',
        title: 'Vocabulary in context',
        concept: 'Contextual vocabulary',
        difficulty: 'MEDIUM',
        estimatedMinutes: 7,
        examSlugs: ['ssc', 'banking'],
        practiceCount: 3,
        content: [
          { kind: 'heading', value: 'Let the sentence define the word' },
          lblock(
            'A word like "salient" rarely needs its dictionary meaning if the sentence gives contrast ("unlike trivial details, the salient points…").',
          ),
          {
            kind: 'note',
            value:
              "Beware answer choices that are valid synonyms but clash with the sentence's sense — context always beats isolated definitions.",
          },
        ],
      },
    ],
  },
  {
    slug: 'sentence-correction',
    title: 'Sentence Correction',
    summary: 'Subject–verb agreement, parallelism and tense errors.',
    lessons: [
      {
        slug: 'sentence-correction-agreement',
        title: 'Subject–verb agreement',
        concept: 'Agreement rules',
        difficulty: 'EASY',
        estimatedMinutes: 7,
        examSlugs: ['ssc', 'banking', 'placement'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Find the real subject' },
          lblock(
            'The verb agrees with the subject, not with the nouns in between. Ignore prepositional phrases when locating the subject.',
          ),
          {
            kind: 'formula',
            value:
              'Singular subject → singular verb; plural subject → plural verb (regardless of interrupter)',
          },
          {
            kind: 'example',
            value:
              'The committee of teachers {was/were} divided. "Committee" is singular even though teachers are plural → "was" (collective noun treated as one body).',
          },
          {
            kind: 'note',
            value:
              '"Each", "every", "neither" and "either" take singular verbs even when they sound plural.',
          },
        ],
      },
      {
        slug: 'sentence-correction-parallelism',
        title: 'Parallel structure',
        concept: 'Parallelism',
        difficulty: 'MEDIUM',
        estimatedMinutes: 8,
        examSlugs: ['ssc', 'banking', 'railway'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Keep the list in one form' },
          lblock(
            'Items joined by "and", "or" or "but" must share the same grammatical shape: all nouns, all to-infinitives, or all -ing forms.',
          ),
          {
            kind: 'example',
            value:
              'Wrong: "They enjoy to swim, hiking and to bike." Right: "They enjoy swimming, hiking and biking."',
          },
          {
            kind: 'note',
            value:
              'Parallelism also applies to comparisons — "more to gain than to lose" beats "more to gain than losing".',
          },
        ],
      },
    ],
  },
  {
    slug: 'para-jumbles',
    title: 'Para Jumbles',
    summary: 'Reordering sentences into a coherent paragraph.',
    lessons: [
      {
        slug: 'para-jumbles-opening',
        title: 'Finding the opening sentence',
        concept: 'Opening sentence cues',
        difficulty: 'MEDIUM',
        estimatedMinutes: 7,
        examSlugs: ['ssc', 'banking', 'placement'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'The first sentence stands alone' },
          lblock(
            'The opener introduces the topic without pronouns like "it" or connectives like "therefore", "also" or "but" that presuppose prior text.',
          ),
          {
            kind: 'note',
            value:
              'A sentence naming a subject generically ("The honeybee is…") typically opens; specific follow-ups ("Such bees…") must come later.',
          },
          {
            kind: 'example',
            value:
              '"Bees pollinate crops." then "These insects also produce honey." — the second uses "these", proving it follows the first.',
          },
        ],
      },
      {
        slug: 'para-jumbles-linking',
        title: 'Linking and closing sentences',
        concept: 'Cohesion and conclusion',
        difficulty: 'HARD',
        estimatedMinutes: 9,
        examSlugs: ['ssc', 'banking'],
        practiceCount: 4,
        content: [
          { kind: 'heading', value: 'Connectors chain the paragraph' },
          lblock(
            'Order sentences so each one references something already introduced. Concluding sentences summarise ("in short", "thus") or offer a net judgement.',
          ),
          {
            kind: 'example',
            value:
              'Event sentence → cause → effect → general principle is a common exam skeleton: cause chains earlier, principle (with "hence") ends.',
          },
          {
            kind: 'note',
            value:
              "When two orders both look legal, prefer the one where the second sentence's first noun repeats the previous paragraph's last noun.",
          },
        ],
      },
    ],
  },
];

async function seedLearning(): Promise<void> {
  const authored = [
    { pathSlug: 'quantitative', topics: SEED_LEARNING_QUANT },
    { pathSlug: 'logical-reasoning', topics: SEED_LEARNING_LOGICAL },
    { pathSlug: 'verbal', topics: SEED_LEARNING_VERBAL },
  ] as const;

  // One published path per aptitude domain so all seven appear in Explore.
  const pathBySlug = new Map<string, { id: string; categoryId: string }>();
  for (const category of CATEGORIES) {
    const dbCategory = await prisma.category.findUniqueOrThrow({
      where: { slug: category.slug },
    });
    const path = await prisma.learningPath.upsert({
      where: { slug: category.slug },
      update: {
        title: category.name,
        description: category.description,
        status: 'PUBLISHED',
        icon: category.icon,
        order: category.sortOrder,
        difficulty: 'MEDIUM',
        accessLevel: 'FREE',
      },
      create: {
        slug: category.slug,
        title: category.name,
        description: category.description,
        categoryId: dbCategory.id,
        status: 'PUBLISHED',
        difficulty: 'MEDIUM',
        icon: category.icon,
        estimatedMinutes: 0,
        accessLevel: 'FREE',
        order: category.sortOrder,
      },
    });
    pathBySlug.set(category.slug, { id: path.id, categoryId: dbCategory.id });
  }

  for (const domain of authored) {
    const path = pathBySlug.get(domain.pathSlug);
    if (!path) {
      continue;
    }
    let pathMinutes = 0;
    for (const [topicIndex, seedTopic] of domain.topics.entries()) {
      const topic = await prisma.learningTopic.upsert({
        where: { pathId_slug: { pathId: path.id, slug: seedTopic.slug } },
        update: {
          title: seedTopic.title,
          summary: seedTopic.summary,
          status: 'PUBLISHED',
          order: topicIndex,
        },
        create: {
          pathId: path.id,
          slug: seedTopic.slug,
          title: seedTopic.title,
          summary: seedTopic.summary,
          status: 'PUBLISHED',
          order: topicIndex,
        },
      });
      const concept = await prisma.learningConcept.upsert({
        where: { topicId_slug: { topicId: topic.id, slug: `${seedTopic.slug}-concepts` } },
        update: { title: seedTopic.lessons[0]?.concept ?? seedTopic.title, status: 'PUBLISHED' },
        create: {
          topicId: topic.id,
          slug: `${seedTopic.slug}-concepts`,
          title: seedTopic.lessons[0]?.concept ?? seedTopic.title,
          status: 'PUBLISHED',
          order: 0,
        },
      });

      for (const [lessonIndex, seedLesson] of seedTopic.lessons.entries()) {
        const lesson = await prisma.learningLesson.upsert({
          where: { topicId_slug: { topicId: topic.id, slug: seedLesson.slug } },
          update: {
            title: seedLesson.title,
            conceptId: concept.id,
            difficulty: seedLesson.difficulty,
            content: seedLesson.content as unknown as Prisma.InputJsonValue,
            estimatedMinutes: seedLesson.estimatedMinutes,
            status: 'PUBLISHED',
            order: lessonIndex,
          },
          create: {
            topicId: topic.id,
            conceptId: concept.id,
            slug: seedLesson.slug,
            title: seedLesson.title,
            difficulty: seedLesson.difficulty,
            content: seedLesson.content as unknown as Prisma.InputJsonValue,
            estimatedMinutes: seedLesson.estimatedMinutes,
            status: 'PUBLISHED',
            order: lessonIndex,
          },
        });

        await prisma.learningLessonExam.deleteMany({ where: { lessonId: lesson.id } });
        for (const examSlug of seedLesson.examSlugs) {
          const tag = await prisma.examTag.findUnique({ where: { slug: examSlug } });
          if (tag) {
            await prisma.learningLessonExam
              .create({ data: { lessonId: lesson.id, examTagId: tag.id } })
              .catch(() => undefined);
          }
        }

        await prisma.learningLessonProblem.deleteMany({ where: { lessonId: lesson.id } });
        const anchor = seedTopic.topicSlug
          ? await prisma.topic.findUnique({
              where: {
                categoryId_slug: { categoryId: path.categoryId, slug: seedTopic.topicSlug },
              },
            })
          : undefined;
        const problems = anchor
          ? await prisma.problem.findMany({
              where: { status: 'PUBLISHED', topicId: anchor.id },
              take: seedLesson.practiceCount,
              orderBy: { createdAt: 'asc' },
            })
          : await prisma.problem.findMany({
              where: { status: 'PUBLISHED', categoryId: path.categoryId },
              take: seedLesson.practiceCount,
              orderBy: { createdAt: 'asc' },
            });
        for (const [problemIndex, problem] of problems.entries()) {
          await prisma.learningLessonProblem
            .create({
              data: {
                lessonId: lesson.id,
                problemId: problem.id,
                practiceCount: seedLesson.practiceCount,
                order: problemIndex,
              },
            })
            .catch(() => undefined);
        }
      }

      const topicMinutes = seedTopic.lessons.reduce(
        (sum, lesson) => sum + lesson.estimatedMinutes,
        0,
      );
      pathMinutes += topicMinutes;
      await prisma.learningTopic.update({
        where: { id: topic.id },
        data: { lessonCount: seedTopic.lessons.length, estimatedMinutes: topicMinutes },
      });
    }
    await prisma.learningPath.update({
      where: { id: path.id },
      data: { estimatedMinutes: pathMinutes },
    });
  }
}

async function main(): Promise<void> {
  // Dev seed must never run against production: it creates fake users and
  // content. Production uses `db:bootstrap` (structural data only).
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_SEED !== 'true') {
    throw new Error(
      'Refusing to run the development seed with NODE_ENV=production. ' +
        'Use `db:bootstrap` for production structural data instead.',
    );
  }
  await seedRbac(prisma);
  await seedUsers();
  await seedTaxonomy(prisma);
  await seedRewards(prisma);
  await seedOrganizations(prisma);
  seedLocalAssets();
  await seedProblems();
  await seedLearning();
  const learning = await prisma.learningLesson.count();
  process.stdout.write(
    `Seeded ${ROLES.length} roles, ${PERMISSIONS.length} permissions, ${DEV_USERS.length} dev users, ` +
      `${CATEGORIES.length} categories, ${TOPICS.length} topics, ${SUBTOPICS.length} subtopics, ` +
      `${EXAM_TAGS.length} exam tags, ${PROBLEMS.length} problems, ${learning} learning lessons, ` +
      `${REWARD_RULES.length} reward rules, ${ACHIEVEMENTS.length} achievements.\n`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
