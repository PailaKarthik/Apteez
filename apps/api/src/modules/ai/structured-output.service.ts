import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppLogger } from '../../common/logger/app-logger';
import type { LLMProvider, LlmMessage } from './llm-provider';

export interface StructuredResult<T> {
  ok: boolean;
  value: T | null;
  attempts: number;
  error: string | null;
}

/**
 * LLM output gate. Every model response is parsed and Zod-validated before
 * the application may use it; invalid output retries once with a repair
 * hint, then fails safe. Raw model JSON is never trusted.
 */
@Injectable()
export class StructuredOutputService {
  constructor(private readonly logger: AppLogger) {}

  async generate<T>(
    provider: LLMProvider,
    schema: z.ZodType<T>,
    messages: LlmMessage[],
    opts?: { maxTokens?: number; feature?: string },
  ): Promise<StructuredResult<T>> {
    const maxAttempts = 2;
    let lastError: string | null = 'No attempts made.';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const prompt =
        attempt === 1
          ? messages
          : [
              ...messages,
              {
                role: 'user' as const,
                content: `Your previous reply was not valid JSON matching the required schema (${lastError}). Reply with ONLY the corrected JSON object, no prose.`,
              },
            ];
      let text: string;
      try {
        const result = await provider.generate(prompt, { maxTokens: opts?.maxTokens });
        text = result.text;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        continue;
      }
      const parsed = StructuredOutputService.extractJson(text);
      if (!parsed.ok) {
        lastError = parsed.error;
        continue;
      }
      const validated = schema.safeParse(parsed.value);
      if (!validated.success) {
        lastError = validated.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
        continue;
      }
      if (attempt > 1) {
        this.logger.log(
          `ai.structured-repaired feature=${opts?.feature ?? 'unknown'} attempts=${attempt}`,
          'AI',
        );
      }
      return { ok: true, value: validated.data, attempts: attempt, error: null };
    }
    this.logger.warn(
      `ai.structured-invalid feature=${opts?.feature ?? 'unknown'} error=${lastError}`,
      'AI',
    );
    return { ok: false, value: null, attempts: maxAttempts, error: lastError };
  }

  /**
   * Extract the first balanced JSON object from model prose. Static and
   * pure so graph nodes (coach-graph text fallback) reuse it without a
   * service instance; the instance `generate` path serves the
   * contribution-review worker.
   */
  static extractJson(text: string): { ok: boolean; value: unknown; error: string } {
    const start = text.indexOf('{');
    if (start === -1) {
      return { ok: false, value: null, error: 'No JSON object found in model output.' };
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index]!;
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return {
              ok: true,
              value: JSON.parse(text.slice(start, index + 1)) as unknown,
              error: '',
            };
          } catch {
            return { ok: false, value: null, error: 'Model output contained malformed JSON.' };
          }
        }
      }
    }
    return { ok: false, value: null, error: 'Model output contained truncated JSON.' };
  }
}
