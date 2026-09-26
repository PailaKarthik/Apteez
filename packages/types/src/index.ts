/**
 * Shared API + domain contracts for ApteeZ.
 *
 * These types are the single source of truth for the response envelope and
 * error contract consumed by the web app, the NestJS API and (later) mobile.
 * Database entities stay in `@apteez/database`; never leak ORM models here.
 */

/** Machine-readable error codes returned by the API. */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_IMPLEMENTED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'AUTH_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_EXISTS'
  | 'INVALID_OAUTH'
  | 'OAUTH_NOT_CONFIGURED'
  | 'EMAIL_NOT_CONFIGURED'
  | 'INVALID_EMAIL_OTP'
  | 'EMAIL_SEND_FAILED'
  | 'ATTEMPT_NOT_ACTIVE';

/** Client-side classification of failures (network vs server vs domain). */
export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'server'
  | 'network'
  | 'unknown';

/** A single field-level validation problem. */
export interface ApiFieldError {
  field: string;
  message: string;
  code?: string;
}

/** Error payload shared by every API error response. */
export interface ApiErrorBody {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  details?: ApiFieldError[];
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/** The envelope every API response uses. */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Metadata for paginated list responses (foundation for later prompts). */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  items: T[];
  meta: PageMeta;
}

/** Health of a single downstream dependency. */
export type DependencyStatus = 'up' | 'down';

export interface DependencyHealth {
  status: DependencyStatus;
  /** Milliseconds the check took; null when the check failed. */
  latencyMs: number | null;
}

/** Queue depth snapshot for operational visibility. Counts only, no payloads. */
export interface QueueHealth {
  status: DependencyStatus;
  waiting: number | null;
  active: number | null;
  delayed: number | null;
  failed: number | null;
}

/** Payload of GET /api/v1/health. Never contains secrets or URLs. */
export interface HealthData {
  status: 'ok' | 'degraded';
  version: string;
  /** Deployed commit SHA (or 'unknown' when the image did not inject one). */
  commit: string;
  /** Release tag when the deploy was cut from one, else null. */
  tag?: string | null;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: DependencyHealth;
    redis: DependencyHealth;
    queues?: Record<string, QueueHealth>;
  };
}

/** Review lifecycle for user-contributed questions. */
export const CONTRIBUTION_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const;

export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/** Aptitude question families supported by the platform. */
export const QUESTION_TYPES = [
  'QUANTITATIVE',
  'LOGICAL_REASONING',
  'VERBAL',
  'DATA_INTERPRETATION',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

/**
 * Canonical question rating bands (whole hundreds, 1000–2000):
 * 1000–1200 EASY, 1300–1600 MEDIUM, 1700–2000 HARD.
 * Single source of truth — API normalization and web display both use it.
 */
export function difficultyForRating(rating: number): QuestionDifficulty {
  if (rating <= 1200) {
    return 'EASY';
  }
  if (rating <= 1600) {
    return 'MEDIUM';
  }
  return 'HARD';
}

export const RATING_BAND_LABELS: Record<QuestionDifficulty, string> = {
  EASY: '1000–1200',
  MEDIUM: '1300–1600',
  HARD: '1700–2000',
};

/** Header carrying the request/correlation id on every response. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Safe authenticated-user profile returned by GET /api/v1/auth/me and by
 * login/register responses. Never contains password hashes, session tokens
 * or internal security fields — the service layer maps to this shape.
 */
export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  country: string | null;
  /** University / college affiliation. */
  institution: string | null;
  bio: string | null;
  /** IANA timezone for activity day boundaries; null means UTC. */
  timezone: string | null;
  isPrivate: boolean;
  isActive: boolean;
  /** ISO timestamp when the email was verified (OTP or OAuth), null until then. */
  emailVerified: string | null;
  roles: string[];
  /** Flattened `action:resource` grants for frontend visibility. The backend
   * re-checks every request; these never grant anything by themselves. */
  permissions: string[];
}

/** Problem publication lifecycle (mirrors the Prisma enum). */
export const PROBLEM_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
  'REJECTED',
] as const;

export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

/** How a problem carries its content; renderers branch on this. */
export const PROBLEM_CONTENT_MODES = ['TEXT_ONLY', 'IMAGE_ONLY', 'TEXT_AND_IMAGE'] as const;

export type ProblemContentMode = (typeof PROBLEM_CONTENT_MODES)[number];

export type ProblemDifficulty = QuestionDifficulty;

/** Allowlisted sort keys — raw client ordering is never accepted. */
export const PROBLEM_SORT_KEYS = ['newest', 'oldest', 'rating_desc', 'rating_asc'] as const;

export type ProblemSortKey = (typeof PROBLEM_SORT_KEYS)[number];

/** Cursor-paginated collection; cursors are opaque to clients. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

/**
 * Offset-paginated collection for steadily growing lists (e.g. challenge
 * history). `total` is the row count at read time; callers clamp out-of-range
 * offsets client-side.
 */
export interface OffsetPage<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface ProblemRefDto {
  slug: string;
  name: string;
}

export interface ProblemOptionDto {
  id: string;
  position: number;
  text: string | null;
  /** Resolved through the storage layer; null for text-only options. */
  assetUrl: string | null;
}

export interface ProblemAssetDto {
  id: string;
  kind: 'QUESTION_IMAGE' | 'EXPLANATION_IMAGE' | 'OTHER';
  url: string;
  mimeType: string;
  position: number;
  altText: string | null;
}

/** List/card projection — deliberately excludes content and answers. */
export interface ProblemSummaryDto {
  id: string;
  title: string;
  contentMode: ProblemContentMode;
  difficulty: ProblemDifficulty;
  rating: number;
  category: ProblemRefDto;
  /** Null when filed without a topic (allowed at creation). */
  topic: ProblemRefDto | null;
  subtopic: ProblemRefDto | null;
  examTags: ProblemRefDto[];
  optionCount: number;
  hasImage: boolean;
  hasExplanation: boolean;
  hasShortcut: boolean;
  publishedAt: string | null;
  createdAt: string;
  /** Global solve accuracy 0–100 across all attempts, or null with no data. */
  accuracy: number | null;
  solvedCount: number;
  /** Present only for authenticated callers. */
  isSolved?: boolean;
  isFavorited?: boolean;
}

/** Detail projection — includes content but never the correct answer. */
export interface ProblemDetailDto extends ProblemSummaryDto {
  statement: string | null;
  assets: ProblemAssetDto[];
  options: ProblemOptionDto[];
  source: string | null;
  sourceYear: number | null;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  problemCount: number;
}

export interface TopicDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  subtopics: ProblemRefDto[];
  problemCount: number;
}

export interface SubtopicDto extends ProblemRefDto {
  id: string;
  description: string | null;
  problemCount: number;
}

export interface ExamTagDto extends ProblemRefDto {
  id: string;
  description: string | null;
  problemCount: number;
}

/**
 * Exam-pattern folder for the Home page: an admin-curated exam tag with its
 * live published-problem footprint — top categories and difficulty mix.
 * Everything is computed from the database; there are no static folders.
 */
export interface ExamPatternCategoryDto {
  name: string;
  slug: string;
  problemCount: number;
}

export interface ExamPatternDifficultyMix {
  easy: number;
  medium: number;
  hard: number;
}

