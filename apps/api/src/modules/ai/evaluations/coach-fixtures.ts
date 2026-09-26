/**
 * Versioned evaluation fixtures for the AI layer. These are synthetic,
 * hand-written cases — deliberately separate from production user data.
 * Bump `EVAL_VERSION` whenever cases change so runs stay comparable.
 */

export const EVAL_VERSION = '2026-09-02.v2';

export interface GroundingCase {
  name: string;
  knownProblemIds: string[];
  candidateResponse: unknown;
  expectValid: boolean;
}

// Fixture ids are valid UUIDs: production problem ids are UUIDs and the
// response schema enforces that shape, so grounding cases must too.
const FIXTURE_IDS = {
  p1: '11111111-1111-4111-8111-111111111111',
  p2: '22222222-2222-4222-8222-222222222222',
  p3: '33333333-3333-4333-8333-333333333333',
} as const;

export const COACH_GROUNDING_CASES: GroundingCase[] = [
  {
    name: 'grounded suggestions pass',
    knownProblemIds: [FIXTURE_IDS.p1, FIXTURE_IDS.p2, FIXTURE_IDS.p3],
    candidateResponse: {
      summary: 'Steady week.',
      strengths: ['Algebra is solid.'],
      weakAreas: ['Geometry needs work.'],
      recommendations: ['Drill geometry in timed sets.'],
      suggestedProblems: [FIXTURE_IDS.p1, FIXTURE_IDS.p3],
      confidence: 'medium',
    },
    expectValid: true,
  },
  {
    name: 'hallucinated problem ids fail grounding',
    knownProblemIds: [FIXTURE_IDS.p1, FIXTURE_IDS.p2],
    candidateResponse: {
      summary: 'Good week.',
      strengths: [],
      weakAreas: [],
      recommendations: [],
      suggestedProblems: [FIXTURE_IDS.p1, '99999999-9999-4999-8999-999999999999'],
      confidence: 'high',
    },
    expectValid: false,
  },
  {
    name: 'malformed response fails schema',
    knownProblemIds: [FIXTURE_IDS.p1],
    candidateResponse: { summary: 42, confidence: 'certain' },
    expectValid: false,
  },
  {
    name: 'insufficient-data response stays valid with empty suggestions',
    knownProblemIds: [],
    candidateResponse: {
      summary: 'Not enough attempts yet — solve five problems to unlock coaching.',
      strengths: [],
      weakAreas: [],
      recommendations: ['Solve five problems across two topics first.'],
      suggestedProblems: [],
      confidence: 'low',
    },
    expectValid: true,
  },
  {
    name: 'cross-user ids fail grounding even when well-formed',
    knownProblemIds: [FIXTURE_IDS.p1],
    candidateResponse: {
      summary: 'Borrowed stats.',
      strengths: [],
      weakAreas: [],
      recommendations: [],
      suggestedProblems: [FIXTURE_IDS.p2, FIXTURE_IDS.p3],
      confidence: 'medium',
    },
    expectValid: false,
  },
];

export interface RerankCase {
  name: string;
  source: { topicId: string; subtopicId: string | null; difficulty: string; rating: number };
  candidates: Array<{
    id: string;
    topicId: string;
    subtopicId: string | null;
    difficulty: string;
    rating: number;
    distance: number;
  }>;
  expectedFirst: string;
}

export const RERANK_CASES: RerankCase[] = [
  {
    name: 'same topic outranks closer cross-topic vector',
    source: { topicId: 't-algebra', subtopicId: null, difficulty: 'MEDIUM', rating: 1500 },
    candidates: [
      {
        id: 'cross',
        topicId: 't-geometry',
        subtopicId: null,
        difficulty: 'MEDIUM',
        rating: 1500,
        distance: 0.1,
      },
      {
        id: 'same',
        topicId: 't-algebra',
        subtopicId: null,
        difficulty: 'MEDIUM',
        rating: 1500,
        distance: 0.4,
      },
    ],
    expectedFirst: 'same',
  },
  {
    name: 'nearer difficulty wins ties',
    source: { topicId: 't-algebra', subtopicId: null, difficulty: 'MEDIUM', rating: 1500 },
    candidates: [
      {
        id: 'hard',
        topicId: 't-algebra',
        subtopicId: null,
        difficulty: 'HARD',
        rating: 1500,
        distance: 0.3,
      },
      {
        id: 'medium',
        topicId: 't-algebra',
        subtopicId: null,
        difficulty: 'MEDIUM',
        rating: 1500,
        distance: 0.3,
      },
    ],
    expectedFirst: 'medium',
  },
  {
    name: 'nearer rating wins equal vectors',
    source: { topicId: 't-algebra', subtopicId: null, difficulty: 'MEDIUM', rating: 1500 },
    candidates: [
      {
        id: 'far',
        topicId: 't-algebra',
        subtopicId: null,
        difficulty: 'MEDIUM',
        rating: 2500,
        distance: 0.3,
      },
      {
        id: 'near',
        topicId: 't-algebra',
        subtopicId: null,
        difficulty: 'MEDIUM',
        rating: 1560,
        distance: 0.3,
      },
    ],
    expectedFirst: 'near',
  },
];

