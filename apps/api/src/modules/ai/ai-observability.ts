import { AppLogger } from '../../common/logger/app-logger';

export interface AiTelemetry {
  feature: string;
  requestId?: string;
  model: string;
  /** Agent/prompt configuration version (e.g. COACH_PROMPT_VERSION). */
  promptVersion?: string;
  latencyMs: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  success: boolean;
  validation?: 'valid' | 'repaired' | 'invalid';
  fallbackUsed?: boolean;
  retrievalCount?: number;
  /** LangGraph tool executions in this run (coach). */
  toolCount?: number;
  error?: string;
}

/**
 * Single structured log line per significant AI request. Field-based (never
 * interpolated PII): no prompts, responses, profiles or answers. Pairs with
 * AiUsageTracker rows for cost analysis.
 */
export function logAiCall(logger: AppLogger, telemetry: AiTelemetry): void {
  const fields = [
    `feature=${telemetry.feature}`,
    telemetry.requestId ? `requestId=${telemetry.requestId}` : null,
    `model=${telemetry.model}`,
    `latencyMs=${telemetry.latencyMs}`,
    telemetry.promptTokens !== undefined && telemetry.promptTokens !== null
      ? `promptTokens=${telemetry.promptTokens}`
      : null,
    telemetry.completionTokens !== undefined && telemetry.completionTokens !== null
      ? `completionTokens=${telemetry.completionTokens}`
      : null,
    `success=${telemetry.success}`,
    telemetry.validation ? `validation=${telemetry.validation}` : null,
    telemetry.fallbackUsed ? 'fallback=true' : null,
    telemetry.retrievalCount !== undefined ? `retrievalCount=${telemetry.retrievalCount}` : null,
    telemetry.toolCount !== undefined ? `toolCount=${telemetry.toolCount}` : null,
    telemetry.promptVersion ? `promptVersion=${telemetry.promptVersion}` : null,
    telemetry.error ? `error=${telemetry.error.slice(0, 200)}` : null,
  ]
    .filter((field): field is string => field !== null)
    .join(' ');
  if (telemetry.success) {
    logger.log(`ai.call ${fields}`, 'AI');
  } else {
    logger.warn(`ai.call ${fields}`, 'AI');
  }
}
