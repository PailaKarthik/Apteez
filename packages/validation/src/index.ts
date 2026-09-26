import { z } from 'zod';
import {
  CONTEST_STATUSES,
  CONTEST_SUSPICIOUS_EVENT_TYPES,
  CONTRIBUTION_STATUSES,
  DISCUSSION_REACTION_TYPES,
  DISCUSSION_REPORT_REASONS,
  DISCUSSION_SORT_KEYS,
  EVENT_STATUSES,
  EVENT_TYPES,
  EVENT_VISIBILITIES,
  FAVORITE_ITEM_SORT_KEYS,
  NOTIFICATION_TYPES,
  PROBLEM_CONTENT_MODES,
  PROBLEM_SORT_KEYS,
  PROBLEM_STATUSES,
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

/** Verify the 6-digit email OTP. */
export const emailOtpVerifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from the email'),
});

export type EmailOtpVerifyInput = z.infer<typeof emailOtpVerifySchema>;

export const contributionStatusSchema = z.enum(CONTRIBUTION_STATUSES);

export const difficultySchema = z.enum(QUESTION_DIFFICULTIES);

export const problemContentModeSchema = z.enum(PROBLEM_CONTENT_MODES);

export const problemSortSchema = z.enum(PROBLEM_SORT_KEYS);

/**
 * Question difficulty rating: whole hundreds within 1000–2000 only
 * (1000, 1100, …, 2000). Single source of truth — admin patches,
 * problem creation and contribution approval all reuse this.
 */
export const questionRatingSchema = z
  .number()
  .min(1000)
  .max(2000)
  .refine((value) => Number.isInteger(value) && value % 100 === 0, {
    message: 'Rating must be a whole hundred between 1000 and 2000',
  });

/** Clamp + snap any numeric rating to the 1000–2000 hundreds band. */
export function normalizeQuestionRating(value: unknown, fallback = 1500): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(2000, Math.max(1000, Math.round(num / 100) * 100));
}

/**
 * Object-storage keys only — never URLs. Keys come from POST
 * /storage/uploads; download URLs are minted at read time, so persisting a
 * URL would bake in an expiry (s3 presigned) or a wrong host (local dev).
 */
export const storageKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => !value.includes('://') && !value.startsWith('/') && !value.includes('..'), {
    message: 'Provide the storage key returned by /storage/uploads, not a URL',
  });

/**
 * Canonical option-content rule shared by problems and contributions.
 * An option is valid when it carries text, an image key, or both — this is
 * the single place that rule is expressed.
 */
export const answerOptionContentSchema = z
  .object({
    text: z.string().trim().min(1, 'Option text is required').max(500).optional(),
    assetKey: storageKeySchema.optional(),
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
    rating: questionRatingSchema.optional(),
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

/**
 * Offset-paginated recent practice history. Submissions are immutable once
 * finalized (submittedAt never changes), so skip/take stays consistent while
 * remaining trivially cacheable on a free-tier database.
 */
export const recentSubmissionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
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
 * Payload for a user-contributed aptitude question. Carries everything the
 * review flow needs to mint a canonical problem: the section (required),
 * topic (optional free text, matched to taxonomy), rating, exam folders and
 * source — so approval never has to invent missing fields. Question images
 * ride along as storage keys (from POST /storage/uploads) and become
 * ProblemAsset rows on approval.
 */
const contributionAssetSchema = z.object({
  key: storageKeySchema,
  kind: z.enum(['QUESTION_IMAGE', 'EXPLANATION_IMAGE']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024),
  altText: z.string().trim().max(200).optional(),
});

export type ContributionAssetInput = z.infer<typeof contributionAssetSchema>;

const contributionQuestionBase = z.object({
  type: z.enum(QUESTION_TYPES),
  difficulty: z.enum(QUESTION_DIFFICULTIES),
  categorySlug: z.string().trim().min(1).max(80),
  topic: z.string().trim().min(2).max(64).optional(),
  rating: questionRatingSchema.optional(),
  examTagSlugs: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  source: z.string().trim().max(200).optional(),
  statement: z.string().trim().min(20).max(2000),
  assets: z.array(contributionAssetSchema).max(4).default([]),
  options: z.array(answerOptionContentSchema).min(2).max(6),
  correctAnswerIndex: z.number().int().min(0),
  explanation: z.string().trim().min(20).max(4000),
  sourceUrl: z.string().url().optional().or(z.literal('')),
});

export const contributionQuestionSchema = contributionQuestionBase.refine(
  (value) => value.correctAnswerIndex < value.options.length,
  {
    path: ['correctAnswerIndex'],
    message: 'Correct answer index must point to an existing option',
  },
);

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
  // Endless timed matches can run past 100 questions; positions stay bounded.
  position: z.number().int().min(0).max(999),
  selectedOptionId: z.string().uuid(),
  clientElapsedMs: z.number().int().min(0).max(3_600_000).optional(),
});

