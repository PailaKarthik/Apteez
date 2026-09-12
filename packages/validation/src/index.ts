import { z } from 'zod';
import {
  CONTEST_SUSPICIOUS_EVENT_TYPES,
  CONTRIBUTION_STATUSES,
  DISCUSSION_REACTION_TYPES,
  DISCUSSION_REPORT_REASONS,
  DISCUSSION_SORT_KEYS,
  FAVORITE_ITEM_SORT_KEYS,
  PROBLEM_CONTENT_MODES,
  PROBLEM_SORT_KEYS,
  QUESTION_DIFFICULTIES,
  QUESTION_TYPES,
} from '@apteez/types';

/**
 * Shared Zod schemas. Zod is the single validation library for ApteeZ:
 * the web app uses these schemas with React Hook Form, and the NestJS API
 * reuses them in its validation pipe. Never duplicate a schema in an app —
 * extend it here.
 */

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export const uuidSchema = z.string().uuid();

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(
    /^[a-zA-Z0-9_.-]+$/,
    'Username may only contain letters, numbers, dots, hyphens and underscores',
  );

/**
 * Registration password policy: length is the main defense (scrypt
 * memory-hard hashing server-side). Complexity rules are deliberately
 * avoided so passphrases stay usable.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254, 'Email address is too long');

/**
 * Registration payload. Unknown keys (e.g. a client-supplied `roles`
 * array) are stripped by Zod — privilege assignment is server-side only.
 */
export const registerSchema = z.object({
  displayName: z.string().trim().min(2, 'Display name is required').max(60),
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** Login payload. Only presence is validated — strength rules would leak. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const contributionStatusSchema = z.enum(CONTRIBUTION_STATUSES);

export const difficultySchema = z.enum(QUESTION_DIFFICULTIES);

export const problemContentModeSchema = z.enum(PROBLEM_CONTENT_MODES);

export const problemSortSchema = z.enum(PROBLEM_SORT_KEYS);

/**
 * Canonical option-content rule shared by problems and contributions.
 * An option is valid when it carries text, an image key, or both — this is
 * the single place that rule is expressed.
 */
export const answerOptionContentSchema = z
  .object({
    text: z.string().trim().min(1, 'Option text is required').max(500).optional(),
    assetKey: z.string().trim().min(1).max(512).optional(),
  })
  .refine((value) => Boolean(value.text || value.assetKey), {
    message: 'An option needs text or an image',
  });

export const problemOptionInputSchema = answerOptionContentSchema.and(
  z.object({ isCorrect: z.boolean().optional() }),
);

export type ProblemOptionInput = z.infer<typeof problemOptionInputSchema>;

/**
 * Canonical problem-content schema. Admin creation and contribution approval
 * both funnel through this — the validation rule set lives in one place.
 */
export const problemContentSchema = z
  .object({
    title: z.string().trim().min(3, 'Title is too short').max(200, 'Title is too long'),
    statement: z.string().trim().min(1).max(5000).optional(),
    contentMode: problemContentModeSchema.default('TEXT_ONLY'),
    difficulty: difficultySchema.default('MEDIUM'),
    rating: z.number().min(0).max(4000).optional(),
    explanation: z.string().trim().min(1).max(8000).optional(),
    shortcut: z.string().trim().min(1).max(4000).optional(),
    source: z.string().trim().max(200).optional(),
    sourceYear: z.number().int().min(1900).max(2100).optional(),
    categoryId: z.string().uuid('A valid category is required'),
    topicId: z.string().uuid('A valid topic is required'),
    subtopicId: z.string().uuid().optional(),
    options: z
      .array(problemOptionInputSchema)
      .min(2, 'A problem needs at least two options')
      .max(8, 'A problem supports at most eight options'),
    examTagIds: z.array(z.string().uuid()).max(20).default([]),
  })
  .superRefine((value, ctx) => {
    const wantsText = value.contentMode !== 'IMAGE_ONLY';
    if (wantsText && !value.statement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['statement'],
        message: 'Text content is required for this content mode',
      });
    }
    const correct = value.options.filter((option) => option.isCorrect === true).length;
    if (correct !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Exactly one option must be marked correct',
      });
    }
  });

export type ProblemContentInput = z.infer<typeof problemContentSchema>;

const booleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * Public problem-listing filters. Every filter is optional and combines as
 * AND; invalid enum/range values fail here before touching the database.
 */
