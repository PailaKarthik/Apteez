import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app-logger';
import { isEligibleCandidate, rerankScore } from '../../search/similar-problem.service';
import { coachResponseSchema, contributionReviewResponseSchema } from '../coach.schemas';
import {
  COACH_GROUNDING_CASES,
  EVAL_VERSION,
  RERANK_CASES,
  RETRIEVAL_EXCLUSION_CASES,
  REVIEW_SCHEMA_CASES,
} from './coach-fixtures';

export interface EvalCaseResult {
  suite: string;
  name: string;
  passed: boolean;
  detail: string | null;
}

export interface EvalRun {
  version: string;
  passed: number;
  failed: number;
  cases: EvalCaseResult[];
  ranAt: string;
}

const DIFFICULTY_RANK: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };

/**
 * Deterministic evaluation runner for the three approved AI capabilities.
 * No LLM calls, no network, no production data — fixtures only. Results are
 * safe to expose to admins and to gate deployments on.
 */
@Injectable()
export class AiEvaluationService {
  constructor(private readonly logger: AppLogger) {}

  runAll(): EvalRun {
    const cases: EvalCaseResult[] = [
      ...this.coachGrounding(),
      ...this.reranking(),
      ...this.retrievalExclusions(),
      ...this.reviewSchemas(),
    ];
    const passed = cases.filter((result) => result.passed).length;
    this.logger.log(`ai.eval version=${EVAL_VERSION} passed=${passed}/${cases.length}`, 'AI');
    return {
      version: EVAL_VERSION,
      passed,
      failed: cases.length - passed,
      cases,
      ranAt: new Date().toISOString(),
    };
  }

  /** Factual grounding: suggested ids must exist in tool output + schema valid. */
  private coachGrounding(): EvalCaseResult[] {
    return COACH_GROUNDING_CASES.map((fixture) => {
      const parsed = coachResponseSchema.safeParse(fixture.candidateResponse);
      const response = parsed.success ? parsed.data : null;
      const grounded =
        response !== null &&
        (response.suggestedProblems ?? []).every((id) => fixture.knownProblemIds.includes(id));
      const passed = grounded === fixture.expectValid;
      return {
        suite: 'coach-grounding',
        name: fixture.name,
        passed,
        detail: passed
          ? null
          : `expected valid=${fixture.expectValid}, got schema=${parsed.success}, grounded=${grounded}`,
      };
    });
  }

  /** Rerank layer: topic compatibility must dominate raw vector distance. */
  private reranking(): EvalCaseResult[] {
    return RERANK_CASES.map((fixture) => {
      const scored = fixture.candidates
        .map((candidate) => ({
          id: candidate.id,
          score: rerankScore({
            cosineSimilarity: 1 - candidate.distance,
            sameTopic: candidate.topicId === fixture.source.topicId,
            sameSubtopic:
              candidate.subtopicId !== null &&
              fixture.source.subtopicId !== null &&
              candidate.subtopicId === fixture.source.subtopicId,
            difficultyGap: Math.abs(
              (DIFFICULTY_RANK[candidate.difficulty] ?? 1) -
                (DIFFICULTY_RANK[fixture.source.difficulty] ?? 1),
            ),
            ratingGap: Math.abs(candidate.rating - fixture.source.rating),
          }),
        }))
        .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
      const passed = scored[0]?.id === fixture.expectedFirst;
      return {
        suite: 'rag-rerank',
        name: fixture.name,
        passed,
        detail: passed
          ? null
          : `expected first=${fixture.expectedFirst}, got=${scored[0]?.id ?? 'none'}`,
      };
    });
  }

  /** Retrieval guard: self/unpublished/stale/mismatched rows never rank. */
  private retrievalExclusions(): EvalCaseResult[] {
    return RETRIEVAL_EXCLUSION_CASES.map((fixture) => {
      const eligible = isEligibleCandidate(
        fixture.sourceProblemId,
        { model: fixture.model, dimensions: fixture.dimensions, version: fixture.version },
        fixture.candidate,
      );
      const passed = eligible === fixture.expectEligible;
      return {
        suite: 'rag-exclusion',
        name: fixture.name,
        passed,
        detail: passed ? null : `expected eligible=${fixture.expectEligible}, got=${eligible}`,
      };
    });
  }

  /** Contribution review payloads must match the advisory contract. */
  private reviewSchemas(): EvalCaseResult[] {
    return REVIEW_SCHEMA_CASES.map((fixture) => {
      const passed =
        contributionReviewResponseSchema.safeParse(fixture.candidate).success ===
        fixture.expectValid;
      return {
        suite: 'review-schema',
        name: fixture.name,
        passed,
        detail: passed ? null : `expected valid=${fixture.expectValid}`,
      };
    });
  }
}
