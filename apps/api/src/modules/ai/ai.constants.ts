/** Dedicated queue for asynchronous AI work (embeddings, reviews). */
export const AI_QUEUE = 'ai-jobs';

export const AI_JOBS = {
  /** Generate/store a problem embedding (idempotent per problem+triple). */
  problemEmbed: 'ai.problem-embed',
  /** Structured contribution review (advisory only, never publishes). */
  contributionReview: 'ai.contribution-review',
  /** Paged backfill page: enqueue missing embeddings, then chain next page. */
  embeddingsBackfill: 'ai.embeddings-backfill',
} as const;

export type AiJobName = (typeof AI_JOBS)[keyof typeof AI_JOBS];

export interface EmbeddingTripleLike {
  model: string;
  dimensions: number;
  version: number;
}

/**
 * Deterministic job ids: re-enqueue collapses instead of duplicating work.
 * The full triple (not just the model) is part of the id so a model or
 * representation change re-embeds instead of colliding with old rows.
 */
export function problemEmbedJobId(problemId: string, triple: EmbeddingTripleLike): string {
  return `embed_${problemId}_${triple.model}_v${triple.version}_${triple.dimensions}d`;
}

export function contributionReviewJobId(contributionId: string): string {
  return `review_${contributionId}`;
}

/** Single backfill chain per triple: concurrent triggers collapse into one. */
export function embeddingsBackfillJobId(triple: EmbeddingTripleLike): string {
  return `backfill_${triple.model}_v${triple.version}_${triple.dimensions}d`;
}

export const EMBEDDING_BACKFILL_PAGE_SIZE = 100;

/** Feature keys for usage tracking, rate limits and evaluation. */
export const AI_FEATURES = [
  'performance-coach',
  'similar-problems',
  'contribution-review',
  'embeddings',
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];