export const problemListQuerySchema = z
  .object({
    category: z.string().trim().min(1).max(80).optional(),
    topic: z.string().trim().min(1).max(80).optional(),
    subtopic: z.string().trim().min(1).max(80).optional(),
    difficulty: difficultySchema.optional(),
    ratingMin: z.coerce.number().min(0).max(4000).optional(),
    ratingMax: z.coerce.number().min(0).max(4000).optional(),
    exam: z.string().trim().min(1).max(80).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    solved: booleanQuerySchema.optional(),
    favorited: booleanQuerySchema.optional(),
    sort: problemSortSchema.default('newest'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(512).optional(),
  })
  .refine(
    (value) =>
      value.ratingMin === undefined ||
      value.ratingMax === undefined ||
      value.ratingMin <= value.ratingMax,
    { path: ['ratingMin'], message: 'ratingMin must not exceed ratingMax' },
  );

export type ProblemListQuery = z.infer<typeof problemListQuerySchema>;

/**
 * Submission payload. Only the selected option and an optional (untrusted)
 * client timing hint are accepted — correctness, score and ratings are
 * server-computed and rejected as unknown keys.
 */
export const submitAttemptSchema = z.object({
  selectedOptionId: z.string().uuid('A valid option is required'),
  clientTimeSpentSeconds: z.number().int().min(0).max(86_400).optional(),
});

export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;

/** Cursor-paginated recent practice history. */
export const recentSubmissionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(512).optional(),
});

export type RecentSubmissionsQuery = z.infer<typeof recentSubmissionsQuerySchema>;

export const collectionNameSchema = z
  .string()
  .trim()
  .min(1, 'Collection name is required')
  .max(60, 'Collection name must be at most 60 characters');

/** Create a custom collection. Owner/default status are server-controlled. */
export const createCollectionSchema = z.object({
  name: collectionNameSchema,
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

/** Rename a custom collection (PATCH — only the name is mutable). */
export const renameCollectionSchema = z.object({
  name: collectionNameSchema,
});

export type RenameCollectionInput = z.infer<typeof renameCollectionSchema>;

export const favoriteItemSortSchema = z.enum(FAVORITE_ITEM_SORT_KEYS);

/** Cursor-paginated problem listing inside a collection (or Favorites). */
export const favoriteListQuerySchema = z.object({
  sort: favoriteItemSortSchema.default('added_desc'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(512).optional(),
});

export type FavoriteListQuery = z.infer<typeof favoriteListQuerySchema>;

/**
 * Payload for a user-contributed aptitude question. The full review
 * workflow (drafts, moderation, approval) lands in a later prompt; this
 * schema already pins the accepted shape so web forms and the future API
 * endpoint validate identically.
 */
export const contributionQuestionSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    difficulty: z.enum(QUESTION_DIFFICULTIES),
    topic: z.string().trim().min(2).max(64).optional(),
    statement: z.string().trim().min(20).max(2000),
    options: z.array(answerOptionContentSchema).min(2).max(6),
    correctAnswerIndex: z.number().int().min(0),
    explanation: z.string().trim().min(20).max(4000),
    sourceUrl: z.string().url().optional().or(z.literal('')),
  })
  .refine((value) => value.correctAnswerIndex < value.options.length, {
    path: ['correctAnswerIndex'],
    message: 'Correct answer index must point to an existing option',
  });

export type ContributionQuestionInput = z.infer<typeof contributionQuestionSchema>;

/** Shape of GET /api/v1/health, validated client-side before render. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  environment: z.string(),
  timestamp: z.string(),
  uptimeSeconds: z.number(),
  checks: z.object({
    database: z.object({ status: z.enum(['up', 'down']), latencyMs: z.number().nullable() }),
    redis: z.object({ status: z.enum(['up', 'down']), latencyMs: z.number().nullable() }),
  }),
});

/** Join a matchmaking queue for one aptitude domain. */
export const startMatchmakingSchema = z.object({
  domainSlug: z
    .string()
    .trim()
    .min(1, 'A domain is required')
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Invalid domain'),
});

export type StartMatchmakingInput = z.infer<typeof startMatchmakingSchema>;

export const cancelMatchmakingSchema = z.object({
  requestId: z.string().uuid().optional(),
});

export type CancelMatchmakingInput = z.infer<typeof cancelMatchmakingSchema>;

/**
 * Answer submission. The client may only identify the option (plus an
 * untrusted timing hint) — correctness, score, winner and rating are
 * server-computed and rejected as unknown keys.
 */
export const challengeAnswerSchema = z.object({
  challengeId: z.string().uuid(),
  position: z.number().int().min(0).max(99),
  selectedOptionId: z.string().uuid(),
  clientElapsedMs: z.number().int().min(0).max(3_600_000).optional(),
});

export type ChallengeAnswerInput = z.infer<typeof challengeAnswerSchema>;

export const challengeHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(512).optional(),
});

export type ChallengeHistoryQuery = z.infer<typeof challengeHistoryQuerySchema>;

/** Optional domain filter shared by rating read endpoints. */
export const ratingDomainQuerySchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Invalid domain')
    .optional(),
});

export type RatingDomainQuery = z.infer<typeof ratingDomainQuerySchema>;

/**
 * Rating history filters. `result` is expressed from the caller's point of
 * view (WIN/LOSS/DRAW), not the raw challenge outcome.
 */
export const ratingHistoryQuerySchema = z
  .object({
    domain: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/, 'Invalid domain')
      .optional(),
    result: z.enum(['WIN', 'LOSS', 'DRAW']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(512).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['from'],
    message: 'from must not be after to',
  });

export type RatingHistoryQuery = z.infer<typeof ratingHistoryQuerySchema>;

