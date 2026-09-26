import type { PrismaClient } from '../generated/client';

/**
 * Shared structural seed data — the single source of truth for RBAC and the
 * content taxonomy. Imported by both:
 * - `seed.ts` (development: structural data + clearly-marked dev content), and
 * - `bootstrap.ts` (production: structural data ONLY — never users, problems,
 *   submissions, or analytics).
 *
 * Everything here is upsert-based and idempotent, so bootstrap is safe to
 * re-run after every deploy.
 */

/**
 * The platform has exactly two roles: members (`user`) and administrators
 * (`admin`). Admins hold every permission — creating problems, contests and
 * events, reviewing contributions, moderating, and managing users. There are
 * no moderator/organizer/reviewer tiers; ownership checks (created-by-me)
 * still apply per object where they exist.
 */
export const ROLES: Array<{ name: string; description: string }> = [
  { name: 'user', description: 'Default role for every registered member.' },
  { name: 'admin', description: 'Full platform administration: all permissions.' },
];

export const PERMISSIONS: Array<{ action: string; resource: string; description: string }> = [
  { action: 'read', resource: 'questions', description: 'Read the question library.' },
  { action: 'submit', resource: 'contributions', description: 'Submit questions for review.' },
  { action: 'review', resource: 'contributions', description: 'Approve or reject contributions.' },
  { action: 'manage', resource: 'questions', description: 'Create, edit and archive questions.' },
  { action: 'manage', resource: 'contests', description: 'Create and run contests.' },
  { action: 'manage', resource: 'events', description: 'Create and run events.' },
  { action: 'moderate', resource: 'discussions', description: 'Hide, lock and pin discussions.' },
  {
    action: 'manage',
    resource: 'rewards',
    description: 'Manage points, achievements and targets.',
  },
  { action: 'manage', resource: 'users', description: 'Deactivate users and assign roles.' },
  { action: 'view', resource: 'analytics', description: 'View platform analytics.' },
  { action: 'manage', resource: 'platform', description: 'Full administrative access.' },
];

export const GRANTS: Array<{ role: string; action: string; resource: string }> = [
  { role: 'user', action: 'read', resource: 'questions' },
  // Every member may submit questions for review.
  { role: 'user', action: 'submit', resource: 'contributions' },
  // Admins hold everything: content, contests, events, reviews, moderation,
  // users, analytics, and the platform bypass.
  { role: 'admin', action: 'manage', resource: 'users' },
  { role: 'admin', action: 'manage', resource: 'questions' },
  { role: 'admin', action: 'review', resource: 'contributions' },
  { role: 'admin', action: 'manage', resource: 'contests' },
  { role: 'admin', action: 'manage', resource: 'events' },
  { role: 'admin', action: 'manage', resource: 'rewards' },
  { role: 'admin', action: 'moderate', resource: 'discussions' },
  { role: 'admin', action: 'view', resource: 'analytics' },
  { role: 'admin', action: 'manage', resource: 'platform' },
];

export const CATEGORIES: Array<{
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: number;
}> = [
  {
    name: 'Quantitative Aptitude',
    slug: 'quantitative',
    description: 'Numbers, algebra, geometry and arithmetic.',
    icon: 'calculator',
    sortOrder: 1,
  },
  {
    name: 'Logical Reasoning',
    slug: 'logical-reasoning',
    description: 'Patterns, puzzles, series and deductions.',
    icon: 'puzzle',
    sortOrder: 2,
  },
  {
    name: 'Verbal Ability',
    slug: 'verbal',
    description: 'Grammar, vocabulary and comprehension.',
    icon: 'book',
    sortOrder: 3,
  },
  {
    name: 'Data Interpretation',
    slug: 'data-interpretation',
    description: 'Charts, tables and caselets.',
    icon: 'chart',
    sortOrder: 4,
  },
  {
    name: 'Visual Reasoning',
    slug: 'visual',
    description: 'Spatial and figure-based reasoning.',
    icon: 'shapes',
    sortOrder: 5,
  },
  {
    name: 'Game-Based Aptitude',
    slug: 'game-based',
    description: 'Interactive, game-style assessments.',
    icon: 'gamepad',
    sortOrder: 6,
  },
  {
    name: 'Cryptarithmetic',
    slug: 'cryptarithmetic',
    description: 'Alphametic and coded-arithmetic puzzles.',
    icon: 'key',
    sortOrder: 7,
  },
];