export interface ExamPatternDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  problemCount: number;
  topCategories: ExamPatternCategoryDto[];
  difficultyMix: ExamPatternDifficultyMix;
  /** Human label derived from the mix (e.g. "Easy–Med", "Hard", "New"). */
  difficultyBand: string;
}

/**
 * Practice-area card for the Home page: a taxonomy category with its live
 * published count plus the caller's solved progress (0 when signed out).
 */
export interface PracticeAreaDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  problemCount: number;
  solvedCount: number;
  /** 0–100 solved share; 0 when the area is empty or the caller is anonymous. */
  completionPct: number;
}

/** Total matching problems for the current problem-library filters. */
export interface ProblemsCountDto {
  total: number;
}

/** Attempt lifecycle (mirrors the Prisma enum). */
export const ATTEMPT_STATUSES = ['STARTED', 'SUBMITTED', 'ABANDONED', 'EXPIRED'] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export type SubmissionContext = 'PRACTICE' | 'CHALLENGE' | 'CONTEST';

/** Returned when a practice attempt is created. */
export interface AttemptDto {
  id: string;
  problemId: string;
  context: SubmissionContext;
  status: AttemptStatus;
  startedAt: string;
}

/** Safe answer payload — only sent after an attempt is finalized. */
export interface AttemptAnswerDto {
  selectedOptionId: string | null;
  correctOptionId: string | null;
  isCorrect: boolean;
  explanation: string | null;
  shortcut: string | null;
  timeSpentSeconds: number | null;
}

/** Result of a submission (also returned idempotently on replay). */
export interface AttemptResultDto {
  attempt: AttemptDto;
  result: AttemptAnswerDto;
  problem: ProblemDetailDto;
}

/** Lightweight per-user practice statistics for one problem. */
export interface ProblemUserStatsDto {
  solved: boolean;
  attemptCount: number;
  correctCount: number;
  incorrectCount: number;
  personalAccuracy: number | null;
  averageTimeSeconds: number | null;
  lastAttemptAt: string | null;
}

/** Recent practice activity row (no question bodies). */
export interface RecentSubmissionDto {
  id: string;
  problem: { id: string; title: string };
  category: ProblemRefDto;
  topic: ProblemRefDto | null;
  difficulty: ProblemDifficulty;
  isCorrect: boolean;
  timeSpentSeconds: number | null;
  submittedAt: string;
}

/** Allowlisted orderings for favorite-collection problem lists. */
export const FAVORITE_ITEM_SORT_KEYS = [
  'added_desc',
  'added_asc',
  'rating_desc',
  'rating_asc',
  'title_asc',
] as const;

export type FavoriteItemSortKey = (typeof FAVORITE_ITEM_SORT_KEYS)[number];

export interface FavoriteCollectionDto {
  id: string;
  name: string;
  isDefault: boolean;
  problemCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A saved problem, ordered by when it was added to the collection. */
export interface FavoriteProblemDto extends ProblemSummaryDto {
  /** When the problem was added to this collection. */
  addedAt: string;
}

/** Which of the caller's collections currently contain a problem. */
export interface FavoriteMembershipDto {
  problemId: string;
  collectionIds: string[];
  isFavorited: boolean;
}

// ─── 1v1 challenges ──────────────────────────────────────────────────────

export const CHALLENGE_STATUSES = [
  'MATCHMAKING',
  'MATCHED',
  'COUNTDOWN',
  'LIVE',
  'COMPLETED',
  'CANCELLED',
  'ABANDONED',
  'EXPIRED',
] as const;

export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export const CHALLENGE_OUTCOMES = [
  'PLAYER1_WIN',
  'PLAYER2_WIN',
  'DRAW',
  'ABANDONED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type ChallengeOutcome = (typeof CHALLENGE_OUTCOMES)[number];

export const CHALLENGE_COMPLETION_REASONS = [
  'COMPLETED',
  'TIMER_EXPIRED',
  'ABANDONED',
  'DISCONNECT_TIMEOUT',
  'CANCELLED',
] as const;

export type ChallengeCompletionReason = (typeof CHALLENGE_COMPLETION_REASONS)[number];

/** Default competitive rating for a fresh (user, domain) pair. */
export const DEFAULT_CHALLENGE_RATING = 1000;

/** Tunable challenge rules — server-side only, never trusted from a client. */
export interface ChallengeConfigDto {
  domainSlug: string;
  questionCount: number;
  durationSeconds: number;
  minReadingSeconds: number;
  /** Acceptable rating gap at match time 0; widens as waiting continues. */
  initialRatingWindow: number;
  /** Additional rating window per second spent waiting. */
  ratingWindowGrowthPerSecond: number;
  maxRatingWindow: number;
  /** Seconds a disconnected player has to return before abandonment. */
  reconnectGraceSeconds: number;
  countdownSeconds: number;
}

export interface MatchmakingRequestDto {
  requestId: string;
  domainSlug: string;
  rating: number;
  queuedAt: string;
}

export interface ChallengeOpponentDto {
  id: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  rating: number;
  score: number | null;
  answeredCount: number;
  connected: boolean;
}

/** One question as seen by a player — never carries `isCorrect`. */
export interface ChallengeQuestionViewDto {
  position: number;
  problemId: string;
  title: string;
  statement: string | null;
  difficulty: ProblemDifficulty;
  contentMode: ProblemContentMode;
  assets: ProblemAssetDto[];
  options: ProblemOptionDto[];
  /** Earliest server time an answer may be accepted for this question. */
  answerableAt: string;
}

export interface ChallengeScoreboardDto {
  correct: number;
  wrong: number;
  unanswered: number;
  score: number;
}

export interface ChallengeStateDto {
  id: string;
  domainSlug: string;
  domainName: string;
  status: ChallengeStatus;
  /** True for unrated solo runs against the house bot (endless, timed). */
  isSolo: boolean;
  config: ChallengeConfigDto;
  /** Which player this payload is for. */
  self: {
    id: string;
    rating: number;
    scoreboard: ChallengeScoreboardDto | null;
    answeredCount: number;
  };
  opponent: ChallengeOpponentDto | null;
  /** Server clock, so clients can compute display timers without trusting theirs. */
  serverTime: string;
  countdownEndsAt: string | null;
  startedAt: string | null;
  endsAt: string | null;
  /** Present only for the player whose action is currently expected. */
  question: ChallengeQuestionViewDto | null;
  questionCount: number;
  /** Positions this player has already answered (never reveals the choice). */
  answeredPositions: number[];
}

export interface ChallengeResultPlayerDto {
  id: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  rating: number;
  correct: number;
  wrong: number;
  unanswered: number;
  score: number;
}

export interface ChallengeResultQuestionDto {
  position: number;
  problemId: string;
  title: string;
  correctOptionId: string | null;
  player1OptionId: string | null;
  player2OptionId: string | null;
}

export interface ChallengeResultDto {
  id: string;
  domainSlug: string;
  domainName: string;
  outcome: ChallengeOutcome;
  completionReason: ChallengeCompletionReason;
  winnerId: string | null;
  /** True for unrated solo runs — ratingChange stays null by design. */
  isSolo: boolean;
  durationSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  player1: ChallengeResultPlayerDto;
  player2: ChallengeResultPlayerDto;
  questions: ChallengeResultQuestionDto[];
  /** Signed rating change per player; null until rating processing completes. */
  ratingChange: { self: number | null; opponent: number | null };
  /** Whether the rating engine has applied this challenge's result yet. */
  ratingStatus: RatingProcessingStatus;
}

export interface ChallengeHistoryEntryDto {
  id: string;
  domainSlug: string;
  domainName: string;
  outcome: ChallengeOutcome;
  completionReason: ChallengeCompletionReason;
  /** Result from the caller's point of view (solo runs always report their score). */
  result: 'WIN' | 'LOSS' | 'DRAW';
  /** True for unrated solo runs against the house bot. */
  isSolo: boolean;
  selfScore: number;
  opponentScore: number;
  /** Signed rating change for the caller; null until rating processing completes. */
  ratingChange: number | null;
  opponent: { id: string; username: string | null; displayName: string; avatarKey: string | null };
  playedAt: string;
  durationSeconds: number;
}

/** Aggregate challenge analytics for the caller, optionally scoped to a domain. */
export interface ChallengeHistoryStatsDto {
  domainSlug: string | null;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  bestScore: number | null;
  avgScore: number | null;
  totalCorrect: number;
  totalWrong: number;
}

/**
 * Lightweight "match found" payload. Sent the instant a challenge row exists —
 * before the heavyweight full-state snapshot (question content, signed URLs)
 * finishes loading — so the countdown UI can start on time even when the
 * database is slow (free-tier cold starts).
 */
export interface ChallengeMatchedPayload {
  status: 'MATCHED';
  challengeId: string;
  domainSlug: string;
  domainName: string;
  /** Server-authoritative moment the countdown ends and play begins. */
  countdownEndsAt: string;
  serverTime: string;
  isSolo: boolean;
  opponent: { displayName: string; rating: number };
}

/** Socket.IO event names for the challenge namespace (single source of truth). */
export const CHALLENGE_SOCKET_EVENTS = {
  /** client → server */ startMatchmaking: 'challenge:matchmaking:start',
  cancelMatchmaking: 'challenge:matchmaking:cancel',
  subscribe: 'challenge:subscribe',
  answer: 'challenge:answer',
  leave: 'challenge:leave',
  /** server → client */ matchmakingStatus: 'challenge:matchmaking:status',
  state: 'challenge:state',
  question: 'challenge:question',
  answerAck: 'challenge:answer:ack',
  opponent: 'challenge:opponent',
  opponentProgress: 'challenge:opponent:progress',
  playerConnected: 'challenge:player:connected',
  playerDisconnected: 'challenge:player:disconnected',
  /** Server began finalizing (timer hit zero): client should show "checking results". */
  finalizing: 'challenge:finalizing',
  completed: 'challenge:completed',
  error: 'challenge:error',
} as const;

/** Safe opponent progress update — never carries the opponent's choice. */
export interface ChallengeOpponentProgressDto {
  challengeId: string;
  userId: string;
  answeredCount: number;
  score: number | null;
}

export interface ChallengePlayerPresenceDto {
  challengeId: string;
  userId: string;
  connected: boolean;
  /** Seconds left for the opponent to reconnect, when known. */
  graceSecondsRemaining?: number;
}

export type ChallengeSocketEvent =
  (typeof CHALLENGE_SOCKET_EVENTS)[keyof typeof CHALLENGE_SOCKET_EVENTS];

export interface ChallengeSocketError {
  code: string;
  message: string;
}

export interface ChallengeAnswerAckDto {
  accepted: boolean;
  position: number;
  /** Never includes correctness mid-challenge. */
  answeredCount: number;
  nextQuestion: ChallengeQuestionViewDto | null;
  /**
   * Authoritative scoreboard right after this answer, so the UI can confirm
   * instantly without waiting for the next full state snapshot (which trails
   * by several slow round trips on free-tier databases).
   */
  selfScoreboard: ChallengeScoreboardDto | null;
  /** The answerer's fresh progress, mirrored to the opponent in the same push. */
  selfProgress: ChallengeOpponentProgressDto;
  /** Last-known opponent progress (no extra query); fresher values arrive live. */
  opponentProgress: ChallengeOpponentProgressDto | null;
}

// ─── Challenge rating (Prompt 10) ────────────────────────────────────────

/** Display tier derived from a numeric rating; never stored permanently. */
export const RATING_TIERS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'ELITE'] as const;

export type RatingTier = (typeof RATING_TIERS)[number];

export const RATING_TIER_LABELS: Record<RatingTier, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
  ELITE: 'Elite',
};