export type ChallengeAnswerInput = z.infer<typeof challengeAnswerSchema>;

/** Challenge room subscription. The id must be a UUID; membership is re-checked server-side. */
export const challengeSubscribeSchema = z.object({
  challengeId: z.string().uuid(),
});

export type ChallengeSubscribeInput = z.infer<typeof challengeSubscribeSchema>;

/**
 * Offset-based history paging. Challenge history grows continuously and rows
 * are immutable once finalized (endedAt never changes), so plain skip/take
 * stays consistent enough here while remaining trivially cacheable and cheap
 * on a free-tier database (no keyset decode, bounded skips).
 */
export const challengeHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
  domain: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Invalid domain')
    .optional(),
});

export type ChallengeHistoryQuery = z.infer<typeof challengeHistoryQuerySchema>;

export const challengeHistoryStatsQuerySchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Invalid domain')
    .optional(),
});

export type ChallengeHistoryStatsQuery = z.infer<typeof challengeHistoryStatsQuerySchema>;

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

/** Global contest-rating leaderboard (overall performance, not per-contest). */
export const contestRatingLeaderboardQuerySchema = z.object({
  institution: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ContestRatingLeaderboardQuery = z.infer<typeof contestRatingLeaderboardQuerySchema>;

export const contestSubscribeSchema = z.object({
  contestId: z.string().uuid(),
});

export type ContestSubscribeInput = z.infer<typeof contestSubscribeSchema>;

// ─── Organizer contest creation (step 1: format, step 2: questions) ─────────
// Step 1 asks the shape of the contest first — how many questions and how
// long participants get — then step 2 adds the questions one by one. Status
// transitions stay server-owned (DRAFT → publish flow); unknown keys strip.

const contestDatePreprocess = z.preprocess(
  (v) => (typeof v === 'string' || v instanceof Date ? new Date(v as string) : v),
  z.date({ invalid_type_error: 'A valid date is required' }),
);

const contestScheduleRefine = (
  v: {
    startsAt: Date;
    endsAt: Date;
    durationMinutes: number;
    registrationOpensAt?: Date | null;
    registrationClosesAt?: Date | null;
  },
  ctx: z.RefinementCtx,
): void => {
  if (v.endsAt <= v.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'Contest end must be after the start',
    });
  }
  if (
    v.registrationOpensAt &&
    v.registrationClosesAt &&
    v.registrationClosesAt <= v.registrationOpensAt
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['registrationClosesAt'],
      message: 'Registration close must be after registration open',
    });
  }
  if (v.registrationClosesAt && v.registrationClosesAt > v.endsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['registrationClosesAt'],
      message: 'Registration must close before the contest ends',
    });
  }
  const windowMinutes = (v.endsAt.getTime() - v.startsAt.getTime()) / 60000;
  if (windowMinutes > 0 && v.durationMinutes > windowMinutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['durationMinutes'],
      message: 'Duration cannot exceed the contest window',
    });
  }
};

/** Step 1: contest format — question count + length first, then the rest. */
export const contestCreateSchema = z
  .object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(160),
    description: z.string().trim().max(5000).nullish(),
    rules: z.string().trim().max(10000).nullish(),
    difficulty: z.enum(QUESTION_DIFFICULTIES).default('MEDIUM'),
    questionCount: z.number().int().min(1, 'Add at least 1 question').max(50),
    durationMinutes: z.number().int().min(5).max(180).default(60),
    startsAt: contestDatePreprocess,
    endsAt: contestDatePreprocess,
    registrationOpensAt: contestDatePreprocess.nullish(),
    registrationClosesAt: contestDatePreprocess.nullish(),
    maxParticipants: z.number().int().min(2).max(10000).optional(),
    resultVisibility: z
      .enum(['ALWAYS', 'AFTER_END', 'AFTER_REGISTRATION_CLOSE'])
      .default('AFTER_END'),
    revealAnswersLive: z.boolean().default(false),
  })
  .superRefine(contestScheduleRefine);