export const TOPICS: Array<{
  categorySlug: string;
  name: string;
  slug: string;
  description: string;
}> = [
  {
    categorySlug: 'quantitative',
    name: 'Time and Work',
    slug: 'time-and-work',
    description: 'Work rates and combined effort.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Percentages',
    slug: 'percentages',
    description: 'Percent change, mixtures and successive variation.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Number Series',
    slug: 'number-series',
    description: 'Find the missing term.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Blood Relations',
    slug: 'blood-relations',
    description: 'Family-tree deductions.',
  },
  {
    categorySlug: 'verbal',
    name: 'Reading Comprehension',
    slug: 'reading-comprehension',
    description: 'Passage-based questions.',
  },
  {
    categorySlug: 'data-interpretation',
    name: 'Bar Charts',
    slug: 'bar-charts',
    description: 'Reading and computing from bar charts.',
  },
  {
    categorySlug: 'cryptarithmetic',
    name: 'Alphametics',
    slug: 'alphametics',
    description: 'SEND + MORE style puzzles.',
  },
  {
    categorySlug: 'visual',
    name: 'Figure Series',
    slug: 'figure-series',
    description: 'Spot the transformation between figures.',
  },
  {
    categorySlug: 'game-based',
    name: 'Resource Games',
    slug: 'resource-games',
    description: 'Strategy and allocation style games.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Speed and Distance',
    slug: 'speed-and-distance',
    description: 'Relative speed, trains and boats.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Profit and Loss',
    slug: 'profit-and-loss',
    description: 'Cost price, discounts and margins.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Simple and Compound Interest',
    slug: 'interest',
    description: 'Interest growth over time.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Ratio and Proportion',
    slug: 'ratio-and-proportion',
    description: 'Ratios, partnerships and mixtures.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Averages and Mixtures',
    slug: 'averages-and-mixtures',
    description: 'Mean values and alligation.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Algebra',
    slug: 'algebra',
    description: 'Linear and quadratic equations.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Geometry and Mensuration',
    slug: 'geometry-and-mensuration',
    description: 'Shapes, areas and volumes.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Number System',
    slug: 'number-system',
    description: 'Divisibility, remainders and factors.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Probability',
    slug: 'probability',
    description: 'Chance, dice and cards.',
  },
  {
    categorySlug: 'quantitative',
    name: 'Permutations and Combinations',
    slug: 'permutations-and-combinations',
    description: 'Counting arrangements and selections.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Coding and Decoding',
    slug: 'coding-and-decoding',
    description: 'Letter and number codes.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Directions',
    slug: 'directions',
    description: 'Sense of direction and shadows.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Syllogisms',
    slug: 'syllogisms',
    description: 'Deductive statement-conclusion logic.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Seating Arrangement',
    slug: 'seating-arrangement',
    description: 'Circular and linear arrangements.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Puzzles',
    slug: 'puzzles',
    description: 'Floor, box and scheduling puzzles.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Analogies',
    slug: 'analogies',
    description: 'Word and number relationships.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Odd One Out',
    slug: 'odd-one-out',
    description: 'Classification of the misfit.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Statement and Conclusion',
    slug: 'statement-and-conclusion',
    description: 'What strictly follows.',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Data Sufficiency',
    slug: 'data-sufficiency',
    description: 'Is the given data enough?',
  },
  {
    categorySlug: 'logical-reasoning',
    name: 'Cubes and Dice',
    slug: 'cubes-and-dice',
    description: 'Folded cubes and dice faces.',
  },
  {
    categorySlug: 'verbal',
    name: 'Error Detection',
    slug: 'error-detection',
    description: 'Spot the grammatical error.',
  },
  {
    categorySlug: 'verbal',
    name: 'Sentence Correction',
    slug: 'sentence-correction',
    description: 'Choose the correct phrasing.',
  },
  {
    categorySlug: 'verbal',
    name: 'Vocabulary',
    slug: 'vocabulary',
    description: 'Synonyms, antonyms and usage.',
  },
  {
    categorySlug: 'verbal',
    name: 'Idioms and Phrases',
    slug: 'idioms-and-phrases',
    description: 'Fixed expressions and meanings.',
  },
  {
    categorySlug: 'verbal',
    name: 'Para Jumbles',
    slug: 'para-jumbles',
    description: 'Reorder the sentences.',
  },
  {
    categorySlug: 'verbal',
    name: 'Fill in the Blanks',
    slug: 'fill-in-the-blanks',
    description: 'Contextual word choice.',
  },
  {
    categorySlug: 'verbal',
    name: 'Active and Passive Voice',
    slug: 'active-and-passive-voice',
    description: 'Voice transformation.',
  },
  {
    categorySlug: 'verbal',
    name: 'Direct and Indirect Speech',
    slug: 'direct-and-indirect-speech',
    description: 'Narration conversion.',
  },
  {
    categorySlug: 'data-interpretation',
    name: 'Line Graphs',
    slug: 'line-graphs',
    description: 'Trends over time.',
  },
  {
    categorySlug: 'data-interpretation',
    name: 'Pie Charts',
    slug: 'pie-charts',
    description: 'Shares and percentages of a whole.',
  },
  {
    categorySlug: 'data-interpretation',
    name: 'Tables',
    slug: 'tables',
    description: 'Tabular data computation.',
  },
  {
    categorySlug: 'data-interpretation',
    name: 'Caselets',
    slug: 'caselets',
    description: 'Paragraph-form data sets.',
  },
  {
    categorySlug: 'data-interpretation',
    name: 'Mixed Graphs',
    slug: 'mixed-graphs',
    description: 'Combined chart formats.',
  },
  {
    categorySlug: 'visual',
    name: 'Odd Figure Out',
    slug: 'odd-figure-out',
    description: 'The figure that breaks the rule.',
  },
  {
    categorySlug: 'visual',
    name: 'Mirror and Water Images',
    slug: 'mirror-and-water-images',
    description: 'Reflections of figures.',
  },
  {
    categorySlug: 'visual',
    name: 'Paper Folding and Cutting',
    slug: 'paper-folding-and-cutting',
    description: 'Unfold the punch pattern.',
  },
  {
    categorySlug: 'visual',
    name: 'Embedded Figures',
    slug: 'embedded-figures',
    description: 'Find the hidden shape.',
  },
  {
    categorySlug: 'visual',
    name: 'Figure Completion',
    slug: 'figure-completion',
    description: 'Complete the matrix or series.',
  },
  {
    categorySlug: 'game-based',
    name: 'Pattern Games',
    slug: 'pattern-games',
    description: 'Fast sequence and matching play.',
  },
  {
    categorySlug: 'game-based',
    name: 'Memory Games',
    slug: 'memory-games',
    description: 'Recall under time pressure.',
  },
  {
    categorySlug: 'cryptarithmetic',
    name: 'Multiplication Cryptarithms',
    slug: 'multiplication-cryptarithms',
    description: 'Multi-digit coded multiplication.',
  },
];