/** Lifecycle of the asynchronous rating step for a finalized challenge. */
export const RATING_PROCESSING_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;

export type RatingProcessingStatus = (typeof RATING_PROCESSING_STATUSES)[number];

/** A user's competitive standing in a single aptitude domain. */
export interface RatingDomainDto {
  domainSlug: string;
  domainName: string;
  rating: number;
  tier: RatingTier;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  /** Wins as a percentage of matches, one decimal, 0–100. */
  winRate: number;
  /** Signed rating change from the most recent rated match, null if none. */
  latestChange: number | null;
}

/** Aggregate record across every domain a user has played. */
export interface RatingTotalsDto {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

export interface RatingsOverviewDto {
  /** The caller (or target user) these ratings belong to. */
  userId: string;
  username: string | null;
  displayName: string;
  ratings: RatingDomainDto[];
  totals: RatingTotalsDto;
}

/** A user's perspective on a rated challenge outcome. */
export type RatingResult = 'WIN' | 'LOSS' | 'DRAW';

/** Append-only audit row: one per (challenge, user) rating change. */
export interface RatingHistoryEntryDto {
  id: string;
  challengeId: string;
  domainSlug: string;
  domainName: string;
  result: RatingResult;
  outcome: ChallengeOutcome;
  score: number;
  opponentScore: number;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  opponent: {
    id: string | null;
    username: string | null;
    displayName: string;
    avatarKey: string | null;
  } | null;
  createdAt: string;
}

/** A single leaderboard-ready row, sortable by rating DESC. */
export interface RatingLeaderboardEntryDto {
  rank: number;
  userId: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  institution: string | null;
  domainSlug: string;
  rating: number;
  tier: RatingTier;
  matches: number;
  winRate: number;
}

// ─── Contests (Prompt 11) ───────────────────────────────────────────────────

/** Authoritative contest lifecycle; participation only in open/live windows. */
export const CONTEST_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'REGISTRATION_OPEN',
  'LIVE',
  'ENDED',
  'CANCELLED',
  'ARCHIVED',
] as const;

export type ContestStatus = (typeof CONTEST_STATUSES)[number];

export const CONTEST_PARTICIPANT_STATUSES = [
  'REGISTERED',
  'ACTIVE',
  'SUBMITTED',
  'AUTO_SUBMITTED',
  'DISQUALIFIED',
] as const;

export type ContestParticipantStatus = (typeof CONTEST_PARTICIPANT_STATUSES)[number];

/** Lightweight card shown in discovery lists; never carries questions. */
export interface ContestSummaryDto {
  id: string;
  name: string;
  description: string | null;
  status: ContestStatus;
  /** Derived live/upcoming/past bucket for tabs. */
  phase: 'live' | 'upcoming' | 'past';
  difficulty: QuestionDifficulty;
  durationSeconds: number;
  durationMinutes: number;
  questionCount: number;
  participantCount: number;
  maxParticipants: number | null;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  registrationOpen: boolean;
  isRegistered: boolean;
  organizer: { id: string | null; displayName: string };
}