export type ContestCreateInput = z.infer<typeof contestCreateSchema>;

/** Draft edits before publish (same shape rules as create, all optional). */
export const organizerContestPatchSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    description: z.string().trim().max(5000).nullish(),
    rules: z.string().trim().max(10000).nullish(),
    difficulty: z.enum(QUESTION_DIFFICULTIES).optional(),
    questionCount: z.number().int().min(1).max(50).optional(),
    durationMinutes: z.number().int().min(5).max(180).optional(),
    startsAt: contestDatePreprocess.optional(),
    endsAt: contestDatePreprocess.optional(),
    registrationOpensAt: contestDatePreprocess.nullish(),
    registrationClosesAt: contestDatePreprocess.nullish(),
    maxParticipants: z.number().int().min(2).max(10000).nullish(),
    resultVisibility: z.enum(['ALWAYS', 'AFTER_END', 'AFTER_REGISTRATION_CLOSE']).optional(),
    revealAnswersLive: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt) {
      contestScheduleRefine(
        {
          startsAt: v.startsAt,
          endsAt: v.endsAt,
          durationMinutes: v.durationMinutes ?? 60,
          registrationOpensAt: v.registrationOpensAt ?? undefined,
          registrationClosesAt: v.registrationClosesAt ?? undefined,
        },
        ctx,
      );
    } else if (v.endsAt && !v.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startsAt'],
        message: 'Start and end must be edited together',
      });
    } else if (v.startsAt && !v.endsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'Start and end must be edited together',
      });
    }
  });

export type OrganizerContestPatchInput = z.infer<typeof organizerContestPatchSchema>;

/** Step 2: attach one published problem per call (position auto-appends). */
export const contestQuestionAddSchema = z.object({
  problemId: z.string().uuid(),
  position: z.number().int().min(0).max(499).optional(),
});

export type ContestQuestionAddInput = z.infer<typeof contestQuestionAddSchema>;

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

// ─── Events (Prompt 14) ───────────────────────────────────────────────────
// Full event lifecycle validation. Unknown keys (organizerId, score, rank,
// status transitions) are stripped — the backend owns them server-side.

export const eventSlugSchema = z
  .string()
  .trim()
  .min(3, 'Slug must be at least 3 characters')
  .max(120, 'Slug is too long')
  .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens');

const eventDatePreprocess = z.preprocess(
  (v) => (typeof v === 'string' || v instanceof Date ? new Date(v as string) : v),
  z.date({ invalid_type_error: 'A valid date is required' }),
);

/** Step 1–6 organizer payload for create; publish is a separate transition. */
export const eventCreateSchema = z
  .object({
    title: z.string().trim().min(5, 'Title must be at least 5 characters').max(160),
    slug: eventSlugSchema.optional(),
    description: z
      .string()
      .trim()
      .min(20, 'Description must be at least 20 characters')
      .max(20_000),
    eventType: z.enum(EVENT_TYPES).default('CONTEST'),
    visibility: z.enum(EVENT_VISIBILITIES).default('PUBLIC'),
    organizationId: z.string().uuid().optional(),
    difficulty: z.enum(QUESTION_DIFFICULTIES).default('MEDIUM'),
    bannerKey: z.string().trim().min(1).max(512).optional(),
    maxParticipants: z.number().int().min(2).max(100_000).optional(),
    registrationStartAt: eventDatePreprocess.optional(),
    registrationEndAt: eventDatePreprocess.optional(),
    startAt: eventDatePreprocess,
    endAt: eventDatePreprocess,
    durationMinutes: z
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .default(60),
    rules: z.string().trim().min(10, 'Rules must be at least 10 characters').max(20_000).optional(),
    isPaid: z.boolean().default(false),
    price: z.number().min(0).max(1_000_000).optional(),
    problemIds: z.array(z.string().uuid()).max(200).default([]),
    // Private-event entry code: required to register/join when set.
    entryCode: z.string().trim().min(4).max(32).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.endAt <= v.startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endAt'],
        message: 'End must be after start',
      });
    }
    if (
      v.registrationStartAt &&
      v.registrationEndAt &&
      v.registrationEndAt <= v.registrationStartAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationEndAt'],
        message: 'Registration end must be after registration start',
      });
    }
    if (v.registrationEndAt && v.registrationEndAt > v.startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationEndAt'],
        message: 'Registration must close before the event starts',
      });
    }
    if (v.visibility === 'UNIVERSITY' && !v.organizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationId'],
        message: 'University events require an organization',
      });
    }
    if (v.isPaid && (v.price === undefined || v.price === null || v.price <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'Paid events must set a positive price (payments are not enabled yet)',
      });
    }
    if (!v.isPaid && v.price !== undefined && v.price !== null && v.price !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'Free events must not set a price',
      });
    }
    const ids = new Set(v.problemIds);
    if (ids.size !== v.problemIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['problemIds'],
        message: 'Duplicate problems are not allowed',
      });
    }
  });

