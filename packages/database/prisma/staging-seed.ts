import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '../generated/client';
import { seedOrganizations, seedRbac, seedRewards, seedTaxonomy } from './seed-data';

/**
 * Staging/demo seed: a realistic, explicitly synthetic world for staging,
 * internal testing, and portfolio demos. Everything is namespaced
 * `@staging.apteez.dev` / "Staging …" so demo rows can never be mistaken
 * for production user data.
 *
 * Contents: 5 demo accounts (learner → admin), 11 problems (10 PUBLISHED +
 * 1 DRAFT), practice history + streak + achievement for the advanced
 * learner, favorites, 1 completed challenge with ratings, 1 past + 1 open
 * contest with results, 1 open public event + 1 private draft event,
 * discussions + a report, contributions in all four states (one minted),
 * a 3-item reward catalog, a small point ledger + redemption, and 2
 * inbox notifications.
 *
 * What it NEVER does: seed analytics_events (journeys generate real rows
 * through the API), create embeddings (the pipeline owns those), or invent
 * production analytics.
 *
 * Safety:
 * - Refuses NODE_ENV=production unless STAGING_SEED_ALLOW=true.
 * - Refuses databases containing non-demo, non-dev users unless
 *   STAGING_SEED_FORCE=true.
 * - Fully upsert-based: safe to re-run.
 *
 *   pnpm --filter @apteez/database db:seed:staging
 */
const prisma = new PrismaClient();

const STAGING_PASSWORD = process.env.STAGING_PASSWORD ?? 'staging-demo-only';