export const SUBTOPICS: Array<{ topicSlug: string; name: string; slug: string }> = [
  { topicSlug: 'time-and-work', name: 'Pipes and Cisterns', slug: 'pipes-and-cisterns' },
  { topicSlug: 'number-series', name: 'Missing Term', slug: 'missing-term' },
];

export const EXAM_TAGS: Array<{ name: string; slug: string; description: string }> = [
  { name: 'SSC', slug: 'ssc', description: 'Staff Selection Commission exams.' },
  { name: 'Banking', slug: 'banking', description: 'IBPS, SBI and RBI exams.' },
  { name: 'TCS NQT', slug: 'tcs-nqt', description: 'TCS National Qualifier Test.' },
  { name: 'GATE', slug: 'gate', description: 'Graduate Aptitude Test in Engineering.' },
  { name: 'Placement', slug: 'placement', description: 'Campus placement drives.' },
  { name: 'Railway', slug: 'railway', description: 'RRB NTPC, Group D and related exams.' },
  { name: 'UPSC', slug: 'upsc', description: 'Civil Services aptitude (CSAT).' },
  { name: 'General', slug: 'general', description: 'Topic practice without an exam context.' },
];

/**
 * Canonical reward economy. Amounts/caps are the product contract — clients
 * can only name a rule key, never an amount. Achievement keys must match the
 * evaluator switch in `achievements.service.ts:isEligible` exactly.
 */
export const REWARD_RULES: Array<{
  key: string;
  name: string;
  description: string;
  points: number;
  category: string;
  dailyCap: number | null;
  trigger: string;
}> = [
  {
    key: 'onboarding',
    name: 'Welcome aboard',
    description: 'Complete your profile for the first time.',
    points: 50,
    category: 'onboarding',
    dailyCap: null,
    trigger: 'onboarding',
  },
  {
    key: 'problem-solve',
    name: 'Problem solved',
    description: 'Solve a practice problem.',
    points: 10,
    category: 'activity',
    dailyCap: 100,
    trigger: 'problem-solve',
  },
  {
    key: 'challenge-complete',
    name: 'Duel completed',
    description: 'Finish a rated 1v1 challenge.',
    points: 25,
    category: 'activity',
    dailyCap: 10,
    trigger: 'challenge-complete',
  },
  {
    key: 'contest-participate',
    name: 'Contest entered',
    description: 'Submit a contest entry.',
    points: 30,
    category: 'activity',
    dailyCap: 5,
    trigger: 'contest-participate',
  },
  {
    key: 'event-participate',
    name: 'Event completed',
    description: 'Complete an event you joined.',
    points: 20,
    category: 'activity',
    dailyCap: 5,
    trigger: 'event-participate',
  },
];

export const ACHIEVEMENTS: Array<{
  key: string;
  name: string;
  description: string;
  category: string;
  points: number;
}> = [
  {
    key: 'first-solve',
    name: 'First Blood',
    description: 'Solve your first problem.',
    category: 'solving',
    points: 25,
  },
  {
    key: 'solve-100',
    name: 'Century',
    description: 'Solve 100 problems.',
    category: 'solving',
    points: 100,
  },
  {
    key: 'solve-500',
    name: 'Half Millennium',
    description: 'Solve 500 problems.',
    category: 'solving',
    points: 250,
  },
  {
    key: 'solve-1000',
    name: 'Grand Thousand',
    description: 'Solve 1000 problems.',
    category: 'solving',
    points: 500,
  },
  {
    key: 'rating-1500',
    name: 'Rising Talent',
    description: 'Reach 1500 challenge rating.',
    category: 'rating',
    points: 150,
  },
  {
    key: 'streak-30',
    name: 'Monthly Grind',
    description: '30-day practice streak.',
    category: 'streak',
    points: 100,
  },
  {
    key: 'streak-50',
    name: 'Unstoppable',
    description: '50-day practice streak.',
    category: 'streak',
    points: 200,
  },
  {
    key: 'streak-100',
    name: 'Centurion Streak',
    description: '100-day practice streak.',
    category: 'streak',
    points: 400,
  },
  {
    key: 'challenge-winner',
    name: 'Duelist',
    description: 'Win your first 1v1 challenge.',
    category: 'competition',
    points: 50,
  },
  {
    key: 'contest-top-10',
    name: 'Top Ten',
    description: 'Finish top 10 in a contest.',
    category: 'competition',
    points: 150,
  },
  {
    key: 'first-contest',
    name: 'Debutant',
    description: 'Enter your first contest.',
    category: 'competition',
    points: 40,
  },
  {
    key: 'first-event',
    name: 'Explorer',
    description: 'Join your first event.',
    category: 'community',
    points: 30,
  },
  {
    key: 'contribution-approved',
    name: 'Mentor',
    description: 'Get a contributed question approved.',
    category: 'community',
    points: 60,
  },
];