export type EventCreateInput = z.infer<typeof eventCreateSchema>;

/** Organizer PATCH on drafts (and limited fields after publish). */
export const eventUpdateSchema = z
  .object({
    title: z.string().trim().min(5).max(160).optional(),
    description: z.string().trim().min(20).max(20_000).optional(),
    eventType: z.enum(EVENT_TYPES).optional(),
    visibility: z.enum(EVENT_VISIBILITIES).optional(),
    organizationId: z.string().uuid().nullable().optional(),
    difficulty: z.enum(QUESTION_DIFFICULTIES).optional(),
    bannerKey: z.string().trim().min(1).max(512).nullable().optional(),
    maxParticipants: z.number().int().min(2).max(100_000).nullable().optional(),
    registrationStartAt: eventDatePreprocess.nullable().optional(),
    registrationEndAt: eventDatePreprocess.nullable().optional(),
    startAt: eventDatePreprocess.optional(),
    endAt: eventDatePreprocess.optional(),
    durationMinutes: z
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .optional(),
    rules: z.string().trim().min(10).max(20_000).nullable().optional(),
    problemIds: z.array(z.string().uuid()).max(200).optional(),
    // Null clears the code; editable any time by the manager.
    entryCode: z.string().trim().min(4).max(32).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.startAt && v.endAt && v.endAt <= v.startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endAt'],
        message: 'End must be after start',
      });
    }
    if (v.problemIds) {
      const ids = new Set(v.problemIds);
      if (ids.size !== v.problemIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['problemIds'],
          message: 'Duplicate problems are not allowed',
        });
      }
    }
  });

export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

export const eventStatusSchema = z.enum(EVENT_STATUSES);

/** Entry code for private events (register/join bodies). */
export const eventCodeSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
});

export type EventCodeInput = z.infer<typeof eventCodeSchema>;

/** Discovery filters shared by list endpoint + web tabs. */
export const eventListQuerySchema = z.object({
  phase: z.enum(['live', 'upcoming', 'past', 'active', 'mine']).optional(),
  // Provenance filter: official (admin-created) vs community (user-created).
  origin: z.enum(['official', 'community']).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
  visibility: z.enum(EVENT_VISIBILITIES).optional(),
  difficulty: z.enum(QUESTION_DIFFICULTIES).optional(),
  organizationId: z.string().uuid().optional(),
  freeOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type EventListQuery = z.infer<typeof eventListQuerySchema>;

/** Persist one answer selection; correctness is always server-computed. */
export const eventAnswerSchema = z.object({
  selectedOptionId: z.string().uuid(),
  currentPosition: z.number().int().min(0).max(500).optional(),
});

export type EventAnswerInput = z.infer<typeof eventAnswerSchema>;

export const eventReviewSchema = z.object({
  markedForReview: z.boolean(),
  currentPosition: z.number().int().min(0).max(500).optional(),
});

export type EventReviewInput = z.infer<typeof eventReviewSchema>;

export const eventLeaderboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type EventLeaderboardQuery = z.infer<typeof eventLeaderboardQuerySchema>;

export const eventParticipantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type EventParticipantsQuery = z.infer<typeof eventParticipantsQuerySchema>;

/** Organizer/admin lifecycle transition target. Publish flow validates completeness. */
export const eventTransitionSchema = z.object({
  to: z.enum([
    'PUBLISHED',
    'REGISTRATION_OPEN',
    'REGISTRATION_CLOSED',
    'LIVE',
    'COMPLETED',
    'CANCELLED',
    'ARCHIVED',
  ]),
});

export type EventTransitionInput = z.infer<typeof eventTransitionSchema>;

/** Invite a user (by id) or email to a private/university event. */
export const eventInviteSchema = z
  .object({
    invitedUserId: z.string().uuid().optional(),
    invitedEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  })
  .refine((v) => Boolean(v.invitedUserId || v.invitedEmail), {
    message: 'Invite a user or an email address',
  });

export type EventInviteInput = z.infer<typeof eventInviteSchema>;

/** Respond to an event invitation. Defaults to accept when omitted. */
export const eventInviteRespondSchema = z.object({
  accept: z.boolean().default(true),
});

export type EventInviteRespondInput = z.infer<typeof eventInviteRespondSchema>;

/** Organization creation (admin/organizer). */
export const organizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Invalid slug'),
  description: z.string().trim().max(5_000).optional(),
});