/** Leaderboard page for one domain (global, or narrowed to an institution). */
export const ratingLeaderboardQuerySchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, 'A domain is required')
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Invalid domain'),
  institution: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
});

export type RatingLeaderboardQuery = z.infer<typeof ratingLeaderboardQuerySchema>;

/** Contest discovery filters shared by list endpoint + web tabs. */
export const contestListQuerySchema = z.object({
  phase: z.enum(['live', 'upcoming', 'past', 'active']).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ContestListQuery = z.infer<typeof contestListQuerySchema>;

/** Persist one answer selection; correctness is always server-computed. */
export const contestAnswerSchema = z.object({
  selectedOptionId: z.string().uuid(),
  currentPosition: z.number().int().min(0).max(500).optional(),
});

export type ContestAnswerInput = z.infer<typeof contestAnswerSchema>;

export const contestReviewSchema = z.object({
  markedForReview: z.boolean(),
  currentPosition: z.number().int().min(0).max(500).optional(),
});

export type ContestReviewInput = z.infer<typeof contestReviewSchema>;

export const contestSuspiciousEventSchema = z.object({
  type: z.enum(CONTEST_SUSPICIOUS_EVENT_TYPES),
  detail: z.string().trim().max(500).optional(),
});

export type ContestSuspiciousEventInput = z.infer<typeof contestSuspiciousEventSchema>;

export const contestLeaderboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ContestLeaderboardQuery = z.infer<typeof contestLeaderboardQuerySchema>;

export const contestSubscribeSchema = z.object({
  contestId: z.string().uuid(),
});

export type ContestSubscribeInput = z.infer<typeof contestSubscribeSchema>;

// ─── Learning (Prompt 12) ───────────────────────────────────────────────────

/** Lesson detail params: topic slug resolves uniquely inside a path. */
export const learningLessonParamsSchema = z.object({
  topicSlug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Invalid topic slug'),
  lessonSlug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Invalid lesson slug'),
});

export type LearningLessonParams = z.infer<typeof learningLessonParamsSchema>;

/** Start/complete mutations are parameterless — state is fully server-owned. */
export const learningLessonActionSchema = z.object({}).strip();

export type LearningLessonActionInput = z.infer<typeof learningLessonActionSchema>;

// ─── Discussions (Prompt 13) ────────────────────────────────────────────────

/** Thread discovery filters: full-text query, tag, author and sort. */
export const discussionListQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  tag: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Invalid tag')
    .optional(),
  problemId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
  sort: z.enum(DISCUSSION_SORT_KEYS).default('latest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type DiscussionListQuery = z.infer<typeof discussionListQuerySchema>;

/** Reply pagination inside a thread detail view. */
export const discussionRepliesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export type DiscussionRepliesQuery = z.infer<typeof discussionRepliesQuerySchema>;

/**
 * Create a thread. Tags are normalized to lower-case, de-duplicated and
 * capped so the GIN index stays useful and clients cannot spam synonyms.
 */
export const discussionCreateThreadSchema = z.object({
  title: z.string().trim().min(8, 'Title must be at least 8 characters').max(160),
  body: z.string().trim().min(10, 'Body must be at least 10 characters').max(20_000),
  tags: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .min(1)
        .max(40)
        .regex(/^[a-z0-9-]+$/, 'Tags may only contain letters, numbers and hyphens'),
    )
    .max(5, 'At most 5 tags are allowed')
    .default([])
    .transform((tags) => [...new Set(tags)]),
  problemId: z.string().uuid().optional(),
});

export type DiscussionCreateThreadInput = z.infer<typeof discussionCreateThreadSchema>;

/** Edit a thread; tags follow the same normalization as creation. */
export const discussionUpdateThreadSchema = z.object({
  title: z.string().trim().min(8).max(160),
  body: z.string().trim().min(10).max(20_000),
  tags: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .min(1)
        .max(40)
        .regex(/^[a-z0-9-]+$/, 'Tags may only contain letters, numbers and hyphens'),
    )
    .max(5)
    .default([])
    .transform((tags) => [...new Set(tags)]),
});

export type DiscussionUpdateThreadInput = z.infer<typeof discussionUpdateThreadSchema>;

/** Add a reply to a thread. */
export const discussionCreateReplySchema = z.object({
  body: z.string().trim().min(2, 'Reply is too short').max(10_000),
});

export type DiscussionCreateReplyInput = z.infer<typeof discussionCreateReplySchema>;

/** Toggle (or replace) the caller's reaction on a post or reply. */
export const discussionReactionSchema = z.object({
  type: z.enum(DISCUSSION_REACTION_TYPES),
});

export type DiscussionReactionInput = z.infer<typeof discussionReactionSchema>;

/** Report a post or reply for moderation triage. */
export const discussionReportSchema = z.object({
  reason: z.enum(DISCUSSION_REPORT_REASONS),
  detail: z.string().trim().max(1_000).optional(),
});

export type DiscussionReportInput = z.infer<typeof discussionReportSchema>;