/** Full contest detail; questions included only when the caller may see them. */
export interface ContestDetailDto extends ContestSummaryDto {
  rules: string | null;
  scoringModel: 'SOLVED_COUNT';
  resultVisibility: 'ALWAYS' | 'AFTER_END' | 'AFTER_REGISTRATION_CLOSE';
  revealAnswersLive: boolean;
  participant: {
    status: ContestParticipantStatus;
    startedAt: string | null;
    effectiveEndAt: string | null;
    submittedAt: string | null;
    currentPosition: number;
  } | null;
}

/** One numbered slot in the navigator. Correctness never leaks while live. */
export interface ContestNavigatorItemDto {
  position: number;
  questionId: string;
  state: 'unanswered' | 'answered' | 'review' | 'current';
  /** Present only after the contest for this viewer (result/upsolve). */
  correctness?: 'correct' | 'incorrect' | 'unanswered';
}

/** A single contest question view; correctness only after the contest. */
export interface ContestQuestionViewDto {
  position: number;
  questionId: string;
  problemId: string;
  title: string;
  statement: string | null;
  contentMode: ProblemContentMode;
  difficulty: QuestionDifficulty;
  assets: ProblemAssetDto[];
  options: ProblemOptionDto[];
  selectedOptionId: string | null;
  markedForReview: boolean;
  answerable: boolean;
  /** Answer + explanation only when the viewer may see them (post-contest). */
  correctOptionId?: string | null;
  explanation?: string | null;
  shortcut?: string | null;
}

/** Authoritative session snapshot; drives timer + navigator + recovery. */
export interface ContestSessionDto {
  contestId: string;
  status: ContestStatus;
  participantStatus: ContestParticipantStatus;
  serverTime: string;
  startsAt: string;
  endsAt: string;
  startedAt: string;
  effectiveEndAt: string;
  remainingSeconds: number;
  submittedAt: string | null;
  currentPosition: number;
  totalQuestions: number;
  answeredCount: number;
  unansweredCount: number;
  reviewCount: number;
  questions: ContestNavigatorItemDto[];
  current: ContestQuestionViewDto;
}

/** Final submission preview counts shown in the confirm dialog. */
export interface ContestSubmitPreviewDto {
  answeredCount: number;
  unansweredCount: number;
  reviewCount: number;
  totalQuestions: number;
}

/** Persisted result for one participant. */
export interface ContestResultDto {
  contestId: string;
  participantStatus: ContestParticipantStatus;
  solvedCount: number;
  wrongCount: number;
  unansweredCount: number;
  score: number;
  completionSeconds: number;
  rank: number | null;
  totalParticipants: number;
  finalizedAt: string;
  submittedAt: string | null;
  autoSubmitted: boolean;
  rating: { before: number; after: number; change: number } | null;
}

/** One leaderboard row ordered by solved DESC, time ASC, userId ASC. */
export interface ContestLeaderboardEntryDto {
  rank: number;
  userId: string;
  username: string | null;
  /** Rating delta for this contest (null until ratings settle). */
  ratingChange: number | null;
  displayName: string;
  avatarKey: string | null;
  institution: string | null;
  solvedCount: number;
  score: number;
  wrongCount: number;
  completionSeconds: number;
  isCurrentUser: boolean;
}

/** Global contest-rating row: overall contest performance, rating DESC. */
export interface ContestRatingLeaderboardEntryDto {
  rank: number;
  userId: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  institution: string | null;
  rating: number;
  tier: RatingTier;
  contestsPlayed: number;
  bestRank: number | null;
}

/** Post-contest learning view; never mutates the frozen result. */
export interface ContestUpsolveDto {
  contestId: string;
  result: ContestResultDto | null;
  questions: Array<
    ContestQuestionViewDto & {
      correctness: 'correct' | 'incorrect' | 'unanswered';
      selectedOptionId: string | null;
    }
  >;
}

/** One attached question in the organizer manage view (never leaks correctness). */
export interface ContestManageQuestionDto {
  questionId: string;
  position: number;
  points: number;
  problem: { id: string; title: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD' };
}

/**
 * Organizer manage view: everything the wizard needs — format, attached
 * questions one by one, how many are still missing, and why publish is
 * blocked (empty when it can go live).
 */
export interface ContestManageDto {
  id: string;
  title: string;
  description: string | null;
  rules: string | null;
  status: ContestStatus;
  difficulty: QuestionDifficulty;
  questionCount: number;
  addedCount: number;
  durationSeconds: number;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  maxParticipants: number | null;
  participantCount: number;
  resultVisibility: 'ALWAYS' | 'AFTER_END' | 'AFTER_REGISTRATION_CLOSE';
  revealAnswersLive: boolean;
  canPublish: boolean;
  publishBlockers: string[];
  questions: ContestManageQuestionDto[];
  createdById: string | null;
  /** Rating pipeline state: PENDING | PROCESSING | COMPLETED | FAILED. */
  ratingStatus: string;
}

/**
 * Unfinished contest setups the caller may manage — the resume list. Only
 * DRAFT rows, newest first, with attach progress so the admin sees exactly
 * where each setup left off.
 */
export interface ContestDraftDto {
  id: string;
  title: string;
  questionCount: number;
  addedCount: number;
  durationMinutes: number;
  updatedAt: string;
}

/** Integrity signal types the client may report; stored off the result path. */
export const CONTEST_SUSPICIOUS_EVENT_TYPES = [
  'TAB_HIDDEN',
  'TAB_VISIBLE',
  'WINDOW_BLUR',
  'WINDOW_FOCUS',
  'COPY',
  'PASTE',
  'FULLSCREEN_ENTER',
  'FULLSCREEN_EXIT',
] as const;

export type ContestSuspiciousEventType = (typeof CONTEST_SUSPICIOUS_EVENT_TYPES)[number];

/** Socket events for contest start/end + timer sync (answers stay on REST). */
export const CONTEST_SOCKET_EVENTS = {
  subscribe: 'contest:subscribe',
  state: 'contest:state',
  status: 'contest:status',
  error: 'contest:error',
} as const;

export type ContestSocketEvent = (typeof CONTEST_SOCKET_EVENTS)[keyof typeof CONTEST_SOCKET_EVENTS];

// ─── Learning (Prompt 12) ───────────────────────────────────────────────────

/** Publication state for learning content (mirrors the Prisma enum). */
export const LEARNING_CONTENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export type LearningContentStatus = (typeof LEARNING_CONTENT_STATUSES)[number];

/** Lesson-level progress state; COMPLETED always requires a server action. */
export const LEARNING_PROGRESS_STATUSES = ['STARTED', 'COMPLETED'] as const;

export type LearningProgressStatus = (typeof LEARNING_PROGRESS_STATUSES)[number];

/** Future-compatible access metadata; all core content is FREE today. */
export const LEARNING_ACCESS_LEVELS = ['FREE', 'PREMIUM'] as const;

export type LearningAccessLevel = (typeof LEARNING_ACCESS_LEVELS)[number];

/** Structured lesson block. Discriminated on `kind`; renderers branch on it. */
export type LearningContentBlock =
  | { kind: 'text'; value: string }
  | { kind: 'heading'; value: string }
  | { kind: 'formula'; value: string }
  | { kind: 'note'; value: string }
  | { kind: 'example'; value: string }
  | { kind: 'image'; url: string; alt: string | null }
  | { kind: 'list'; value: string; items: string[] };

/** Learning domain card for the Explore grid; progress only for authed users. */
export interface LearningPathSummaryDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  difficulty: QuestionDifficulty;
  icon: string | null;
  estimatedMinutes: number;
  accessLevel: LearningAccessLevel;
  topicCount: number;
  lessonCount: number;
  /** Present only for authenticated callers. */
  progress?: {
    completedLessons: number;
    startedLessons: number;
    completedPercent: number;
  };
}