export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;

export const notificationListQuerySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

// ─── Profile (Prompt 15) ────────────────────────────────────────────────
// Owner-only mutations. Unknown keys (roles, points, streaks, achievements)
// are stripped — those are server-owned and never client-settable.

export const displayNameSchema = z.string().trim().min(2, 'Display name is required').max(60);

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  username: usernameSchema.optional(),
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters').optional(),
  country: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z\s.'-]+$/, 'Country contains invalid characters')
    .optional(),
  institution: z.string().trim().min(1).max(160).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  isPrivate: z.boolean().optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const usernameParamSchema = z.object({
  username: usernameSchema,
});

export const activityRangeSchema = z.object({
  days: z.coerce.number().int().min(7).max(366).default(182),
});

export type ActivityRangeQuery = z.infer<typeof activityRangeSchema>;

export const ratingHistoryProfileQuerySchema = z.object({
  source: z.enum(['all', 'challenge', 'contest']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type RatingHistoryProfileQuery = z.infer<typeof ratingHistoryProfileQuerySchema>;

export const recentActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type RecentActivityQuery = z.infer<typeof recentActivityQuerySchema>;

// ─── Rewards (Prompt 16) ────────────────────────────────────────────────
// No schema accepts a points amount from the client — amounts resolve
// server-side from RewardRule/Achievement rows. Unknown keys are stripped.

export const pointsHistoryQuerySchema = z.object({
  type: z.enum(['EARN', 'SPEND', 'ADJUST', 'REVERSAL', 'REFUND']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PointsHistoryQuery = z.infer<typeof pointsHistoryQuerySchema>;

export const rewardCatalogQuerySchema = z.object({
  category: z.string().trim().min(1).max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RewardCatalogQuery = z.infer<typeof rewardCatalogQuerySchema>;

/** Redemption request. Amount comes from the catalog row, never the client. */
export const redeemRewardSchema = z.object({
  rewardId: z.string().uuid('A valid reward is required'),
  idempotencyKey: z.string().trim().min(8).max(64).optional(),
});

export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>;

export const redemptionListQuerySchema = z.object({
  status: z
    .enum(['PENDING', 'PROCESSING', 'FULFILLED', 'CANCELLED', 'FAILED', 'REFUNDED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RedemptionListQuery = z.infer<typeof redemptionListQuerySchema>;

/** Admin reward create/update. Stock/prices are admin-only by route guard. */
export const adminRewardUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().min(1).max(40).default('merch'),
  pointsCost: z.number().int().min(1).max(1_000_000),
  imageKey: z.string().trim().min(1).max(512).optional(),
  stockQuantity: z.number().int().min(0).max(1_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type AdminRewardUpsertInput = z.infer<typeof adminRewardUpsertSchema>;

/** PATCH semantics: every field optional, at least one present. */
export const adminRewardPatchSchema = adminRewardUpsertSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });

export type AdminRewardPatchInput = z.infer<typeof adminRewardPatchSchema>;

/** Built-in firing events. Custom triggers are free-form strings (same shape). */
export const KNOWN_REWARD_TRIGGERS = [
  'onboarding',
  'problem-solve',
  'challenge-complete',
  'contest-participate',
  'event-participate',
] as const;

/** Admin earning-rule create: key identity + firing trigger + payout + limits. */
export const adminRewardRuleCreateSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Key must be lowercase letters, numbers and hyphens.'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  trigger: z.string().trim().min(2).max(80),
  points: z.number().int().min(1).max(10_000),
  category: z.string().trim().min(1).max(40).default('activity'),
  dailyCap: z.number().int().min(1).max(100_000).nullable().optional(),
  maxPerUser: z.number().int().min(1).max(1_000_000).nullable().optional(),
  cooldownSeconds: z.number().int().min(60).max(31_536_000).nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type AdminRewardRuleCreateInput = z.infer<typeof adminRewardRuleCreateSchema>;

/** PATCH semantics: every field optional except the immutable key. */
export const adminRewardRuleUpdateSchema = adminRewardRuleCreateSchema
  .omit({ key: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });

export type AdminRewardRuleUpdateInput = z.infer<typeof adminRewardRuleUpdateSchema>;

/**
 * Admin achievement edit: display + payout only. Unlock conditions stay
 * code-driven (AchievementsService.isEligible) — the admin controls what a
 * badge says and pays, not when it fires.
 */
export const adminAchievementUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    category: z.string().trim().min(1).max(40).optional(),
    points: z.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });

export type AdminAchievementUpdateInput = z.infer<typeof adminAchievementUpdateSchema>;

export const adminRewardStockSchema = z.object({
  stockQuantity: z.number().int().min(0).max(1_000_000).nullable(),
});

export type AdminRewardStockInput = z.infer<typeof adminRewardStockSchema>;

export const adminRedemptionStatusSchema = z.object({
  status: z.enum(['PROCESSING', 'FULFILLED', 'CANCELLED', 'FAILED']),
});

export type AdminRedemptionStatusInput = z.infer<typeof adminRedemptionStatusSchema>;

/** Manual point correction. Signed amount, audited, admin-only by route. */
export const adminPointsAdjustSchema = z.object({
  amount: z
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((value) => value !== 0, {
      message: 'Amount must not be zero.',
    }),
  reason: z.string().trim().min(5).max(500),
});

export type AdminPointsAdjustInput = z.infer<typeof adminPointsAdjustSchema>;

// ─── Search + Discovery (Prompt 17) ─────────────────────────────────────
// Tight bounds: max 120-char queries, max 50 rows per page. No amount-like
// fields exist here at all; ranking inputs are server-owned.

export const searchResultTypeSchema = z.enum([
  'PROBLEM',
  'TOPIC',
  'LEARNING',
  'CONTEST',
  'EVENT',
  'DISCUSSION',
]);

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  type: z
    .enum(['all', 'PROBLEM', 'TOPIC', 'LEARNING', 'CONTEST', 'EVENT', 'DISCUSSION'])
    .default('all'),
  topic: z.string().trim().min(1).max(80).optional(),
  difficulty: difficultySchema.optional(),
  ratingMin: z.coerce.number().min(0).max(4000).optional(),
  ratingMax: z.coerce.number().min(0).max(4000).optional(),
  exam: z.string().trim().min(1).max(80).optional(),
  solved: booleanQuerySchema.optional(),
  favorited: booleanQuerySchema.optional(),
  sort: z.enum(['relevance', 'newest', 'rating']).default('relevance'),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const suggestionsQuerySchema = z.object({
  q: z.string().trim().min(1).max(60),
});

export type SuggestionsQuery = z.infer<typeof suggestionsQuerySchema>;

export const searchAnalyticsSchema = z.object({
  event: z.enum(['search', 'click']),
  query: z.string().trim().min(1).max(120),
  sessionKey: z.string().trim().min(1).max(64).optional(),
  resultType: searchResultTypeSchema.optional(),
  resultId: z.string().uuid().optional(),
});

export type SearchAnalyticsInput = z.infer<typeof searchAnalyticsSchema>;

export const recommendationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export type RecommendationsQuery = z.infer<typeof recommendationsQuerySchema>;

// ─── Admin Panel + Moderation (Prompt 18) ─────────────────────────────
// Explicit whitelists: role/status transitions and reasons are validated,
// never mass-assigned. No schema accepts balances, hashes or secrets.

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'DEACTIVATED']).optional(),
  role: z.string().trim().min(1).max(40).optional(),
  institution: z.string().trim().min(1).max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const adminUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'DEACTIVATED']),
  reason: z.string().trim().min(5).max(500),
  suspendedUntil: z.coerce.date().optional(),
});

export type AdminUserStatusInput = z.infer<typeof adminUserStatusSchema>;

export const adminUserRolesSchema = z.object({
  roles: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
});

export type AdminUserRolesInput = z.infer<typeof adminUserRolesSchema>;

export const adminContributionsQuerySchema = z.object({
  status: z.enum(CONTRIBUTION_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminContributionsQuery = z.infer<typeof adminContributionsQuerySchema>;

/**
 * Forgiving slug normalization: "Time and Work" → "time-and-work", so a
 * hand-typed topic never becomes a rejection. The lookup against real topics
 * is the actual validation; the schema only guards length.
 */
export function normalizeSlugInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export const contributionReviewActionSchema = z.object({
  note: z.string().trim().max(2000).optional(),
  feedback: z.string().trim().min(5).max(2000).optional(),
  // Approve-only: explicit taxonomy mapping when the contribution carries no
  // usable topic link. Ignored by reject / request-changes. Free-form human
  // input is normalized server-side before the topic lookup.
  topicSlug: z.string().trim().min(1).max(120).optional(),
});

/**
 * Reviewer modifications on a pending contribution: full content replace
 * (same question shape) plus taxonomy/rating/folders, with an internal note.
 * Topic may be free text (matched) or an exact slug; slug wins when both.
 */
export const contributionEditSchema = contributionQuestionBase
  .omit({ topic: true })
  .extend({
    topic: z.string().trim().min(2).max(64).optional(),
    topicSlug: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.correctAnswerIndex < value.options.length, {
    path: ['correctAnswerIndex'],
    message: 'Correct answer index must point to an existing option',
  });

export type ContributionEditInput = z.infer<typeof contributionEditSchema>;

export type ContributionReviewActionInput = z.infer<typeof contributionReviewActionSchema>;

export const aiReviewPayloadSchema = z.object({
  model: z.string().trim().min(1).max(80),
  suggestedTopic: z.string().trim().max(120).optional(),
  suggestedSubtopic: z.string().trim().max(120).optional(),
  suggestedDifficulty: difficultySchema.optional(),
  duplicateProbability: z.number().min(0).max(1).optional(),
  answerConsistent: z.boolean().optional(),
  issues: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  recommendation: z.enum(['APPROVE', 'REVIEW', 'REJECT']),
  rawResponse: z.unknown().optional(),
});

export type AiReviewPayloadInput = z.infer<typeof aiReviewPayloadSchema>;

export const adminProblemsQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  status: z.enum(PROBLEM_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminProblemsQuery = z.infer<typeof adminProblemsQuerySchema>;

const adminProblemOptionSchema = z
  .object({
    text: z.string().trim().min(1, 'Option text is required').max(500).optional(),
    assetKey: storageKeySchema.optional(),
    isCorrect: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.text || value.assetKey), {
    message: 'An option needs text or an image',
  });

const adminProblemAssetSchema = z.object({
  key: storageKeySchema,
  kind: z.enum(['QUESTION_IMAGE', 'EXPLANATION_IMAGE']),
  /** Echoed from the POST /storage/uploads response — never typed by hand. */
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024),
  altText: z.string().trim().max(200).optional(),
});

/**
 * Direct admin problem creation (Admin → Problems → New). Slug-based so the
 * form works with names, not UUIDs. Questions and options may carry images
 * (keys from POST /storage/uploads): statement stays required unless at
 * least one question image is attached; contentMode derives server-side.
 * Rating is the source of truth for difficulty — an explicit difficulty
 * wins, otherwise it derives from the band (1000–1200 EASY, 1300–1600
 * MEDIUM, 1700–2000 HARD); rating defaults to 1500. Topic and subtopic are
 * optional (a problem always needs its section/category). Admin creation
 * always goes live at once — there is no draft detour on this path.
 */
export const adminProblemCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    statement: z.string().trim().min(1).max(5000).optional(),
    assets: z.array(adminProblemAssetSchema).max(4).default([]),
    explanation: z.string().trim().min(1).max(8000).optional(),
    shortcut: z.string().trim().min(1).max(4000).optional(),
    difficulty: difficultySchema.optional(),
    rating: questionRatingSchema.default(1500),
    source: z.string().trim().max(200).optional(),
    sourceYear: z.number().int().min(1900).max(2100).optional(),
    categorySlug: z.string().trim().min(1).max(80),
    topicSlug: z.string().trim().min(1).max(80).optional(),
    subtopicSlug: z.string().trim().min(1).max(80).optional(),
    options: z
      .array(adminProblemOptionSchema)
      .min(2, 'A problem needs at least two options')
      .max(8, 'A problem supports at most eight options'),
    examTagSlugs: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  })
  .superRefine((value, ctx) => {
    const correct = value.options.filter((option) => option.isCorrect === true).length;
    if (correct !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Exactly one option must be marked correct',
      });
    }
    const hasQuestionImage = value.assets.some((asset) => asset.kind === 'QUESTION_IMAGE');
    if (!value.statement && !hasQuestionImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['statement'],
        message: 'Write the question text or attach a question image',
      });
    }
    if (value.subtopicSlug && !value.topicSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['topicSlug'],
        message: 'Pick a topic before its subtopic',
      });
    }
  });