function stagingPasswordHash(): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(STAGING_PASSWORD, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt}$${derived.toString('hex')}`;
}

const DAY = 86_400_000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY);
const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY);

const DEMO_USERS = [
  {
    email: 'learner@staging.apteez.dev',
    username: 'staging_learner',
    displayName: 'Staging Learner',
    bio: 'Demo account: new aptitude learner.',
    roles: ['user'],
  },
  {
    email: 'advanced@staging.apteez.dev',
    username: 'staging_advanced',
    displayName: 'Staging Advanced',
    bio: 'Demo account: experienced solver with history.',
    roles: ['user'],
  },
  {
    email: 'organizer@staging.apteez.dev',
    username: 'staging_organizer',
    displayName: 'Staging Organizer',
    bio: 'Demo account: runs contests and events.',
    roles: ['user', 'admin'],
  },
  {
    email: 'moderator@staging.apteez.dev',
    username: 'staging_moderator',
    displayName: 'Staging Moderator',
    bio: 'Demo account: reviews community content.',
    roles: ['user', 'admin'],
  },
  {
    email: 'admin@staging.apteez.dev',
    username: 'staging_admin',
    displayName: 'Staging Admin',
    bio: 'Demo account: platform administration.',
    roles: ['user', 'admin'],
  },
];

interface StagingProblem {
  key: string;
  title: string;
  statement: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  rating: number;
  explanation: string;
  categorySlug: string;
  topicSlug: string;
  examSlugs: string[];
  status: 'PUBLISHED' | 'DRAFT';
  options: Array<{ text: string; isCorrect?: boolean }>;
}

const STAGING_PROBLEMS: StagingProblem[] = [
  {
    key: 'staging-prob-01',
    title: 'Staging: trains crossing a platform',
    statement:
      'A 240 m train crosses a 360 m platform in 30 seconds. What is the speed of the train in km/h?',
    difficulty: 'EASY',
    rating: 1000,
    explanation: 'Total distance 600 m in 30 s = 20 m/s = 72 km/h.',
    categorySlug: 'quantitative',
    topicSlug: 'speed-and-distance',
    examSlugs: ['ssc', 'railway'],
    status: 'PUBLISHED',
    options: [
      { text: '60 km/h' },
      { text: '72 km/h', isCorrect: true },
      { text: '80 km/h' },
      { text: '90 km/h' },
    ],
  },
  {
    key: 'staging-prob-02',
    title: 'Staging: paired work with a holiday gap',
    statement:
      'Ravi can finish a project in 20 days and Sita in 30 days. They start together but Ravi leaves after 8 days. How many total days does the project take?',
    difficulty: 'MEDIUM',
    rating: 1300,
    explanation:
      '8 days joint = 8 × (1/20 + 1/30) = 2/3 done; Sita finishes 1/3 alone in 10 days; total 18 days.',
    categorySlug: 'quantitative',
    topicSlug: 'time-and-work',
    examSlugs: ['banking', 'placement'],
    status: 'PUBLISHED',
    options: [
      { text: '16 days' },
      { text: '18 days', isCorrect: true },
      { text: '20 days' },
      { text: '22 days' },
    ],
  },
  {
    key: 'staging-prob-03',
    title: 'Staging: odd one out in a series',
    statement: 'Find the odd one out: 121, 144, 169, 190, 225.',
    difficulty: 'EASY',
    rating: 1000,
    explanation: 'All except 190 are perfect squares (11², 12², 13², 15²).',
    categorySlug: 'logical-reasoning',
    topicSlug: 'number-series',
    examSlugs: ['ssc', 'general'],
    status: 'PUBLISHED',
    options: [{ text: '144' }, { text: '169' }, { text: '190', isCorrect: true }, { text: '225' }],
  },
  {
    key: 'staging-prob-04',
    title: 'Staging: coded blood relation',
    statement:
      'A is the mother of B. B is the sister of C. C is the father of D. How is A related to D?',
    difficulty: 'MEDIUM',
    rating: 1200,
    explanation: 'A → B (sister) → C (father of D): A is the grandmother of D.',
    categorySlug: 'logical-reasoning',
    topicSlug: 'blood-relations',
    examSlugs: ['banking'],
    status: 'PUBLISHED',
    options: [
      { text: 'Mother' },
      { text: 'Aunt' },
      { text: 'Grandmother', isCorrect: true },
      { text: 'Sister' },
    ],
  },
  {
    key: 'staging-prob-05',
    title: 'Staging: inference from a short passage',
    statement:
      '“Cities that invested in night buses saw late-shift employment rise, while cities that cut night buses saw no such rise.” Which inference is best supported?',
    difficulty: 'MEDIUM',
    rating: 1300,
    explanation:
      'The contrast supports a link between night-bus investment and late-shift employment.',
    categorySlug: 'verbal',
    topicSlug: 'reading-comprehension',
    examSlugs: ['upsc', 'placement'],
    status: 'PUBLISHED',
    options: [
      { text: 'Night buses cause all employment to rise' },
      { text: 'Night-bus investment is linked to late-shift employment gains', isCorrect: true },
      { text: 'Cutting buses raises employment' },
      { text: 'Day buses are irrelevant everywhere' },
    ],
  },
  {
    key: 'staging-prob-06',
    title: 'Staging: bar chart totals',
    statement:
      'A bar chart shows quarterly sales (in lakh): Q1 40, Q2 55, Q3 45, Q4 60. What is the annual total?',
    difficulty: 'EASY',
    rating: 1000,
    explanation: '40 + 55 + 45 + 60 = 200 lakh.',
    categorySlug: 'data-interpretation',
    topicSlug: 'bar-charts',
    examSlugs: ['banking', 'ssc'],
    status: 'PUBLISHED',
    options: [
      { text: '180 lakh' },
      { text: '200 lakh', isCorrect: true },
      { text: '210 lakh' },
      { text: '195 lakh' },
    ],
  },
  {
    key: 'staging-prob-07',
    title: 'Staging: SEND + MORE alphametic check',
    statement:
      'In the alphametic SEND + MORE = MONEY, each letter is a distinct digit and M is non-zero. What is the value of M?',
    difficulty: 'HARD',
    rating: 1600,
    explanation: 'The sum of two 4-digit numbers yields a 5-digit number, so M = 1.',
    categorySlug: 'cryptarithmetic',
    topicSlug: 'alphametics',
    examSlugs: ['gate', 'general'],
    status: 'PUBLISHED',
    options: [{ text: '0' }, { text: '1', isCorrect: true }, { text: '2' }, { text: '9' }],
  },
  {
    key: 'staging-prob-08',
    title: 'Staging: rotating arrow figure',
    statement:
      'An arrow rotates 90° clockwise, then 180°, then 90° counter-clockwise each step. After 3 steps from north, where does it point?',
    difficulty: 'MEDIUM',
    rating: 1200,
    explanation: 'Net rotation = 90 + 180 − 90 = 180°, so north becomes south.',
    categorySlug: 'visual',
    topicSlug: 'figure-series',
    examSlugs: ['ssc', 'general'],
    status: 'PUBLISHED',
    options: [
      { text: 'North' },
      { text: 'East' },
      { text: 'South', isCorrect: true },
      { text: 'West' },
    ],
  },
  {
    key: 'staging-prob-09',
    title: 'Staging: allocation game equilibrium',
    statement:
      'Two players alternately claim cells of a 3×3 grid, first to own a full row wins. With perfect play, what is the outcome?',
    difficulty: 'HARD',
    rating: 1600,
    explanation: 'The second player mirrors to block every row threat; perfect play draws.',
    categorySlug: 'game-based',
    topicSlug: 'resource-games',
    examSlugs: ['placement', 'general'],
    status: 'PUBLISHED',
    options: [
      { text: 'First player always wins' },
      { text: 'Draw with perfect play', isCorrect: true },
      { text: 'Second player always wins' },
      { text: 'Depends on the first cell' },
    ],
  },
  {
    key: 'staging-prob-10',
    title: 'Staging: successive percentage reversal',
    statement: 'A price rises by 25% and then falls by 20%. What is the net change?',
    difficulty: 'EASY',
    rating: 1000,
    explanation: '1.25 × 0.8 = 1.0 — back to the original price.',
    categorySlug: 'quantitative',
    topicSlug: 'percentages',
    examSlugs: ['banking', 'ssc'],
    status: 'PUBLISHED',
    options: [
      { text: '5% increase' },
      { text: 'No net change', isCorrect: true },
      { text: '5% decrease' },
      { text: '2% increase' },
    ],
  },
  {
    key: 'staging-prob-11-draft',
    title: 'Staging DRAFT: unreviewed mixture sketch',
    statement: 'Draft sketch for reviewers: two mixtures combine in ratio 2:3 — numbers pending.',
    difficulty: 'MEDIUM',
    rating: 1200,
    explanation: 'Pending reviewer input.',
    categorySlug: 'quantitative',
    topicSlug: 'percentages',
    examSlugs: [],
    status: 'DRAFT',
    options: [{ text: 'Pending A' }, { text: 'Pending B', isCorrect: true }],
  },
];

async function guard(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.STAGING_SEED_ALLOW !== 'true') {
    throw new Error(
      'Refusing to run the staging seed with NODE_ENV=production. ' +
        'Set STAGING_SEED_ALLOW=true only on an isolated staging database.',
    );
  }
  const foreign = await prisma.user.count({
    where: {
      email: { not: { endsWith: '@staging.apteez.dev' } },
      NOT: { email: { endsWith: '@apteez.dev' } },
    },
  });
  if (foreign > 0 && process.env.STAGING_SEED_FORCE !== 'true') {
    throw new Error(
      `Staging seed found ${foreign} non-demo user(s). Refusing to mix demo data into a foreign ` +
        `database — use a fresh database or set STAGING_SEED_FORCE=true.`,
    );
  }
}

async function seedDemoUsers(): Promise<Record<string, string>> {
  const passwordHash = stagingPasswordHash();
  const ids: Record<string, string> = {};
  for (const demo of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { displayName: demo.displayName, bio: demo.bio, passwordHash, isActive: true },
      create: {
        email: demo.email,
        username: demo.username,
        displayName: demo.displayName,
        bio: demo.bio,
        passwordHash,
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    ids[demo.email] = user.id;
    for (const roleName of demo.roles) {
      const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }
  }
  return ids;
}

interface StagingProblemRow {
  id: string;
  key: string;
  options: Array<{ id: string; isCorrect: boolean }>;
}

async function seedStagingProblems(): Promise<StagingProblemRow[]> {
  const rows: StagingProblemRow[] = [];
  for (const seed of STAGING_PROBLEMS) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: seed.categorySlug },
    });
    const topic = await prisma.topic.findFirstOrThrow({
      where: { slug: seed.topicSlug, categoryId: category.id },
      select: { id: true },
    });
    const problem = await prisma.problem.upsert({
      where: { id: stagingUuid(seed.key) },
      update: {
        title: seed.title,
        statement: seed.statement,
        difficulty: seed.difficulty,
        rating: seed.rating,
        status: seed.status,
        publishedAt: seed.status === 'PUBLISHED' ? daysAgo(20) : null,
      },
      create: {
        id: stagingUuid(seed.key),
        title: seed.title,
        statement: seed.statement,
        difficulty: seed.difficulty,
        rating: seed.rating,
        status: seed.status,
        explanation: seed.explanation,
        source: 'ApteeZ staging seed',
        categoryId: category.id,
        topicId: topic.id,
        publishedAt: seed.status === 'PUBLISHED' ? daysAgo(20) : null,
      },
      select: { id: true },
    });
    // Idempotent options: wipe-and-rewrite is unsafe with Restrict FKs, so
    // upsert by position.
    for (const [position, option] of seed.options.entries()) {
      await prisma.problemOption.upsert({
        where: { problemId_position: { problemId: problem.id, position } },
        update: { text: option.text, isCorrect: option.isCorrect === true },
        create: {
          problemId: problem.id,
          position,
          text: option.text,
          isCorrect: option.isCorrect === true,
        },
        select: { id: true },
      });
    }
    for (const examSlug of seed.examSlugs) {
      const tag = await prisma.examTag.findUnique({ where: { slug: examSlug } });
      if (tag) {
        await prisma.problemExam.upsert({
          where: { problemId_examTagId: { problemId: problem.id, examTagId: tag.id } },
          update: {},
          create: { problemId: problem.id, examTagId: tag.id },
        });
      }
    }
    const options = await prisma.problemOption.findMany({
      where: { problemId: problem.id },
      select: { id: true, isCorrect: true },
      orderBy: { position: 'asc' },
    });
    rows.push({ id: problem.id, key: seed.key, options });
  }
  return rows;
}

/**
 * Stable deterministic UUIDs per staging key (upsert-safe re-runs).
 * sha256 hex shaped into v4 layout (version + variant bits fixed).
 */
function stagingUuid(key: string): string {
  const hex = createHash('sha256').update(`apteez-staging:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function main(): Promise<void> {
  await guard();
  await seedRbac(prisma);
  await seedTaxonomy(prisma);
  await seedRewards(prisma);
  await seedOrganizations(prisma);
  const users = await seedDemoUsers();
  const learner = users['learner@staging.apteez.dev']!;
  const advanced = users['advanced@staging.apteez.dev']!;
  const organizer = users['organizer@staging.apteez.dev']!;
  const moderator = users['moderator@staging.apteez.dev']!;
  const problems = await seedStagingProblems();
  const published = problems.filter((row) => !row.key.endsWith('-draft'));

  // ── Practice history: advanced solved 6/8 across 10 days ──
  const historyPlan = [true, true, false, true, true, false, true, true];
  for (const [index, correct] of historyPlan.entries()) {
    const problem = published[index % published.length]!;
    const option = correct
      ? problem.options.find((row) => row.isCorrect)!
      : problem.options.find((row) => !row.isCorrect)!;
    const day = daysAgo(10 - index);
    await prisma.submission.upsert({
      where: { id: stagingUuid(`sub-adv-${index}`) },
      update: {},
      create: {
        id: stagingUuid(`sub-adv-${index}`),
        userId: advanced,
        problemId: problem.id,
        status: 'SUBMITTED',
        selectedOptionId: option.id,
        isCorrect: correct,
        timeSpentSeconds: 60 + index * 7,
        startedAt: day,
        submittedAt: new Date(day.getTime() + 90_000),
        createdAt: day,
        context: 'PRACTICE',
      },
    });
  }
  // Learner: one solved problem (drives first-solve + favorites demo).
  const learnerProblem = published[0]!;
  const learnerOption = learnerProblem.options.find((row) => row.isCorrect)!;
  await prisma.submission.upsert({
    where: { id: stagingUuid('sub-learner-01') },
    update: {},
    create: {
      id: stagingUuid('sub-learner-01'),
      userId: learner,
      problemId: learnerProblem.id,
      status: 'SUBMITTED',
      selectedOptionId: learnerOption.id,
      isCorrect: true,
      timeSpentSeconds: 120,
      startedAt: daysAgo(1),
      submittedAt: daysAgo(1),
      context: 'PRACTICE',
    },
  });

  // ── Favorites + streak + achievement for the demo narrative ──
  const collection = await prisma.favoriteCollection.upsert({
    where: { ownerId_name: { ownerId: learner, name: 'Favorites' } },
    update: {},
    create: { ownerId: learner, name: 'Favorites', isDefault: true, defaultSlot: learner },
    select: { id: true },
  });
  for (const problem of published.slice(0, 2)) {
    await prisma.favoriteCollectionItem.upsert({
      where: { collectionId_problemId: { collectionId: collection.id, problemId: problem.id } },
      update: {},
      create: { collectionId: collection.id, problemId: problem.id },
    });
  }
  await prisma.userStreak.upsert({
    where: { userId: advanced },
    update: { currentCount: 6, longestCount: 6, lastActiveDate: new Date() },
    create: { userId: advanced, currentCount: 6, longestCount: 6, lastActiveDate: new Date() },
  });
  const firstSolve = await prisma.achievement.findUnique({ where: { key: 'first-solve' } });
  if (firstSolve) {
    await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId: advanced, achievementId: firstSolve.id } },
      update: {},
      create: { userId: advanced, achievementId: firstSolve.id },
    });
  }

  // ── Point ledger (explainable running balances) + one redemption ──
  const ledgerPlan = [
    { amount: 10, reason: 'rule:problem-solve', description: 'Problem solved', days: 9 },
    { amount: 10, reason: 'rule:problem-solve', description: 'Problem solved', days: 4 },
    { amount: 25, reason: 'rule:challenge-complete', description: 'Duel completed', days: 2 },
  ];
  let balance = 0;
  for (const [index, entry] of ledgerPlan.entries()) {
    balance += entry.amount;
    await prisma.pointTransaction.upsert({
      where: { id: stagingUuid('ledger-' + (index + 1)) },
      update: {},
      create: {
        id: stagingUuid('ledger-' + (index + 1)),
        userId: advanced,
        amount: entry.amount,
        balanceAfter: balance,
        type: 'EARN',
        reason: entry.reason,
        description: entry.description,
        createdAt: daysAgo(entry.days),
      },
    });
  }
  await prisma.userPoints.upsert({
    where: { userId: advanced },
    update: { balance, lifetimeEarned: balance, lifetimeSpent: 0 },
    create: { userId: advanced, balance, lifetimeEarned: balance, lifetimeSpent: 0 },
  });
  let sticker = await prisma.reward.findFirst({ where: { name: 'Staging Sticker Pack' } });
  if (!sticker) {
    sticker = await prisma.reward.create({
      data: {
        name: 'Staging Sticker Pack',
        description: 'Demo catalog item: laptop stickers.',
        category: 'merch',
        pointsCost: 40,
        stockQuantity: null,
        isActive: true,
      },
    });
    await prisma.reward.create({
      data: {
        name: 'Staging Pro Month (paused)',
        description: 'Demo catalog item: currently inactive.',
        category: 'subscription',
        pointsCost: 500,
        isActive: false,
      },
    });
    await prisma.reward.create({
      data: {
        name: 'Staging Hoodie (2 left)',
        description: 'Demo catalog item: limited stock.',
        category: 'merch',
        pointsCost: 300,
        stockQuantity: 2,
        isActive: true,
      },
    });
  }
  await prisma.rewardRedemption.upsert({
    where: { id: stagingUuid('redemption-1') },
    update: {},
    create: {
      id: stagingUuid('redemption-1'),
      userId: advanced,
      rewardId: sticker.id,
      pointsCost: 40,
      status: 'PENDING',
      idempotencyKey: 'staging-redeem-1',
    },
  });

  // ── Completed challenge: learner vs advanced, advanced wins ──
  const quant = await prisma.category.findUniqueOrThrow({ where: { slug: 'quantitative' } });
  const challengeProblems = published.slice(0, 3);
  const challenge = await prisma.challenge.upsert({
    where: { id: stagingUuid('challenge-01') },
    update: {},
    create: {
      id: stagingUuid('challenge-01'),
      domainSlug: 'quantitative',
      categoryId: quant.id,
      player1Id: learner,
      player2Id: advanced,
      player1RatingSnapshot: 1000,
      player2RatingSnapshot: 1010,
      status: 'COMPLETED',
      outcome: 'PLAYER2_WIN',
      completionReason: 'COMPLETED',
      winnerId: advanced,
      player1Score: 1,
      player2Score: 3,
      player1Correct: 1,
      player2Correct: 3,
      player1Wrong: 2,
      player2Wrong: 0,
      player1Unanswered: 0,
      player2Unanswered: 0,
      questionCount: 3,
      durationSeconds: 300,
      minReadingSeconds: 5,
      ratingStatus: 'COMPLETED',
      ratingProcessedAt: daysAgo(2),
      ratingAttempts: 1,
      matchedAt: daysAgo(2),
      startedAt: daysAgo(2),
      endsAt: new Date(daysAgo(2).getTime() + 300_000),
      endedAt: daysAgo(2),
      createdAt: daysAgo(2),
    },
    select: { id: true },
  });
  for (const [position, problem] of challengeProblems.entries()) {
    const question = await prisma.challengeQuestion.upsert({
      where: { challengeId_position: { challengeId: challenge.id, position } },
      update: {},
      create: { challengeId: challenge.id, problemId: problem.id, position },
      select: { id: true },
    });
    const correct = problem.options.find((row) => row.isCorrect)!;
    const wrong = problem.options.find((row) => !row.isCorrect)!;
    // Advanced sweeps; learner takes only the first.
    await prisma.challengeAnswer.upsert({
      where: {
        challengeQuestionId_playerId: { challengeQuestionId: question.id, playerId: advanced },
      },
      update: {},
      create: {
        challengeId: challenge.id,
        challengeQuestionId: question.id,
        playerId: advanced,
        selectedOptionId: correct.id,
        isCorrect: true,
        answeredAt: daysAgo(2),
        responseTimeMs: 15000,
      },
    });
    await prisma.challengeAnswer.upsert({
      where: {
        challengeQuestionId_playerId: { challengeQuestionId: question.id, playerId: learner },
      },
      update: {},
      create: {
        challengeId: challenge.id,
        challengeQuestionId: question.id,
        playerId: learner,
        selectedOptionId: position === 0 ? correct.id : wrong.id,
        isCorrect: position === 0,
        answeredAt: daysAgo(2),
        responseTimeMs: 45000,
      },
    });
  }
  await prisma.challengeRating.upsert({
    where: { userId_domainSlug: { userId: learner, domainSlug: 'quantitative' } },
    update: { rating: 1000, gamesPlayed: 1, losses: 1, lastPlayedAt: daysAgo(2) },
    create: {
      userId: learner,
      domainSlug: 'quantitative',
      categoryId: quant.id,
      rating: 1000,
      gamesPlayed: 1,
      losses: 1,
      lastPlayedAt: daysAgo(2),
    },
  });
  await prisma.challengeRating.upsert({
    where: { userId_domainSlug: { userId: advanced, domainSlug: 'quantitative' } },
    update: { rating: 1000, gamesPlayed: 1, wins: 1, lastPlayedAt: daysAgo(2) },
    create: {
      userId: advanced,
      domainSlug: 'quantitative',
      categoryId: quant.id,
      rating: 1000,
      gamesPlayed: 1,
      wins: 1,
      lastPlayedAt: daysAgo(2),
    },
  });
  for (const [userId, before, after, change, result, score, oppScore] of [
    [learner, 1000, 985, -15, 'LOSS', 1, 3],
    [advanced, 1010, 1045, 35, 'WIN', 3, 1],
  ] as const) {
    await prisma.challengeRatingHistory.upsert({
      where: { challengeId_userId: { challengeId: challenge.id, userId } },
      update: {},
      create: {
        userId,
        domainSlug: 'quantitative',
        categoryId: quant.id,
        challengeId: challenge.id,
        opponentId: userId === learner ? advanced : learner,
        ratingBefore: before,
        ratingAfter: after,
        ratingChange: change,
        opponentRatingBefore: userId === learner ? 1010 : 1000,
        opponentRatingAfter: userId === learner ? 1045 : 985,
        outcome: 'PLAYER2_WIN',
        result,
        score,
        opponentScore: oppScore,
      },
    });
  }

  // ── Contests: one past (results), one open for registration ──
  const contestProblems = published.slice(3, 6);
  const past = await prisma.contest.upsert({
    where: { slug: 'staging-monsoon-sprint' },
    update: {},
    create: {
      title: 'Staging Monsoon Sprint (past)',
      slug: 'staging-monsoon-sprint',
      description: 'Demo contest: already ended, with results and ratings.',
      status: 'ENDED',
      difficulty: 'MEDIUM',
      startsAt: daysAgo(6),
      endsAt: new Date(daysAgo(6).getTime() + 3_600_000),
      durationSeconds: 3600,
      registrationOpensAt: daysAgo(9),
      registrationClosesAt: daysAgo(6),
      maxParticipants: 100,
      questionCount: 3,
      publishedAt: daysAgo(9),
      endedAt: daysAgo(6),
      ratingStatus: 'COMPLETED',
      ratingProcessedAt: daysAgo(6),
      createdById: organizer,
    },
    select: { id: true },
  });
  const pastQuestions = [];
  for (const [position, problem] of contestProblems.entries()) {
    pastQuestions.push(
      await prisma.contestQuestion.upsert({
        where: { contestId_position: { contestId: past.id, position } },
        update: {},
        create: { contestId: past.id, problemId: problem.id, position },
        select: { id: true },
      }),
    );
  }
  const pastEntries: Array<{
    userId: string;
    solved: number;
    wrong: number;
    seconds: number;
    rank: number;
  }> = [
    { userId: advanced, solved: 3, wrong: 0, seconds: 1500, rank: 1 },
    { userId: learner, solved: 2, wrong: 1, seconds: 2400, rank: 2 },
  ];
  for (const entry of pastEntries) {
    const participant = await prisma.contestParticipant.upsert({
      where: { contestId_userId: { contestId: past.id, userId: entry.userId } },
      update: {},
      create: {
        contestId: past.id,
        userId: entry.userId,
        status: 'SUBMITTED',
        ratingBefore: 1000,
        startedAt: daysAgo(6),
        effectiveEndAt: new Date(daysAgo(6).getTime() + 3_600_000),
        submittedAt: new Date(daysAgo(6).getTime() + entry.seconds * 1000),
        registeredAt: daysAgo(8),
      },
      select: { id: true },
    });
    for (const [index, question] of pastQuestions.entries()) {
      const problem = contestProblems[index]!;
      const correct = index < entry.solved;
      const option = problem.options.find((row) => row.isCorrect === correct)!;
      await prisma.contestAnswer.upsert({
        where: {
          contestQuestionId_participantId: {
            contestQuestionId: question.id,
            participantId: participant.id,
          },
        },
        update: {},
        create: {
          contestId: past.id,
          participantId: participant.id,
          contestQuestionId: question.id,
          userId: entry.userId,
          selectedOptionId: option.id,
          isCorrect: correct,
          answeredAt: daysAgo(6),
        },
      });
    }
    await prisma.contestResult.upsert({
      where: { participantId: participant.id },
      update: {},
      create: {
        contestId: past.id,
        participantId: participant.id,
        userId: entry.userId,
        solvedCount: entry.solved,
        wrongCount: entry.wrong,
        unansweredCount: 3 - entry.solved - entry.wrong,
        score: entry.solved,
        completionSeconds: entry.seconds,
        rank: entry.rank,
        status: 'COMPLETED',
        finalizedAt: daysAgo(6),
      },
    });
    await prisma.contestRatingHistory.upsert({
      where: { contestId_userId: { contestId: past.id, userId: entry.userId } },
      update: {},
      create: {
        userId: entry.userId,
        contestId: past.id,
        participantId: participant.id,
        ratingBefore: 1000,
        ratingAfter: entry.rank === 1 ? 1030 : 995,
        ratingChange: entry.rank === 1 ? 30 : -5,
        rank: entry.rank,
        score: entry.solved,
        fieldSize: 2,
      },
    });
  }
  await prisma.contestRating.upsert({
    where: { userId: advanced },
    update: { rating: 1000, contestsPlayed: 1, bestRank: 1, lastPlayedAt: daysAgo(6) },
    create: {
      userId: advanced,
      rating: 1000,
      contestsPlayed: 1,
      bestRank: 1,
      lastPlayedAt: daysAgo(6),
    },
  });
  await prisma.contestRating.upsert({
    where: { userId: learner },
    update: { rating: 1000, contestsPlayed: 1, bestRank: 2, lastPlayedAt: daysAgo(6) },
    create: {
      userId: learner,
      rating: 1000,
      contestsPlayed: 1,
      bestRank: 2,
      lastPlayedAt: daysAgo(6),
    },
  });
  const upcoming = await prisma.contest.upsert({
    where: { slug: 'staging-weekend-clash' },
    update: {},
    create: {
      title: 'Staging Weekend Clash (open)',
      slug: 'staging-weekend-clash',
      description: 'Demo contest: registration is open, starts in 3 days.',
      status: 'REGISTRATION_OPEN',
      difficulty: 'MEDIUM',
      startsAt: daysFromNow(3),
      endsAt: new Date(daysFromNow(3).getTime() + 3_600_000),
      durationSeconds: 3600,
      registrationOpensAt: daysAgo(1),
      registrationClosesAt: daysFromNow(2),
      maxParticipants: 100,
      questionCount: 3,
      publishedAt: daysAgo(1),
      createdById: organizer,
    },
    select: { id: true },
  });
  for (const [position, problem] of published.slice(6, 9).entries()) {
    await prisma.contestQuestion.upsert({
      where: { contestId_position: { contestId: upcoming.id, position } },
      update: {},
      create: { contestId: upcoming.id, problemId: problem.id, position },
    });
  }

  // ── Events: one open public quiz, one private draft ──
  const openEvent = await prisma.event.upsert({
    where: { slug: 'staging-aptitude-night' },
    update: {},
    create: {
      title: 'Staging Aptitude Night (open)',
      slug: 'staging-aptitude-night',
      description: 'Demo quiz night: registration is open.',
      eventType: 'QUIZ',
      visibility: 'PUBLIC',
      status: 'REGISTRATION_OPEN',
      difficulty: 'MEDIUM',
      maxParticipants: 50,
      registrationStartAt: daysAgo(1),
      registrationEndAt: daysFromNow(1),
      startAt: daysFromNow(2),
      endAt: new Date(daysFromNow(2).getTime() + 2 * 3_600_000),
      durationMinutes: 60,
      questionCount: 3,
      participantCount: 1,
      organizerId: organizer,
      publishedAt: daysAgo(1),
    },
    select: { id: true },
  });
  for (const [index, problem] of published.slice(0, 3).entries()) {
    await prisma.eventQuestion.upsert({
      where: { eventId_order: { eventId: openEvent.id, order: index } },
      update: {},
      create: { eventId: openEvent.id, problemId: problem.id, order: index },
    });
  }
  await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId: openEvent.id, userId: learner } },
    update: {},
    create: { eventId: openEvent.id, userId: learner, status: 'REGISTERED' },
  });
  await prisma.event.upsert({
    where: { slug: 'staging-coach-preview' },
    update: {},
    create: {
      title: 'Staging Coach Preview (private draft)',
      slug: 'staging-coach-preview',
      description: 'Demo private workshop: draft, not joinable.',
      eventType: 'WORKSHOP',
      visibility: 'PRIVATE',
      status: 'DRAFT',
      difficulty: 'EASY',
      startAt: daysFromNow(10),
      endAt: new Date(daysFromNow(10).getTime() + 3_600_000),
      organizerId: organizer,
    },
  });

  // ── Discussions + one open report ──
  const threads = [
    {
      author: advanced,
      title: 'Staging: how do you pace the last 15 minutes of SSC mocks?',
      body: 'Demo thread: sharing pacing strategies for the final stretch of SSC mock tests.',
      tags: ['exam', 'ssc'],
    },
    {
      author: organizer,
      title: 'Staging: Monsoon Sprint results are out — congrats!',
      body: 'Demo thread: celebrating the weekend contest results.',
      tags: ['contest'],
    },
    {
      author: learner,
      title: 'Staging: switching from banking to UPSC CSAT — advice?',
      body: 'Demo thread: asking the community about changing exam tracks.',
      tags: ['career'],
    },
  ];
  const postIds: string[] = [];
  for (const [index, thread] of threads.entries()) {
    const post = await prisma.discussionPost.upsert({
      where: { id: stagingUuid('thread-' + (index + 1)) },
      update: {},
      create: {
        id: stagingUuid('thread-' + (index + 1)),
        authorId: thread.author,
        title: thread.title,
        body: thread.body,
        tags: thread.tags,
        replyCount: index === 0 ? 2 : 0,
        createdAt: daysAgo(5 - index),
      },
      select: { id: true },
    });
    postIds.push(post.id);
  }
  await prisma.discussionReply.upsert({
    where: { id: stagingUuid('reply-01') },
    update: {},
    create: {
      id: stagingUuid('reply-01'),
      postId: postIds[0]!,
      authorId: moderator,
      body: 'Demo reply: bank two minutes per question and mark the rest for review.',
      createdAt: daysAgo(4),
    },
  });
  await prisma.discussionReply.upsert({
    where: { id: stagingUuid('reply-02') },
    update: {},
    create: {
      id: stagingUuid('reply-02'),
      postId: postIds[0]!,
      authorId: learner,
      body: 'Demo reply: trying the two-minute rule this week.',
      createdAt: daysAgo(3),
    },
  });
  await prisma.discussionReport.upsert({
    where: { id: stagingUuid('report-01') },
    update: {},
    create: {
      id: stagingUuid('report-01'),
      reporterId: learner,
      postId: postIds[2]!,
      reason: 'SPAM',
      detail: 'Demo report: testing the moderation queue.',
      status: 'OPEN',
      createdAt: daysAgo(1),
    },
  });

  // ── Contributions in all four states ──
  const topic = await prisma.topic.findFirstOrThrow({
    where: { slug: 'time-and-work' },
    select: { id: true },
  });
  const contributionOptions = [
    { text: '14 days', assetKey: null, isCorrect: false },
    { text: '15 days', assetKey: null, isCorrect: true },
    { text: '16 days', assetKey: null, isCorrect: false },
  ];
  await prisma.contribution.upsert({
    where: { id: stagingUuid('contrib-pending') },
    update: {},
    create: {
      id: stagingUuid('contrib-pending'),
      contributorId: learner,
      title: 'Staging contribution awaiting review',
      statement:
        'A cistern fills in 10 hours and drains in 15 hours. With both open, how long to fill? Demo pending contribution with enough length to pass the statement check.',
      options: contributionOptions,
      explanation: 'Net rate 1/10 − 1/15 = 1/30 per hour, so 30 hours.',
      difficulty: 'MEDIUM',
      topicId: topic.id,
      status: 'PENDING',
      submittedAt: daysAgo(1),
    },
  });
  await prisma.contribution.upsert({
    where: { id: stagingUuid('contrib-review') },
    update: {},
    create: {
      id: stagingUuid('contrib-review'),
      contributorId: advanced,
      title: 'Staging contribution under review',
      statement:
        'A train 180 m long passes a pole in 9 seconds. What is its speed in km/h? Demo under-review contribution with enough length to pass the statement check.',
      options: contributionOptions,
      explanation: '20 m/s = 72 km/h.',
      difficulty: 'EASY',
      topicId: topic.id,
      status: 'UNDER_REVIEW',
      reviewerId: moderator,
      submittedAt: daysAgo(3),
    },
  });
  const minted = await prisma.problem.upsert({
    where: { id: stagingUuid('minted-0001') },
    update: {},
    create: {
      id: stagingUuid('minted-0001'),
      title: 'Staging minted: cistern fill time',
      statement:
        'A cistern fills in 10 hours and drains in 15 hours. With both open, how long to fill?',
      difficulty: 'MEDIUM',
      rating: 1200,
      status: 'PUBLISHED',
      explanation: 'Net rate 1/30 per hour, so 30 hours.',
      source: 'ApteeZ staging seed (contribution)',
      categoryId: quant.id,
      topicId: topic.id,
      publishedAt: daysAgo(2),
    },
    select: { id: true },
  });
  const mintedOptions = [
    { text: '20 hours', isCorrect: false },
    { text: '30 hours', isCorrect: true },
  ];
  for (const [position, option] of mintedOptions.entries()) {
    await prisma.problemOption.upsert({
      where: { problemId_position: { problemId: minted.id, position } },
      update: {},
      create: { problemId: minted.id, position, text: option.text, isCorrect: option.isCorrect },
    });
  }
  await prisma.contribution.upsert({
    where: { id: stagingUuid('contrib-approved') },
    update: {},
    create: {
      id: stagingUuid('contrib-approved'),
      contributorId: advanced,
      title: 'Staging contribution approved earlier',
      statement: 'Approved demo contribution that became a canonical problem.',
      options: contributionOptions,
      explanation: 'Reviewed and approved by a moderator.',
      difficulty: 'MEDIUM',
      topicId: topic.id,
      status: 'APPROVED',
      reviewerId: moderator,
      submittedAt: daysAgo(5),
      reviewedAt: daysAgo(2),
      resultingProblemId: minted.id,
    },
  });
  await prisma.contribution.upsert({
    where: { id: stagingUuid('contrib-rejected') },
    update: {},
    create: {
      id: stagingUuid('contrib-rejected'),
      contributorId: learner,
      title: 'Staging contribution rejected earlier',
      statement: 'Rejected demo contribution: ambiguous wording, no single answer.',
      options: contributionOptions,
      status: 'REJECTED',
      reviewerId: moderator,
      reviewerNote: 'Demo note: ambiguous stem.',
      feedbackForContributor: 'Demo feedback: clarify the question stem.',
      submittedAt: daysAgo(6),
      reviewedAt: daysAgo(4),
    },
  });

  // ── Inbox notifications for the demo narrative ──
  await prisma.notification.upsert({
    where: { id: stagingUuid('notif-01') },
    update: {},
    create: {
      id: stagingUuid('notif-01'),
      userId: learner,
      type: 'EVENT_REGISTERED',
      title: 'Registered: Staging Aptitude Night (open)',
      body: 'Your registration was confirmed.',
      eventId: openEvent.id,
      createdAt: daysAgo(1),
    },
  });
  await prisma.notification.upsert({
    where: { id: stagingUuid('notif-02') },
    update: {},
    create: {
      id: stagingUuid('notif-02'),
      userId: advanced,
      type: 'CONTRIBUTION_APPROVED',
      title: 'Your contribution was approved.',
      body: 'It is now in the question library.',
      createdAt: daysAgo(2),
    },
  });

  process.stdout.write(
    `Staging seed complete: 5 demo users, ${STAGING_PROBLEMS.length} problems, ` +
      `1 challenge, 2 contests, 2 events, 3 threads, 4 contributions, 3 rewards.\n`,
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