/** Learning path detail with its published topics (list projection). */
export interface LearningPathDetailDto extends LearningPathSummaryDto {
  topics: LearningTopicSummaryDto[];
}

/** Topic card inside a path; lessonCount comes from the denormalized column. */
export interface LearningTopicSummaryDto {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  order: number;
  estimatedMinutes: number;
  lessonCount: number;
  /** Present only for authenticated callers. */
  completedLessons?: number;
  completedPercent?: number;
}

/** Topic detail with its published lessons in reading order. */
export interface LearningTopicDetailDto extends LearningTopicSummaryDto {
  path: { slug: string; title: string };
  lessons: LearningLessonSummaryDto[];
  /** Viewer's lesson-level state keyed by lessonId (authed callers only). */
  progress: Record<string, LearningProgressStatus>;
}

/** Lesson card in a topic's reading order. */
export interface LearningLessonSummaryDto {
  id: string;
  slug: string;
  title: string;
  order: number;
  difficulty: QuestionDifficulty;
  estimatedMinutes: number;
  accessLevel: LearningAccessLevel;
  hasPractice: boolean;
  /** Present only for authenticated callers. */
  progressStatus?: LearningProgressStatus;
}

/** Structured learning block referencing an existing Problem record. */
export interface LearningPracticeRefDto {
  problemId: string;
  problemTitle: string;
  practiceCount: number;
}

/** Lesson detail; content blocks render through the shared block renderer. */
export interface LearningLessonDetailDto extends LearningLessonSummaryDto {
  conceptTitle: string | null;
  content: LearningContentBlock[];
  examTags: Array<{ id: string; name: string }>;
  practice: LearningPracticeRefDto[];
  /** Present only for authenticated callers. */
  progressStatus?: LearningProgressStatus;
  navigation: {
    topicSlug: string;
    topicTitle: string;
    pathSlug: string;
    pathTitle: string;
    prevLesson: { id: string; slug: string; title: string } | null;
    nextLesson: { id: string; slug: string; title: string } | null;
    position: number;
    total: number;
  };
}

/** Authenticated progress summary; powers resume + Explore percentages. */
export interface LearningProgressSummaryDto {
  startedLessons: number;
  completedLessons: number;
  totalPublishedLessons: number;
  completedPercent: number;
  /** Last touched lesson in reading order — null when nothing started yet. */
  resume: {
    lessonId: string;
    lessonTitle: string;
    lessonSlug: string;
    topicSlug: string;
    topicTitle: string;
    pathSlug: string;
    pathTitle: string;
    lastViewedAt: string;
    status: LearningProgressStatus;
  } | null;
}

/** One per-lesson progress row (list view of a user's learning history). */
export interface LearningProgressRowDto {
  lessonId: string;
  lessonTitle: string;
  lessonSlug: string;
  topicSlug: string;
  topicTitle: string;
  pathSlug: string;
  pathTitle: string;
  status: LearningProgressStatus;
  startedAt: string;
  completedAt: string | null;
  lastViewedAt: string;
}

// ─── Discussions (Prompt 13) ────────────────────────────────────────────────

/** Reaction a member may leave on a post or reply (one per target per user). */
export const DISCUSSION_REACTION_TYPES = ['UPVOTE', 'DOWNVOTE'] as const;

export type DiscussionReactionType = (typeof DISCUSSION_REACTION_TYPES)[number];

/** Why a member reported a post or reply; moderation triages from here. */
export const DISCUSSION_REPORT_REASONS = [
  'SPAM',
  'ABUSE',
  'OFF_TOPIC',
  'INAPPROPRIATE',
  'OTHER',
] as const;

export type DiscussionReportReason = (typeof DISCUSSION_REPORT_REASONS)[number];

/** Moderation lifecycle of a report. */
export const DISCUSSION_REPORT_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;

export type DiscussionReportStatus = (typeof DISCUSSION_REPORT_STATUSES)[number];

/** Sort keys accepted by the thread list endpoint. */
export const DISCUSSION_SORT_KEYS = ['latest', 'top', 'unanswered'] as const;

export type DiscussionSortKey = (typeof DISCUSSION_SORT_KEYS)[number];

/** Author identity projected onto a thread/reply; never leaks private fields. */
export interface DiscussionAuthorDto {
  id: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  institution: string | null;
}

/** Lightweight thread card for discovery lists. */
export interface DiscussionThreadSummaryDto {
  id: string;
  title: string;
  /** Plain-text excerpt of the body, truncated server-side for lists. */
  excerpt: string;
  tags: string[];
  author: DiscussionAuthorDto;
  problemId: string | null;
  isPinned: boolean;
  isLocked: boolean;
  isResolved: boolean;
  viewCount: number;
  reactionCount: number;
  replyCount: number;
  lastActivityAt: string;
  createdAt: string;
  /** The caller's own reaction on the thread, when authenticated. */
  myReaction: DiscussionReactionType | null;
}

/** One reply inside a thread detail view. */
export interface DiscussionReplyDto {
  id: string;
  postId: string;
  body: string;
  author: DiscussionAuthorDto;
  isAcceptedSolution: boolean;
  reactionCount: number;
  createdAt: string;
  updatedAt: string;
  myReaction: DiscussionReactionType | null;
  /** Thread author (or a moderator) may accept exactly one solution. */
  canAccept: boolean;
  /** Author of the reply may edit/delete it; moderators may too. */
  canEdit: boolean;
}

/** Full thread view: the post plus its (paginated) replies. */
export interface DiscussionThreadDetailDto extends DiscussionThreadSummaryDto {
  body: string;
  /** Caller may mutate the thread (author or moderator). */
  canEdit: boolean;
  canModerate: boolean;
  replies: DiscussionReplyDto[];
  replyPage: number;
  replyPageSize: number;
  replyTotal: number;
}

/** Result of toggling a reaction; the server owns the rebuilt counter. */
export interface DiscussionReactionResultDto {
  target: 'post' | 'reply';
  targetId: string;
  reactionCount: number;
  myReaction: DiscussionReactionType | null;
}

// ─── Events (Prompt 14) ───────────────────────────────────────────────────
// Full aptitude-events platform. Events reference canonical Problems via
// EventQuestion rows (never duplicated content) so the future AI/RAG layer
// (Similar Problems over pgvector, Performance Coach over results) stays
// clean. Paid-event readiness is structural only: isPaid/price/payment
// fields exist but no processor is wired.

/** Authoritative event lifecycle; backend owns every transition. */
export const EVENT_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'LIVE',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Who may discover / register for an event. */
export const EVENT_VISIBILITIES = ['PUBLIC', 'PRIVATE', 'UNIVERSITY', 'COMMUNITY'] as const;

export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