/**
 * Upsert reward rules + achievements. Safe to re-run AND admin-safe: updates
 * only backfill an empty trigger, never overwrite payouts, caps or the
 * active flag — those belong to the admin console now.
 */
export async function seedRewards(prisma: PrismaClient): Promise<void> {
  for (const rule of REWARD_RULES) {
    const current = await prisma.rewardRule.findUnique({ where: { key: rule.key } });
    if (!current) {
      await prisma.rewardRule.create({ data: { ...rule, isActive: true } });
      continue;
    }
    if (!current.trigger) {
      await prisma.rewardRule.update({
        where: { key: rule.key },
        data: { trigger: rule.trigger },
      });
    }
  }
  for (const achievement of ACHIEVEMENTS) {
    const current = await prisma.achievement.findUnique({ where: { key: achievement.key } });
    if (!current) {
      await prisma.achievement.create({ data: { ...achievement, isActive: true } });
    }
  }
}

/**
 * University/organization directory: every IIT, NIT, IIIT, IIM, IISER, major
 * central/state/deemed university and marquee private institute in India.
 * Users can still add a missing college themselves (self-serve creation);
 * this directory just means nobody starts from an empty dropdown.
 */
export const ORGANIZATIONS: Array<{ name: string; slug: string; description: string }> = [
  // — Institutes of National Importance: IISc + IITs (23) —
  { name: 'IISc Bangalore', slug: 'iisc-bangalore', description: 'Indian Institute of Science.' },
  { name: 'IIT Bombay', slug: 'iit-bombay', description: 'Indian Institute of Technology Bombay.' },
  { name: 'IIT Delhi', slug: 'iit-delhi', description: 'Indian Institute of Technology Delhi.' },
  { name: 'IIT Madras', slug: 'iit-madras', description: 'Indian Institute of Technology Madras.' },
  { name: 'IIT Kanpur', slug: 'iit-kanpur', description: 'Indian Institute of Technology Kanpur.' },
  {
    name: 'IIT Kharagpur',
    slug: 'iit-kharagpur',
    description: 'Indian Institute of Technology Kharagpur.',
  },
  {
    name: 'IIT Roorkee',
    slug: 'iit-roorkee',
    description: 'Indian Institute of Technology Roorkee.',
  },
  {
    name: 'IIT Guwahati',
    slug: 'iit-guwahati',
    description: 'Indian Institute of Technology Guwahati.',
  },
  {
    name: 'IIT Hyderabad',
    slug: 'iit-hyderabad',
    description: 'Indian Institute of Technology Hyderabad.',
  },
  { name: 'IIT BHU Varanasi', slug: 'iit-bhu', description: 'IIT (BHU) Varanasi.' },
  { name: 'IIT Indore', slug: 'iit-indore', description: 'Indian Institute of Technology Indore.' },
  { name: 'IIT Mandi', slug: 'iit-mandi', description: 'Indian Institute of Technology Mandi.' },
  { name: 'IIT Ropar', slug: 'iit-ropar', description: 'Indian Institute of Technology Ropar.' },
  { name: 'IIT Patna', slug: 'iit-patna', description: 'Indian Institute of Technology Patna.' },
  {
    name: 'IIT Gandhinagar',
    slug: 'iit-gandhinagar',
    description: 'Indian Institute of Technology Gandhinagar.',
  },
  {
    name: 'IIT Jodhpur',
    slug: 'iit-jodhpur',
    description: 'Indian Institute of Technology Jodhpur.',
  },
  {
    name: 'IIT Bhubaneswar',
    slug: 'iit-bhubaneswar',
    description: 'Indian Institute of Technology Bhubaneswar.',
  },
  {
    name: 'IIT Palakkad',
    slug: 'iit-palakkad',
    description: 'Indian Institute of Technology Palakkad.',
  },
  {
    name: 'IIT Tirupati',
    slug: 'iit-tirupati',
    description: 'Indian Institute of Technology Tirupati.',
  },
  {
    name: 'IIT Dhanbad (ISM)',
    slug: 'iit-dhanbad',
    description: 'IIT (Indian School of Mines) Dhanbad.',
  },
  {
    name: 'IIT Dharwad',
    slug: 'iit-dharwad',
    description: 'Indian Institute of Technology Dharwad.',
  },
  { name: 'IIT Jammu', slug: 'iit-jammu', description: 'Indian Institute of Technology Jammu.' },
  { name: 'IIT Bhilai', slug: 'iit-bhilai', description: 'Indian Institute of Technology Bhilai.' },
  { name: 'IIT Goa', slug: 'iit-goa', description: 'Indian Institute of Technology Goa.' },
  // — NITs (31) —
  {
    name: 'NIT Trichy',
    slug: 'nit-trichy',
    description: 'National Institute of Technology Tiruchirappalli.',
  },
  { name: 'NIT Surathkal', slug: 'nit-surathkal', description: 'NIT Karnataka, Surathkal.' },
  {
    name: 'NIT Warangal',
    slug: 'nit-warangal',
    description: 'National Institute of Technology Warangal.',
  },
  {
    name: 'NIT Calicut',
    slug: 'nit-calicut',
    description: 'National Institute of Technology Calicut.',
  },
  {
    name: 'NIT Rourkela',
    slug: 'nit-rourkela',
    description: 'National Institute of Technology Rourkela.',
  },
  {
    name: 'NIT Durgapur',
    slug: 'nit-durgapur',
    description: 'National Institute of Technology Durgapur.',
  },
  {
    name: 'MNIT Jaipur',
    slug: 'mnit-jaipur',
    description: 'Malaviya National Institute of Technology Jaipur.',
  },
  {
    name: 'MNNIT Allahabad',
    slug: 'mnnit-allahabad',
    description: 'Motilal Nehru NIT Allahabad (Prayagraj).',
  },
  { name: 'MANIT Bhopal', slug: 'manit-bhopal', description: 'Maulana Azad NIT Bhopal.' },
  { name: 'VNIT Nagpur', slug: 'vnit-nagpur', description: 'Visvesvaraya NIT Nagpur.' },
  { name: 'SVNIT Surat', slug: 'svnit-surat', description: 'Sardar Vallabhbhai NIT Surat.' },
  {
    name: 'NIT Kurukshetra',
    slug: 'nit-kurukshetra',
    description: 'National Institute of Technology Kurukshetra.',
  },
  {
    name: 'NIT Jalandhar',
    slug: 'nit-jalandhar',
    description: 'Dr. B. R. Ambedkar NIT Jalandhar.',
  },
  {
    name: 'NIT Hamirpur',
    slug: 'nit-hamirpur',
    description: 'National Institute of Technology Hamirpur.',
  },
  {
    name: 'NIT Srinagar',
    slug: 'nit-srinagar',
    description: 'National Institute of Technology Srinagar.',
  },
  {
    name: 'NIT Silchar',
    slug: 'nit-silchar',
    description: 'National Institute of Technology Silchar.',
  },
  {
    name: 'NIT Agartala',
    slug: 'nit-agartala',
    description: 'National Institute of Technology Agartala.',
  },
  {
    name: 'NIT Raipur',
    slug: 'nit-raipur',
    description: 'National Institute of Technology Raipur.',
  },
  {
    name: 'NIT Jamshedpur',
    slug: 'nit-jamshedpur',
    description: 'National Institute of Technology Jamshedpur.',
  },
  { name: 'NIT Patna', slug: 'nit-patna', description: 'National Institute of Technology Patna.' },
  { name: 'NIT Delhi', slug: 'nit-delhi', description: 'National Institute of Technology Delhi.' },
  { name: 'NIT Goa', slug: 'nit-goa', description: 'National Institute of Technology Goa.' },
  {
    name: 'NIT Puducherry',
    slug: 'nit-puducherry',
    description: 'National Institute of Technology Puducherry.',
  },
  {
    name: 'NIT Andhra Pradesh',
    slug: 'nit-andhra',
    description: 'NIT Andhra Pradesh, Tadepalligudem.',
  },
  {
    name: 'NIT Meghalaya',
    slug: 'nit-meghalaya',
    description: 'National Institute of Technology Meghalaya.',
  },
  {
    name: 'NIT Nagaland',
    slug: 'nit-nagaland',
    description: 'National Institute of Technology Nagaland.',
  },
  {
    name: 'NIT Manipur',
    slug: 'nit-manipur',
    description: 'National Institute of Technology Manipur.',
  },
  {
    name: 'NIT Mizoram',
    slug: 'nit-mizoram',
    description: 'National Institute of Technology Mizoram.',
  },
  {
    name: 'NIT Sikkim',
    slug: 'nit-sikkim',
    description: 'National Institute of Technology Sikkim.',
  },
  {
    name: 'NIT Arunachal Pradesh',
    slug: 'nit-arunachal',
    description: 'NIT Arunachal Pradesh, Yupia.',
  },
  {
    name: 'NIT Uttarakhand',
    slug: 'nit-uttarakhand',
    description: 'National Institute of Technology Uttarakhand.',
  },
  // — IIITs (major) —
  {
    name: 'IIIT Hyderabad',
    slug: 'iiit-hyderabad',
    description: 'International Institute of Information Technology Hyderabad.',
  },
  {
    name: 'IIIT Bangalore',
    slug: 'iiit-bangalore',
    description: 'International Institute of Information Technology Bangalore.',
  },
  {
    name: 'IIIT Allahabad',
    slug: 'iiit-allahabad',
    description: 'Indian Institute of Information Technology Allahabad.',
  },
  { name: 'ABV-IIITM Gwalior', slug: 'iiitm-gwalior', description: 'ABV-IIITM Gwalior.' },
  {
    name: 'IIITDM Jabalpur',
    slug: 'iiitdm-jabalpur',
    description: 'IIIT Design and Manufacturing Jabalpur.',
  },
  { name: 'IIITDM Kancheepuram', slug: 'iiitdm-kancheepuram', description: 'IIITDM Kancheepuram.' },
  {
    name: 'IIIT Guwahati',
    slug: 'iiit-guwahati',
    description: 'Indian Institute of Information Technology Guwahati.',
  },
  {
    name: 'IIIT Lucknow',
    slug: 'iiit-lucknow',
    description: 'Indian Institute of Information Technology Lucknow.',
  },
  {
    name: 'IIIT Pune',
    slug: 'iiit-pune',
    description: 'Indian Institute of Information Technology Pune.',
  },
  {
    name: 'IIIT Surat',
    slug: 'iiit-surat',
    description: 'Indian Institute of Information Technology Surat.',
  },
  {
    name: 'IIIT Bhopal',
    slug: 'iiit-bhopal',
    description: 'Indian Institute of Information Technology Bhopal.',
  },
  {
    name: 'IIIT Nagpur',
    slug: 'iiit-nagpur',
    description: 'Indian Institute of Information Technology Nagpur.',
  },
  // — IIMs (major) —
  {
    name: 'IIM Ahmedabad',
    slug: 'iim-ahmedabad',
    description: 'Indian Institute of Management Ahmedabad.',
  },
  {
    name: 'IIM Bangalore',
    slug: 'iim-bangalore',
    description: 'Indian Institute of Management Bangalore.',
  },
  {
    name: 'IIM Calcutta',
    slug: 'iim-calcutta',
    description: 'Indian Institute of Management Calcutta.',
  },
  {
    name: 'IIM Lucknow',
    slug: 'iim-lucknow',
    description: 'Indian Institute of Management Lucknow.',
  },
  {
    name: 'IIM Kozhikode',
    slug: 'iim-kozhikode',
    description: 'Indian Institute of Management Kozhikode.',
  },
  { name: 'IIM Indore', slug: 'iim-indore', description: 'Indian Institute of Management Indore.' },
  { name: 'IIM Shillong', slug: 'iim-shillong', description: 'IIM Shillong (Meghalaya).' },
  { name: 'IIM Ranchi', slug: 'iim-ranchi', description: 'Indian Institute of Management Ranchi.' },
  { name: 'IIM Rohtak', slug: 'iim-rohtak', description: 'Indian Institute of Management Rohtak.' },
  { name: 'IIM Raipur', slug: 'iim-raipur', description: 'Indian Institute of Management Raipur.' },
  {
    name: 'IIM Udaipur',
    slug: 'iim-udaipur',
    description: 'Indian Institute of Management Udaipur.',
  },
  { name: 'IIM Trichy', slug: 'iim-trichy', description: 'IIM Tiruchirappalli.' },
  {
    name: 'IIM Kashipur',
    slug: 'iim-kashipur',
    description: 'Indian Institute of Management Kashipur.',
  },
  { name: 'IIM Nagpur', slug: 'iim-nagpur', description: 'Indian Institute of Management Nagpur.' },
  { name: 'IIM Mumbai', slug: 'iim-mumbai', description: 'IIM Mumbai (formerly NITIE).' },
  // — IISERs + ISI + CMI —
  {
    name: 'IISER Pune',
    slug: 'iiser-pune',
    description: 'Indian Institute of Science Education and Research Pune.',
  },
  { name: 'IISER Bhopal', slug: 'iiser-bhopal', description: 'IISER Bhopal.' },
  { name: 'IISER Mohali', slug: 'iiser-mohali', description: 'IISER Mohali.' },
  { name: 'IISER Kolkata', slug: 'iiser-kolkata', description: 'IISER Kolkata.' },
  { name: 'IISER Thiruvananthapuram', slug: 'iiser-tvm', description: 'IISER Thiruvananthapuram.' },
  { name: 'IISER Tirupati', slug: 'iiser-tirupati', description: 'IISER Tirupati.' },
  {
    name: 'ISI Kolkata',
    slug: 'isi-kolkata',
    description: 'Indian Statistical Institute Kolkata.',
  },
  { name: 'CMI Chennai', slug: 'cmi-chennai', description: 'Chennai Mathematical Institute.' },
  {
    name: 'IIST Thiruvananthapuram',
    slug: 'iist-tvm',
    description: 'Indian Institute of Space Science and Technology.',
  },
  // — Central universities (major) —
  { name: 'Delhi University', slug: 'delhi-university', description: 'University of Delhi.' },
  { name: 'JNU Delhi', slug: 'jnu-delhi', description: 'Jawaharlal Nehru University.' },
  { name: 'BHU Varanasi', slug: 'bhu-varanasi', description: 'Banaras Hindu University.' },
  { name: 'AMU Aligarh', slug: 'amu-aligarh', description: 'Aligarh Muslim University.' },
  {
    name: 'Jamia Millia Islamia',
    slug: 'jamia-delhi',
    description: 'Jamia Millia Islamia, New Delhi.',
  },
  {
    name: 'Allahabad University',
    slug: 'allahabad-university',
    description: 'University of Allahabad (Prayagraj).',
  },
  {
    name: 'Hyderabad University (HCU)',
    slug: 'hcu-hyderabad',
    description: 'University of Hyderabad.',
  },
  {
    name: 'EFLU Hyderabad',
    slug: 'eflu-hyderabad',
    description: 'English and Foreign Languages University.',
  },
  {
    name: 'Pondicherry University',
    slug: 'pondicherry-university',
    description: 'Pondicherry University.',
  },
  { name: 'Visva-Bharati', slug: 'visva-bharati', description: 'Visva-Bharati, Santiniketan.' },
  {
    name: 'Tezpur University',
    slug: 'tezpur-university',
    description: 'Tezpur University, Assam.',
  },
  {
    name: 'Assam University Silchar',
    slug: 'assam-university',
    description: 'Assam University, Silchar.',
  },
  { name: 'NEHU Shillong', slug: 'nehu-shillong', description: 'North-Eastern Hill University.' },
  {
    name: 'Mizoram University',
    slug: 'mizoram-university',
    description: 'Mizoram University, Aizawl.',
  },
  { name: 'Nagaland University', slug: 'nagaland-university', description: 'Nagaland University.' },
  {
    name: 'Manipur University',
    slug: 'manipur-university',
    description: 'Manipur University, Imphal.',
  },
  { name: 'Tripura University', slug: 'tripura-university', description: 'Tripura University.' },
  {
    name: 'Sikkim University',
    slug: 'sikkim-university',
    description: 'Sikkim University, Gangtok.',
  },
  {
    name: 'Rajiv Gandhi University',
    slug: 'rgu-arunachal',
    description: 'Rajiv Gandhi University, Arunachal Pradesh.',
  },
  {
    name: 'HNBGU Garhwal',
    slug: 'hnbgu-garhwal',
    description: 'Hemvati Nandan Bahuguna Garhwal University.',
  },
  {
    name: 'Central University of Gujarat',
    slug: 'cug-gujarat',
    description: 'Central University of Gujarat.',
  },
  {
    name: 'CURAJ Rajasthan',
    slug: 'curaj-rajasthan',
    description: 'Central University of Rajasthan.',
  },
  {
    name: 'Central University of Punjab',
    slug: 'cup-punjab',
    description: 'Central University of Punjab.',
  },
  {
    name: 'Central University of Haryana',
    slug: 'cuh-haryana',
    description: 'Central University of Haryana.',
  },
  {
    name: 'Central University of Himachal',
    slug: 'cuhp-himachal',
    description: 'Central University of Himachal Pradesh.',
  },
  {
    name: 'Central University of Jammu',
    slug: 'cu-jammu',
    description: 'Central University of Jammu.',
  },
  {
    name: 'Central University of Kashmir',
    slug: 'cu-kashmir',
    description: 'Central University of Kashmir.',
  },
  {
    name: 'Central University of Jharkhand',
    slug: 'cu-jharkhand',
    description: 'Central University of Jharkhand.',
  },
  {
    name: 'Central University of Karnataka',
    slug: 'cuk-karnataka',
    description: 'Central University of Karnataka.',
  },
  {
    name: 'Central University of Kerala',
    slug: 'cuk-kerala',
    description: 'Central University of Kerala.',
  },
  { name: 'CUSB Bihar', slug: 'cusb-bihar', description: 'Central University of South Bihar.' },
  { name: 'IGNOU', slug: 'ignou', description: 'Indira Gandhi National Open University.' },
  // — Major state / public universities —
  { name: 'Anna University', slug: 'anna-university', description: 'Anna University, Chennai.' },
  {
    name: 'Jadavpur University',
    slug: 'jadavpur-university',
    description: 'Jadavpur University, Kolkata.',
  },
  {
    name: 'University of Calcutta',
    slug: 'calcutta-university',
    description: 'University of Calcutta.',
  },
  { name: 'Mumbai University', slug: 'mumbai-university', description: 'University of Mumbai.' },
  { name: 'SPPU Pune', slug: 'sppu-pune', description: 'Savitribai Phule Pune University.' },
  { name: 'Madras University', slug: 'madras-university', description: 'University of Madras.' },
  {
    name: 'Bangalore University',
    slug: 'bangalore-university',
    description: 'Bangalore University.',
  },
  {
    name: 'Osmania University',
    slug: 'osmania-university',
    description: 'Osmania University, Hyderabad.',
  },
  { name: 'JNTU Hyderabad', slug: 'jntu-hyderabad', description: 'JNTU Hyderabad.' },
  {
    name: 'VTU Belgaum',
    slug: 'vtu-belgaum',
    description: 'Visvesvaraya Technological University.',
  },
  { name: 'Kerala University', slug: 'kerala-university', description: 'University of Kerala.' },
  {
    name: 'MG University Kottayam',
    slug: 'mgu-kottayam',
    description: 'Mahatma Gandhi University, Kottayam.',
  },
  { name: 'Calicut University', slug: 'calicut-university', description: 'University of Calicut.' },
  { name: 'Mysore University', slug: 'mysore-university', description: 'University of Mysore.' },
  {
    name: 'Andhra University',
    slug: 'andhra-university',
    description: 'Andhra University, Visakhapatnam.',
  },
  {
    name: 'Rajasthan University',
    slug: 'rajasthan-university',
    description: 'University of Rajasthan, Jaipur.',
  },
  {
    name: 'Panjab University',
    slug: 'panjab-university',
    description: 'Panjab University, Chandigarh.',
  },
  { name: 'Lucknow University', slug: 'lucknow-university', description: 'University of Lucknow.' },
  {
    name: 'AKTU Lucknow',
    slug: 'aktu-lucknow',
    description: 'Dr. A.P.J. Abdul Kalam Technical University.',
  },
  { name: 'DTU Delhi', slug: 'dtu-delhi', description: 'Delhi Technological University.' },
  {
    name: 'NSUT Delhi',
    slug: 'nsut-delhi',
    description: 'Netaji Subhas University of Technology.',
  },
  {
    name: 'GGSIPU Delhi',
    slug: 'ggsipu-delhi',
    description: 'Guru Gobind Singh Indraprastha University.',
  },
  {
    name: 'Pune Institute (COEP)',
    slug: 'coep-pune',
    description: 'COEP Technological University, Pune.',
  },
  {
    name: 'VJTI Mumbai',
    slug: 'vjti-mumbai',
    description: 'Veermata Jijabai Technological Institute.',
  },
  {
    name: 'ICT Mumbai',
    slug: 'ict-mumbai',
    description: 'Institute of Chemical Technology, Mumbai.',
  },
  {
    name: 'HBTU Kanpur',
    slug: 'hbtu-kanpur',
    description: 'Harcourt Butler Technical University.',
  },
  // — Deemed + marquee private —
  {
    name: 'BITS Pilani',
    slug: 'bits-pilani',
    description: 'Birla Institute of Technology and Science, Pilani.',
  },
  { name: 'VIT Vellore', slug: 'vit-vellore', description: 'Vellore Institute of Technology.' },
  {
    name: 'SRM Chennai',
    slug: 'srm-chennai',
    description: 'SRM Institute of Science and Technology.',
  },
  {
    name: 'Manipal (MAHE)',
    slug: 'mahe-manipal',
    description: 'Manipal Academy of Higher Education.',
  },
  { name: 'Amity Noida', slug: 'amity-noida', description: 'Amity University, Noida.' },
  { name: 'LPU Punjab', slug: 'lpu-punjab', description: 'Lovely Professional University.' },
  {
    name: 'Chandigarh University',
    slug: 'chandigarh-university',
    description: 'Chandigarh University.',
  },
  {
    name: 'Shiv Nadar University',
    slug: 'shiv-nadar',
    description: 'Shiv Nadar Institution of Eminence.',
  },
  {
    name: 'Ashoka University',
    slug: 'ashoka-university',
    description: 'Ashoka University, Sonipat.',
  },
  {
    name: 'OP Jindal University',
    slug: 'op-jindal',
    description: 'O.P. Jindal Global University.',
  },
  {
    name: 'Christ University',
    slug: 'christ-bangalore',
    description: 'Christ (Deemed to be University), Bengaluru.',
  },
  {
    name: 'IIITDM Kurnool',
    slug: 'iiitdm-kurnool',
    description: 'IIIT Design and Manufacturing, Kurnool.',
  },
  { name: 'NID Ahmedabad', slug: 'nid-ahmedabad', description: 'National Institute of Design.' },
  {
    name: 'NIFT Delhi',
    slug: 'nift-delhi',
    description: 'National Institute of Fashion Technology.',
  },
  {
    name: 'SPA Delhi',
    slug: 'spa-delhi',
    description: 'School of Planning and Architecture, Delhi.',
  },
  { name: 'ISB Hyderabad', slug: 'isb-hyderabad', description: 'Indian School of Business.' },
  {
    name: 'MDI Gurgaon',
    slug: 'mdi-gurgaon',
    description: 'Management Development Institute, Gurgaon.',
  },
  {
    name: 'XLRI Jamshedpur',
    slug: 'xlri-jamshedpur',
    description: 'XLRI Xavier School of Management.',
  },
  { name: 'FMS Delhi', slug: 'fms-delhi', description: 'Faculty of Management Studies, Delhi.' },
  {
    name: 'SPJIMR Mumbai',
    slug: 'spjimr-mumbai',
    description: 'S.P. Jain Institute of Management and Research.',
  },
  { name: 'TISS Mumbai', slug: 'tiss-mumbai', description: 'Tata Institute of Social Sciences.' },
];

