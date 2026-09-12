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

/** Payload of GET /api/v1/health. Never contains secrets or URLs. */
export interface HealthData {
  status: 'ok' | 'degraded';
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: DependencyHealth;
    redis: DependencyHealth;
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
  isActive: boolean;
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
  topic: ProblemRefDto;
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
  topic: ProblemRefDto;
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
  selfScore: number;
  opponentScore: number;
  opponent: { id: string; username: string | null; displayName: string; avatarKey: string | null };
  playedAt: string;
  durationSeconds: number;
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
  displayName: string;
  avatarKey: string | null;
  institution: string | null;
  solvedCount: number;
  score: number;
  wrongCount: number;
  completionSeconds: number;
  isCurrentUser: boolean;
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