/** Organizer-chosen event category. */
export const EVENT_TYPES = [
  'CONTEST',
  'QUIZ',
  'WORKSHOP',
  'MARATHON',
  'MEETUP',
  'AMA',
  'HACKATHON',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_PARTICIPANT_STATUSES = [
  'REGISTERED',
  'WAITLISTED',
  'ACTIVE',
  'SUBMITTED',
  'AUTO_SUBMITTED',
  'WITHDRAWN',
  'DISQUALIFIED',
] as const;

export type EventParticipantStatus = (typeof EVENT_PARTICIPANT_STATUSES)[number];

export const EVENT_INVITE_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'] as const;

export type EventInviteStatus = (typeof EVENT_INVITE_STATUSES)[number];

/** Lightweight card for discovery lists; never carries questions. */
export interface EventSummaryDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  eventType: EventType;
  visibility: EventVisibility;
  status: EventStatus;
  /** Derived bucket for tabs: live | upcoming | past. */
  phase: 'live' | 'upcoming' | 'past';
  difficulty: QuestionDifficulty;
  durationMinutes: number;
  questionCount: number;
  participantCount: number;
  maxParticipants: number | null;
  spotsLeft: number | null;
  registrationOpen: boolean;
  isRegistered: boolean;
  /** True for admin-created official events, false for community (user) ones. */
  isOfficial: boolean;
  isPaid: boolean;
  price: number | null;
  startsAt: string;
  endsAt: string;
  registrationStartAt: string | null;
  registrationEndAt: string | null;
  organizer: { id: string | null; displayName: string };
  organization: { id: string | null; name: string } | null;
}

/** Full event detail. */
export interface EventDetailDto extends EventSummaryDto {
  bannerKey: string | null;
  bannerUrl: string | null;
  rules: string | null;
  canManage: boolean;
  canRegister: boolean;
  registrationRestriction: string | null;
  /** Private + code set + caller lacks bypass: show the code box, not the error. */
  requiresCode: boolean;
  /** University events: whether the caller already belongs to the organization. */
  organizationIsMember: boolean;
  /** Plaintext entry code — managers only, never in public payloads. */
  entryCode: string | null;
  participant: {
    status: EventParticipantStatus;
    registeredAt: string;
    joinedAt: string | null;
    completedAt: string | null;
    score: number | null;
    rank: number | null;
  } | null;
}

/** One numbered slot in the event navigator. */
export interface EventNavigatorItemDto {
  position: number;
  questionId: string;
  state: 'unanswered' | 'answered' | 'review' | 'current';
  correctness?: 'correct' | 'incorrect' | 'unanswered';
}

/** A single event question view; correctness only after completion. */
export interface EventQuestionViewDto {
  position: number;
  questionId: string;
  problemId: string;
  title: string;
  statement: string | null;
  contentMode: ProblemContentMode;
  difficulty: QuestionDifficulty;
  assets: ProblemAssetDto[];
  options: ProblemOptionDto[];
  points: number;
  selectedOptionId: string | null;
  markedForReview: boolean;
  answerable: boolean;
  correctOptionId?: string | null;
  explanation?: string | null;
  shortcut?: string | null;
}

/** Authoritative live session snapshot; drives timer + navigator + recovery. */
export interface EventSessionDto {
  eventId: string;
  status: EventStatus;
  participantStatus: EventParticipantStatus;
  serverTime: string;
  startsAt: string;
  endsAt: string;
  startedAt: string | null;
  effectiveEndAt: string | null;
  remainingSeconds: number;
  submittedAt: string | null;
  currentPosition: number;
  totalQuestions: number;
  answeredCount: number;
  unansweredCount: number;
  reviewCount: number;
  questions: EventNavigatorItemDto[];
  current: EventQuestionViewDto;
}

/** Final submission preview counts. */
export interface EventSubmitPreviewDto {
  answeredCount: number;
  unansweredCount: number;
  reviewCount: number;
  totalQuestions: number;
}

/** Persisted per-participant result. Deterministic rank: score DESC,
 *  correctCount DESC, completionSeconds ASC, userId ASC. */
export interface EventResultDto {
  eventId: string;
  userId: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  completionSeconds: number;
  rank: number | null;
  totalParticipants: number;
  finalizedAt: string;
  submittedAt: string | null;
  autoSubmitted: boolean;
}

/** One leaderboard row ordered by score DESC, time ASC, userId ASC. */
export interface EventLeaderboardEntryDto {
  rank: number;
  userId: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  institution: string | null;
  score: number;
  correctCount: number;
  wrongCount: number;
  completionSeconds: number;
  isCurrentUser: boolean;
}

/** Organizer-facing participant row. */
export interface EventParticipantDto {
  userId: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  institution: string | null;
  status: EventParticipantStatus;
  registeredAt: string;
  joinedAt: string | null;
  completedAt: string | null;
  score: number | null;
  rank: number | null;
}

/** Invite row for private/university events. */
export interface EventInviteDto {
  id: string;
  eventId: string;
  invitedUserId: string | null;
  invitedEmail: string | null;
  status: EventInviteStatus;
  createdAt: string;
  respondedAt: string | null;
}

/** Socket events for event start/end + timer sync (answers stay on REST). */
export const EVENT_SOCKET_EVENTS = {
  subscribe: 'event:subscribe',
  state: 'event:state',
  status: 'event:status',
  error: 'event:error',
} as const;

export type EventSocketEvent = (typeof EVENT_SOCKET_EVENTS)[keyof typeof EVENT_SOCKET_EVENTS];

// ─── Organizations (Prompt 14, minimal) ───────────────────────────────────
// University / organization scoping for events. Membership-gated visibility
// only; no billing or hierarchy in this prompt.

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberCount: number;
  isMember: boolean;
}

// ─── Notifications (Prompt 14, minimal) ───────────────────────────────────
// DB-backed inbox; BullMQ delivers asynchronously, PostgreSQL is the source
// of truth. Read-state transitions are the only mutations.

export const NOTIFICATION_TYPES = [
  'EVENT_REGISTERED',
  'EVENT_WITHDRAWN',
  'EVENT_STARTING_SOON',
  'EVENT_STARTED',
  'EVENT_CANCELLED',
  'EVENT_UPDATED',
  'EVENT_RESULTS_PUBLISHED',
  'POINTS_EARNED',
  'REWARD_REDEEMED',
  'REWARD_REFUNDED',
  'POINTS_ADJUSTED',
  'CONTRIBUTION_SUBMITTED',
  'CONTRIBUTION_APPROVED',
  'CONTRIBUTION_REJECTED',
  'CONTRIBUTION_CHANGES_REQUESTED',
  'MODERATION_ACTION',
  'REPORT_RESOLVED',
  'CONTEST_CANCELLED',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** One achievement definition with the caller's unlock state. */
export interface AchievementDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  points: number;
  isUnlocked: boolean;
  unlockedAt: string | null;
}

/** Authenticated owner's editable profile. Explicit fields only — never the raw User row. */
export interface ProfileDto {
  id: string;
  email: string;
  username: string | null;
  displayName: string;
  avatarKey: string | null;
  avatarUrl: string | null;
  country: string | null;
  institution: string | null;
  bio: string | null;
  timezone: string | null;
  isPrivate: boolean;
  memberSince: string;
}