export type AdminProblemCreateInput = z.infer<typeof adminProblemCreateSchema>;

export const adminProblemPatchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  statement: z.string().trim().min(1).max(5000).optional(),
  explanation: z.string().trim().min(1).max(8000).nullable().optional(),
  difficulty: difficultySchema.optional(),
  /**
   * Question difficulty rating: whole hundreds within 1000–2000 only
   * (1000, 1100, …, 2000). Matches the database normalization migration.
   */
  rating: questionRatingSchema.optional(),
  /**
   * Exam-folder assignment (admin-curated Home folders). Replaces the full
   * link set; every slug must be an active exam tag. Omitted = unchanged.
   */
  examTagSlugs: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
});

export type AdminProblemPatchInput = z.infer<typeof adminProblemPatchSchema>;

export const reportCreateSchema = z.object({
  targetType: z.enum([
    'PROBLEM',
    'CONTRIBUTION',
    'DISCUSSION_POST',
    'DISCUSSION_REPLY',
    'EVENT',
    'CONTEST',
    'USER',
  ]),
  targetId: z.string().uuid('A valid target is required'),
  reason: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
});

export type ReportCreateInput = z.infer<typeof reportCreateSchema>;

export const adminReportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
  targetType: z
    .enum([
      'PROBLEM',
      'CONTRIBUTION',
      'DISCUSSION_POST',
      'DISCUSSION_REPLY',
      'EVENT',
      'CONTEST',
      'USER',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminReportsQuery = z.infer<typeof adminReportsQuerySchema>;

export const adminReportResolveSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']),
  assigneeId: z.string().uuid().nullable().optional(),
  resolution: z.string().trim().max(1000).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
});