export interface RetrievalExclusionCase {
  name: string;
  sourceProblemId: string;
  model: string;
  dimensions: number;
  version: number;
  candidate: {
    id: string;
    topicId: string;
    subtopicId: string | null;
    difficulty: string;
    rating: number;
    distance: number;
    embeddingModel?: string;
    embeddingDimensions?: number;
    embeddingVersion?: number;
    embeddingStatus?: string;
    problemStatus?: string;
  };
  expectEligible: boolean;
}

const ACTIVE = { model: 'text-embedding-3-small', dimensions: 1536, version: 1 };

function eligibleCandidate(
  overrides: Partial<RetrievalExclusionCase['candidate']> = {},
): RetrievalExclusionCase['candidate'] {
  return {
    id: 'cand-1',
    topicId: 't-algebra',
    subtopicId: null,
    difficulty: 'MEDIUM',
    rating: 1500,
    distance: 0.2,
    embeddingModel: ACTIVE.model,
    embeddingDimensions: ACTIVE.dimensions,
    embeddingVersion: ACTIVE.version,
    embeddingStatus: 'READY',
    problemStatus: 'PUBLISHED',
    ...overrides,
  };
}

export const RETRIEVAL_EXCLUSION_CASES: RetrievalExclusionCase[] = [
  {
    name: 'eligible canonical candidate passes',
    sourceProblemId: 'source-1',
    ...ACTIVE,
    candidate: eligibleCandidate(),
    expectEligible: true,
  },
  {
    name: 'current problem is excluded',
    sourceProblemId: 'source-1',
    ...ACTIVE,
    candidate: eligibleCandidate({ id: 'source-1' }),
    expectEligible: false,
  },
  {
    name: 'non-READY embedding is excluded',
    sourceProblemId: 'source-1',
    ...ACTIVE,
    candidate: eligibleCandidate({ embeddingStatus: 'PENDING' }),
    expectEligible: false,
  },
  {
    name: 'unpublished problem is excluded',
    sourceProblemId: 'source-1',
    ...ACTIVE,
    candidate: eligibleCandidate({ problemStatus: 'DRAFT' }),
    expectEligible: false,
  },
  {
    name: 'stale model version is excluded',
    sourceProblemId: 'source-1',
    ...ACTIVE,
    candidate: eligibleCandidate({ embeddingVersion: 0 }),
    expectEligible: false,
  },
  {
    name: 'dimension mismatch is excluded',
    sourceProblemId: 'source-1',
    ...ACTIVE,
    candidate: eligibleCandidate({ embeddingDimensions: 768 }),
    expectEligible: false,
  },
];

export interface ReviewSchemaCase {
  name: string;
  candidate: unknown;
  expectValid: boolean;
}

export const REVIEW_SCHEMA_CASES: ReviewSchemaCase[] = [
  {
    name: 'well-formed review passes',
    candidate: {
      topic: 'Algebra',
      subtopic: null,
      difficulty: 'MEDIUM',
      duplicateProbability: 0.2,
      answerConsistent: true,
      issues: [],
      recommendation: 'APPROVE',
    },
    expectValid: true,
  },
  {
    name: 'out-of-range probability fails',
    candidate: {
      topic: 'Algebra',
      subtopic: null,
      difficulty: 'MEDIUM',
      duplicateProbability: 1.5,
      answerConsistent: true,
      issues: [],
      recommendation: 'REVIEW',
    },
    expectValid: false,
  },
  {
    name: 'unknown recommendation fails',
    candidate: {
      topic: 'Algebra',
      subtopic: null,
      difficulty: 'MEDIUM',
      duplicateProbability: 0.1,
      answerConsistent: false,
      issues: ['Weak distractors.'],
      recommendation: 'MAYBE',
    },
    expectValid: false,
  },
];
