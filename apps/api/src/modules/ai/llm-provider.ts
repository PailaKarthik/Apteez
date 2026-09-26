/**
 * Vendor-neutral provider abstractions. Implementations speak plain HTTPS to
 * OpenAI-compatible endpoints (`/chat/completions`, `/embeddings`) — no
 * vendor SDK is installed, so the model vendor changes via environment
 * config, never code. Keys live server-side only and are never logged.
 */

export interface LlmMessage {
  role: 'system' | 'user';
  content: string;
}

export interface LlmResult {
  text: string;
  promptTokens: number | null;
  completionTokens: number | null;
  model: string;
  latencyMs: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  generate(
    messages: LlmMessage[],
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<LlmResult>;
}

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  model: string;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  isConfigured(): boolean;
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}

export interface OpenAiCompatibleConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  dimensions?: number;
}

function defaultBaseUrl(): string {
  return 'https://api.openai.com/v1';
}

async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`LLM provider responded with HTTP ${response.status}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Chat-completions provider over any OpenAI-compatible HTTP API. */
export class OpenAiCompatibleLlmProvider implements LLMProvider {
  readonly name = 'openai-compatible';

  constructor(private readonly config: OpenAiCompatibleConfig) {}

  get model(): string {
    return this.config.model;
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  async generate(
    messages: LlmMessage[],
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<LlmResult> {
    if (!this.config.apiKey) {
      throw new Error('LLM provider is not configured (missing API key).');
    }
    const base = (this.config.baseUrl ?? defaultBaseUrl()).replace(/\/$/, '');
    const startedAt = Date.now();
    const payload = (await postJson(
      `${base}/chat/completions`,
      this.config.apiKey,
      {
        model: this.config.model,
        messages,
        max_tokens: opts?.maxTokens ?? 1024,
        temperature: opts?.temperature ?? 0.2,
      },
      60_000,
    )) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = payload.choices?.[0]?.message?.content ?? '';
    if (!text) {
      throw new Error('LLM provider returned an empty completion.');
    }
    return {
      text,
      promptTokens: payload.usage?.prompt_tokens ?? null,
      completionTokens: payload.usage?.completion_tokens ?? null,
      model: this.config.model,
      latencyMs: Date.now() - startedAt,
    };
  }
}

/** Embeddings provider over any OpenAI-compatible HTTP API. */
export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai-compatible';

  constructor(private readonly config: OpenAiCompatibleConfig & { dimensions: number }) {}

  get model(): string {
    return this.config.model;
  }

  get dimensions(): number {
    return this.config.dimensions;
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const [result] = await this.embedBatch([text]);
    if (!result) {
      throw new Error('Embedding provider returned no vectors.');
    }
    return result;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.config.apiKey) {
      throw new Error('Embedding provider is not configured (missing API key).');
    }
    if (texts.length === 0) {
      return [];
    }
    const base = (this.config.baseUrl ?? defaultBaseUrl()).replace(/\/$/, '');
    const payload = (await postJson(
      `${base}/embeddings`,
      this.config.apiKey,
      { model: this.config.model, input: texts },
      60_000,
    )) as { data?: Array<{ embedding?: number[] }> };
    const vectors = payload.data ?? [];
    if (vectors.length !== texts.length) {
      throw new Error(
        `Embedding provider returned ${vectors.length} vectors for ${texts.length} inputs.`,
      );
    }
    return vectors.map((row) => {
      if (!row.embedding || row.embedding.length === 0) {
        throw new Error('Embedding provider returned an empty vector.');
      }
      return { vector: row.embedding, dimensions: row.embedding.length, model: this.config.model };
    });
  }
}
