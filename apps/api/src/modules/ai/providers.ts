import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import {
  OpenAiCompatibleEmbeddingProvider,
  OpenAiCompatibleLlmProvider,
  type EmbeddingProvider,
  type LLMProvider,
} from './llm-provider';

/** DI tokens: consumers depend on capability, never on a vendor class. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

export function provideLlm(): {
  provide: typeof LLM_PROVIDER;
  useFactory: (config: ConfigService<Env, true>) => LLMProvider;
  inject: [typeof ConfigService];
} {
  return {
    provide: LLM_PROVIDER,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>): LLMProvider =>
      new OpenAiCompatibleLlmProvider({
        apiKey: config.get('LLM_API_KEY', { infer: true }),
        baseUrl: config.get('LLM_BASE_URL', { infer: true }),
        model: config.get('LLM_MODEL', { infer: true }),
      }),
  };
}

export function provideEmbedding(): {
  provide: typeof EMBEDDING_PROVIDER;
  useFactory: (config: ConfigService<Env, true>) => EmbeddingProvider;
  inject: [typeof ConfigService];
} {
  return {
    provide: EMBEDDING_PROVIDER,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>): EmbeddingProvider =>
      new OpenAiCompatibleEmbeddingProvider({
        apiKey: config.get('EMBEDDING_API_KEY', { infer: true }),
        baseUrl: config.get('EMBEDDING_BASE_URL', { infer: true }),
        model: config.get('EMBEDDING_MODEL', { infer: true }),
        dimensions: config.get('EMBEDDING_DIMENSIONS', { infer: true }),
      }),
  };
}