export type AdminReportResolveInput = z.infer<typeof adminReportResolveSchema>;

export const adminContestsQuerySchema = z.object({
  status: z.enum(CONTEST_STATUSES).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminContestsQuery = z.infer<typeof adminContestsQuerySchema>;

export const adminContestPatchSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  rules: z.string().trim().max(10000).nullable().optional(),
});

export type AdminContestPatchInput = z.infer<typeof adminContestPatchSchema>;

export const auditLogsQuerySchema = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(120).optional(),
  targetType: z.string().trim().min(1).max(60).optional(),
  targetId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;

// ─── User feedback + AI quality signals (Prompt 24) ─────────────────────
// Lightweight launch-operations intake. Descriptions are bounded plain text
// (no attachments, no PII solicitation); categories and verdicts are strict
// enums so the ops queue stays triageable.

export const feedbackCategorySchema = z.enum([
  'bug',
  'incorrect-question',
  'ui-issue',
  'incorrect-answer',
  'inappropriate-content',
  'ai-issue',
  'feature-request',
  'other',
]);

export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const feedbackSubmitSchema = z.object({
  category: feedbackCategorySchema,
  description: z.string().trim().min(10).max(2000),
  page: z.string().trim().min(1).max(200).optional(),
});

export type FeedbackSubmitInput = z.infer<typeof feedbackSubmitSchema>;

export const feedbackQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
  category: feedbackCategorySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type FeedbackQuery = z.infer<typeof feedbackQuerySchema>;

export const adminFeedbackUpdateSchema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

export type AdminFeedbackUpdateInput = z.infer<typeof adminFeedbackUpdateSchema>;

export const aiFeatureSchema = z.enum([
  'performance-coach',
  'similar-problems',
  'contribution-review',
]);

export type AiFeatureName = z.infer<typeof aiFeatureSchema>;

export const aiFeedbackVerdictSchema = z.enum([
  'helpful',
  'not_helpful',
  'relevant',
  'not_relevant',
  'agree',
  'disagree',
]);

export type AiFeedbackVerdict = z.infer<typeof aiFeedbackVerdictSchema>;

export const aiFeedbackSubmitSchema = z.object({
  feature: aiFeatureSchema,
  targetId: z.string().uuid().optional(),
  verdict: aiFeedbackVerdictSchema,
});

export type AiFeedbackSubmitInput = z.infer<typeof aiFeedbackSubmitSchema>;