/** Public competitive identity. No email, no privacy-gated fields. */
export interface PublicProfileDto {
  username: string;
  displayName: string;
  avatarKey: string | null;
  avatarUrl: string | null;
  country: string | null;
  institution: string | null;
  bio: string | null;
  memberSince: string;
  solvedCount: number;
  accuracy: number | null;
  bestRating: number | null;
  tier: string | null;
  achievements: AchievementDto[];
}

/** Aggregate over authoritative submission records. */
export interface PerformanceOverallDto {
  totalAttempted: number;
  totalSolved: number;
  distinctSolved: number;
  /** Published problems in the library (the LeetCode-style denominator). */
  totalProblems: number;
  accuracy: number | null;
  avgTimeSeconds: number | null;
  currentChallengeRating: number | null;
  currentContestRating: number | null;
}

/** Per-domain (Category) breakdown with a recent trend signal. */
export interface DomainPerformanceDto {
  domainSlug: string;
  domainName: string;
  attempts: number;
  solved: number;
  accuracy: number | null;
  avgTimeSeconds: number | null;
  /** Recent accuracy minus overall accuracy, in percentage points. */
  recentTrend: number | null;
}

/** Per-topic breakdown within a domain. */
export interface TopicPerformanceDto {
  topicSlug: string;
  topicName: string;
  domainSlug: string;
  domainName: string;
  attempts: number;
  solved: number;
  accuracy: number | null;
  avgTimeSeconds: number | null;
  recentTrend: number | null;
}

/** Per-difficulty breakdown. */
export interface DifficultyPerformanceDto {
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  attempts: number;
  solved: number;
  accuracy: number | null;
  avgTimeSeconds: number | null;
  recentTrend: number | null;
}

/**
 * Deterministic weak-area signal for the future AI Performance Coach.
 * Never based on accuracy alone: attempts, recency, difficulty mix and
 * solving time all contribute. Topics below the attempt threshold are
 * never labeled — insufficient data is reported as eligibility instead.
 */
export interface WeakAreaDto {
  topicSlug: string;
  topicName: string;
  domainSlug: string;
  domainName: string;
  attempts: number;
  accuracy: number | null;
  avgTimeSeconds: number | null;
  recentTrend: number | null;
  severity: 'high' | 'medium' | 'low';
  reason: string;
}

/** One rating-history point for charts, unified across engines. */
export interface RatingPointDto {
  date: string;
  source: 'challenge' | 'contest';
  domain: string | null;
  before: number;
  after: number;
  change: number;
}

/** One heatmap day. Counts only — breakdowns stay private. */
export interface ActivityDayDto {
  date: string;
  count: number;
  solved: number;
  /** Practice problems attempted that day (submissions, right or wrong). */
  attempted: number;
}

/** Server-owned streak state. */
export interface StreakDto {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  activeToday: boolean;
}

/** Point ledger summary. Balances mirror the UserPoints row; the ledger explains them. */
export interface PointsSummaryDto {
  total: number;
  earned: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  recent: Array<{
    id: string;
    amount: number;
    type: string;
    reason: string;
    description: string | null;
    createdAt: string;
    balanceAfter: number;
  }>;
}

/** One ledger row for paginated history. */
export interface PointsHistoryItemDto {
  id: string;
  amount: number;
  type: string;
  reason: string;
  description: string | null;
  sourceType: string | null;
  balanceAfter: number;
  createdAt: string;
}

/** Centralized reward rule (amounts and caps are server-owned). */
export interface RewardRuleDto {
  key: string;
  name: string;
  description: string | null;
  points: number;
  category: string;
  dailyCap: number | null;
}

/**
 * Full rule row for admin management: firing trigger, lifetime/cooldown
 * limits, validity window and the active flag.
 */
export interface RewardRuleAdminDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  points: number;
  trigger: string;
  category: string;
  dailyCap: number | null;
  maxPerUser: number | null;
  cooldownSeconds: number | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  updatedAt: string;
}

/** Achievement definition for admin management (unlock logic stays code-driven). */
export interface AchievementAdminDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  points: number;
  isActive: boolean;
  unlockCount: number;
}

/** Catalog reward. Stock is informational — redemption revalidates server-side. */
export interface RewardDto {
  id: string;
  name: string;
  description: string | null;
  category: string;
  pointsCost: number;
  imageUrl: string | null;
  stockQuantity: number | null;
  inStock: boolean;
  isActive: boolean;
  affordable: boolean;
}

/** Redemption record with cost snapshot. */
export interface RedemptionDto {
  id: string;
  rewardId: string;
  rewardName: string;
  pointsCost: number;
  status: string;
  createdAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
}

/** Lightweight abuse signal for admin review. Never auto-bans. */
export interface SuspiciousFlagDto {
  userId: string;
  username: string | null;
  displayName: string;
  signal: string;
  detail: string;
  pointsToday: number;
}

/** Unified recent-activity feed item. */
export interface RecentActivityItemDto {
  id: string;
  kind: 'solve' | 'challenge' | 'contest' | 'event' | 'achievement' | 'contribution' | 'lesson';
  title: string;
  detail: string | null;
  occurredAt: string;
}

/** Deterministic "next focus" for Home — real performance data, no LLM. */
export interface NextFocusDto {
  topicSlug: string | null;
  topicName: string | null;
  domainSlug: string | null;
  domainName: string | null;
  reason: string;
  accuracy: number | null;
  attempts: number;
  streak: StreakDto;
  ratingTrend: number;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  eventId: string | null;
  isRead: boolean;
  createdAt: string;
}

// ─── Search + Discovery (Prompt 17) ─────────────────────────────────────
// Lexical, deterministic search over PostgreSQL. Ranking is an explicit
// priority ladder (exact id → exact title → prefix → full-text → trigram →
// topic/exam), never semantic. The future RAG Similar Problems pipeline sits
// behind SimilarProblemService and does not touch these contracts.

export const SEARCH_RESULT_TYPES = [
  'PROBLEM',
  'TOPIC',
  'LEARNING',
  'CONTEST',
  'EVENT',
  'DISCUSSION',
] as const;

export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export interface TopicSearchResultDto {
  kind: 'TOPIC';
  id: string;
  name: string;
  slug: string;
  domainSlug: string;
  domainName: string;
  problemCount: number;
}

export interface LearningSearchResultDto {
  kind: 'LEARNING';
  contentKind: 'path' | 'topic' | 'lesson';
  id: string;
  slug: string;
  title: string;
  pathSlug: string;
  pathTitle: string;
  topicSlug: string | null;
  topicTitle: string | null;
}

export interface SearchSuggestionsDto {
  problems: Array<{ id: string; title: string }>;
  topics: Array<{ slug: string; name: string }>;
  contests: Array<{ id: string; title: string }>;
  events: Array<{ id: string; title: string }>;
  discussions: Array<{ id: string; title: string }>;
}

export interface ProblemFilterMetadataDto {
  topics: Array<{ slug: string; name: string; domainSlug: string; problemCount: number }>;
  difficulties: Array<'EASY' | 'MEDIUM' | 'HARD'>;
  exams: Array<{ slug: string; name: string; problemCount: number }>;
  rating: { min: number; max: number };
}

export interface TrendingContentDto {
  problems: ProblemSummaryDto[];
  contests: ContestSummaryDto[];
  events: EventSummaryDto[];
  discussions: DiscussionThreadSummaryDto[];
}

export interface RecentSearchDto {
  query: string;
  resultType: SearchResultType | null;
  searchedAt: string;
}