/**
 * University directory. Create-only (never overwrites): safe to re-run and
 * admin-safe — renames stay untouched.
 */
export async function seedOrganizations(prisma: PrismaClient): Promise<void> {
  // Two round-trips total (Neon RTT is slow): fetch slugs, bulk-insert missing.
  const existing = await prisma.organization.findMany({ select: { slug: true } });
  const have = new Set(existing.map((row) => row.slug));
  const missing = ORGANIZATIONS.filter((org) => !have.has(org.slug));
  if (missing.length > 0) {
    await prisma.organization.createMany({ data: missing, skipDuplicates: true });
  }
}

/** Upsert roles, permissions, and grants. Safe to re-run. */
export async function seedRbac(prisma: PrismaClient): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { action_resource: { action: permission.action, resource: permission.resource } },
      update: { description: permission.description },
      create: permission,
    });
  }
  for (const grant of GRANTS) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: grant.role } });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { action_resource: { action: grant.action, resource: grant.resource } },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

/** Upsert categories, topics, subtopics, and exam tags. Safe to re-run. */
export async function seedTaxonomy(prisma: PrismaClient): Promise<void> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        icon: category.icon,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      create: category,
    });
  }
  for (const topic of TOPICS) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: topic.categorySlug },
    });
    await prisma.topic.upsert({
      where: { categoryId_slug: { categoryId: category.id, slug: topic.slug } },
      update: { name: topic.name, description: topic.description, isActive: true },
      create: {
        categoryId: category.id,
        name: topic.name,
        slug: topic.slug,
        description: topic.description,
      },
    });
  }
  for (const subtopic of SUBTOPICS) {
    const topic = await prisma.topic.findFirstOrThrow({ where: { slug: subtopic.topicSlug } });
    await prisma.subtopic.upsert({
      where: { topicId_slug: { topicId: topic.id, slug: subtopic.slug } },
      update: { name: subtopic.name, isActive: true },
      create: { topicId: topic.id, name: subtopic.name, slug: subtopic.slug },
    });
  }
  for (const tag of EXAM_TAGS) {
    await prisma.examTag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name, description: tag.description, isActive: true },
      create: tag,
    });
  }
}