// ─── Deterministic personalization (Prompt 17) ──────────────────────────
// Rule-based recommendations with human-readable reasons. No LLM, no random
// picks. Cold-start users get popularity-based discovery explicitly labeled
// as such. These services double as future LangGraph tool implementations.

export interface RecommendedProblemDto {
  problem: ProblemSummaryDto;
  reason: string;
  priority: number;
  source: 'weak-area' | 'recent-topic' | 'favorites' | 'level-fit' | 'popular';
}

export interface RecommendedTopicDto {
  topicSlug: string;
  topicName: string;
  domainSlug: string;
  domainName: string;
  reason: string;
  priority: number;
  source: 'weak-area' | 'recent' | 'popular';
}

export interface ContinueLearningDto {
  lessonId: string;
  lessonSlug: string;
  lessonTitle: string;
  topicSlug: string;
  topicTitle: string;
  pathSlug: string;
  pathTitle: string;
  status: 'STARTED' | 'UNSTARTED';
  reason: string;
}

export interface RecommendedContestDto {
  contest: ContestSummaryDto;
  reason: string;
}

export interface RecommendedEventDto {
  event: EventSummaryDto;
  reason: string;
}

export interface HomeRecommendationsDto {
  focus: NextFocusDto;
  continueLearning: ContinueLearningDto[];
  problems: RecommendedProblemDto[];
  contests: RecommendedContestDto[];
  events: RecommendedEventDto[];
}

// ─── Admin Panel + Moderation (Prompt 18) ───────────────────────────────
// Explicit whitelisted DTOs. Admin responses never include password hashes,
// session secrets, OAuth secrets, tokens, or internal review notes meant
// only for other staff.

export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED', 'DEACTIVATED'] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface AdminUserDto {
  id: string;
  email: string;
  username: string | null;
  displayName: string;
  country: string | null;
  institution: string | null;
  isActive: boolean;
  accountStatus: AccountStatus;
  suspendedUntil: string | null;
  statusReason: string | null;
  emailVerified: string | null;
  roles: string[];
  createdAt: string;
}

export interface AdminUserDetailDto extends AdminUserDto {
  avatarKey: string | null;
  timezone: string | null;
  isPrivate: boolean;
  stats: {
    solvedCount: number;
    submissions: number;
    challengesPlayed: number;
    contestsEntered: number;
    eventsJoined: number;
    contributions: { total: number; approved: number };
    points: number;
    reportsFiledAgainst: number;
  };
}

export interface AdminOverviewDto {
  users: { total: number; active: number; new7d: number; suspended: number };
  content: {
    publishedProblems: number;
    pendingContributions: number;
    rejectedContributions: number;
    reportedProblems: number;
  };
  competition: {
    liveContests: number;
    upcomingContests: number;
    liveEvents: number;
    upcomingEvents: number;
  };
  community: { openReports: number; openDiscussionReports: number; activeChallenges: number };
  rewards: { activeRewards: number; pendingRedemptions: number; pointsEarnedToday: number };
  generatedAt: string;
}

export interface ContributionOptionDto {
  text: string | null;
  assetKey: string | null;
  isCorrect: boolean;
}

/** Contributor's own submission row: status + reviewer feedback, never staff notes. */
export interface ContributionMineItemDto {
  id: string;
  title: string;
  status: ContributionStatus;
  feedback: string | null;
  resultingProblemId: string | null;
  submittedAt: string;
}

export interface ContributionMinePageDto {
  items: ContributionMineItemDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Owner-safe contribution detail: feedback visible, flags and notes never. */
export interface ContributionDetailDto {
  id: string;
  title: string;
  statement: string;
  options: Array<{ text: string | null; assetKey: string | null }>;
  explanation: string | null;
  difficulty: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  topicName: string | null;
  rating: number | null;
  examTagSlugs: string[];
  source: string | null;
  sourceUrl: string | null;
  status: ContributionStatus;
  feedback: string | null;
  resultingProblemId: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

/** Admin-only contribution view: includes the flagged answer + staff notes. */
export interface ContributionAdminDto {
  id: string;
  title: string;
  statement: string;
  options: ContributionOptionDto[];
  explanation: string | null;
  difficulty: string | null;
  topic: { id: string; name: string; slug: string } | null;
  category: { id: string; name: string; slug: string } | null;
  rating: number | null;
  examTagSlugs: string[];
  source: string | null;
  sourceUrl: string | null;
  status: ContributionStatus;
  contributor: { id: string; username: string | null; displayName: string };
  reviewer: { id: string; username: string | null; displayName: string } | null;
  reviewerNote: string | null;
  feedbackForContributor: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  resultingProblemId: string | null;
  aiReviews: AiReviewDto[];
  duplicateCandidates: DuplicateCandidateDto[];
}

export interface AiReviewDto {
  id: string;
  model: string;
  /** True when produced by the AI reviewer (vs the deterministic precheck). */
  aiGenerated: boolean;
  suggestedTopic: string | null;
  suggestedSubtopic: string | null;
  suggestedDifficulty: string | null;
  duplicateProbability: number | null;
  answerConsistent: boolean | null;
  issues: string[];
  recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
  createdAt: string;
}

export interface DuplicateCandidateDto {
  problemId: string;
  title: string;
  similarity: number;
  /** Retrieval channel: trigram title match, vector semantic match, or both. */
  source: 'trigram' | 'vector' | 'both';
}

export interface ReportDto {
  id: string;
  reporter: { id: string; username: string | null; displayName: string };
  targetType: string;
  targetId: string;
  targetTitle: string | null;
  reason: string;
  description: string | null;
  status: string;
  priority: string;
  assignedModerator: { id: string; username: string | null; displayName: string } | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AuditLogDto {
  id: string;
  actor: { id: string; username: string | null; displayName: string };
  action: string;
  targetType: string | null;
  targetId: string | null;
  previousValue: unknown;
  newValue: unknown;
  reason: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AdminProblemDto {
  id: string;
  title: string;
  status: string;
  difficulty: string;
  rating: number;
  category: string;
  /** Null when the problem was filed without a topic (allowed at creation). */
  topic: string | null;
  /** Exam-folder slugs this problem is filed under (admin-curated). */
  examTags: string[];
  attempts: number;
  accuracy: number | null;
  reports: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface DiscussionReportAdminDto {
  id: string;
  reporter: { id: string; username: string | null; displayName: string };
  postId: string | null;
  replyId: string | null;
  targetTitle: string | null;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: string;
}

export interface AdminContestDto {
  id: string;
  title: string;
  slug: string;
  status: string;
  startsAt: string;
  endsAt: string;
  participantCount: number;
  questionCount: number;
}

export interface ContestParticipantAdminDto {
  userId: string;
  username: string | null;
  displayName: string;
  status: string;
  score: number | null;
  rank: number | null;
  submittedAt: string | null;
}

/** Release identity for operators: version + commit (+tag when tagged). */
export interface ReleaseInfo {
  version: string;
  commit: string;
  tag: string | null;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

/** User-submitted feedback row (reporter identity trimmed for anonymity). */
export interface FeedbackDto {
  id: string;
  reporter: { id: string; username: string | null; displayName: string } | null;
  category: string;
  description: string;
  page: string | null;
  status: string;
  priority: string;
  createdAt: string;
  resolvedAt: string | null;
}
