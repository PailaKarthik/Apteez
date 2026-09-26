import { createHash } from 'node:crypto';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { tool, type StructuredTool } from '@langchain/core/tools';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import type { AiToolRegistry } from './ai-tool-registry';
import { coachResponseSchema, type CoachResponse } from './coach.schemas';
import { StructuredOutputService } from './structured-output.service';

/**
 * Performance Coach as a REAL LangGraph.js agentic workflow.
 *
 * Graph: gather → reason ⇄ tools → finalize → ground → END
 *
 * - `gather` runs three deterministic tools in parallel (no LLM involved).
 * - `reason` is a LangChain chat model with the eight controlled tools
 *   bound. It may call tools for at most MAX_TOOL_ROUNDS rounds; afterwards
 *   it answers from the accumulated transcript with tools unbound.
 * - `finalize` parses the answer with `withStructuredOutput` (Zod), retries
 *   once with a repair instruction, then falls back to a provider-agnostic
 *   text+parse path, then gives up (the service substitutes the
 *   deterministic summary — the model can never block coaching).
 * - `ground` intersects suggested problem IDs with IDs the tools actually
 *   produced, so hallucinated IDs can never reach the user.
 *
 * Hard guardrails (no unbounded agent loops):
 * - MAX_TOOL_ROUNDS tool-calling rounds, TOOL_TIMEOUT_MS per tool call,
 *   GRAPH_TIMEOUT_MS for the whole run, recursionLimit on compile.
 * - Tools close over the requesting userId: the model can only ever read
 *   THAT user's data, only through Zod-validated application services.
 *   No SQL, no repositories, no secrets, no writes, no other users.
 */

export const COACH_MAX_TOOL_ROUNDS = 2;
/** Absolute ceiling on tool executions per graph run (8-per-message cap applies first). */
export const COACH_MAX_TOTAL_TOOL_CALLS = 12;
export const COACH_TOOL_TIMEOUT_MS = 10_000;
export const COACH_GRAPH_TIMEOUT_MS = 75_000;
const GROUNDING_CHARS = 12_000;
const TOOL_RESULT_CHARS = 4_000;

/** Versioned agent configuration — recorded in telemetry and evaluation. */
export const COACH_PROMPT_VERSION = '2026-09-02.v1';
export const COACH_GRAPH_VERSION = '2026-09-02.v1';
export const COACH_SCHEMA_VERSION = '2026-09-01.v1';

const COACH_SYSTEM_PROMPT =
  'You are an aptitude Performance Coach. The DATA section contains FACTS observed by backend tools — ' +
  'treat them as ground truth and never restate them with different numbers. ' +
  'Your prose must distinguish FACTS (from tools/DATA) from RECOMMENDATIONS (study advice) and ' +
  'INFERENCES (clearly hedged interpretations, never stated as observed). ' +
  'Never invent solved counts, accuracy, ratings, weak areas, or learning progress. ' +
  'Use tools when you need data beyond what is shown; otherwise answer directly. ' +
  'suggestedProblems must only contain problem IDs present in tool output (or be empty).';

export interface CoachGraphInput {
  userId: string;
  requestId?: string;
}

export interface CoachGraphDeps {
  registry: AiToolRegistry;
  /** Model factory (injectable so tests run the graph with a fake model). */
  buildModel: () => BaseChatModel;
  modelName: string;
}

export interface CoachGraphResult {
  response: CoachResponse | null;
  validation: 'valid' | 'repaired' | 'invalid';
  structuredAttempts: number;
  toolCallCount: number;
  /** Tool results served from the run cache instead of PostgreSQL. */
  toolCacheHits: number;
  model: string;
  promptVersion: string;
  graphVersion: string;
  promptTokens: number | null;
  completionTokens: number | null;
  error?: string;
}

/** LangChain chat model over the configured OpenAI-compatible endpoint. */
export function buildCoachModel(config: ConfigService<Env, true>): ChatOpenAI {
  return new ChatOpenAI({
    model: config.get('LLM_MODEL', { infer: true }),
    apiKey: config.get('LLM_API_KEY', { infer: true }),
    configuration: { baseURL: config.get('LLM_BASE_URL', { infer: true }) },
    temperature: 0,
    timeout: 30_000,
    maxRetries: 1,
  });
}

/** Stable cache key for one tool call (sorted keys, capped length). */
export function toolCacheKey(name: string, input: unknown): string {
  const sorted = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(sorted);
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([key, val]) => [key, sorted(val)]),
      );
    }
    return value;
  };
  return `${name}:${JSON.stringify(sorted(input ?? {}))}`.slice(0, 500);
}

/**
 * Cached tool execution shared by every node in one graph run: repeated
 * calls for the same data (gather → reason loop → ground) hit the run cache
 * instead of PostgreSQL. Returns the value and whether it was cached.
 */
export async function cachedExecute(
  userId: string,
  registry: AiToolRegistry,
  cache: Map<string, unknown>,
  name: string,
  input: unknown,
): Promise<{ value: unknown; cached: boolean }> {
  const key = toolCacheKey(name, input);
  if (cache.has(key)) {
    return { value: cache.get(key), cached: true };
  }
  const value = await withTimeout(
    registry.execute(userId, name, input ?? {}),
    COACH_TOOL_TIMEOUT_MS,
    `AI tool ${name} timed out.`,
  );
  cache.set(key, value);
  return { value, cached: false };
}

/** The eight controlled tools, each bound to one authorized user. */
export function buildCoachTools(
  userId: string,
  registry: AiToolRegistry,
  cache: Map<string, unknown>,
  onCacheHit?: () => void,
): StructuredTool[] {
  return registry.definitions().map((definition) =>
    tool(
      async (input: Record<string, unknown>): Promise<string> => {
        const { value, cached } = await cachedExecute(
          userId,
          registry,
          cache,
          definition.name,
          input ?? {},
        );
        if (cached) {
          onCacheHit?.();
        }
        return JSON.stringify(value ?? null).slice(0, TOOL_RESULT_CHARS);
      },
      { name: definition.name, description: definition.description, schema: definition.input },
    ),
  );
}

const CoachState = Annotation.Root({
  userId: Annotation<string>,
  grounding: Annotation<string>({ reducer: (_, next) => next, default: () => '' }),
  messages: Annotation<BaseMessage[]>({
    reducer: (current, next) => current.concat(next),
    default: () => [],
  }),
  rounds: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  toolCallCount: Annotation<number>({
    reducer: (current, next) => current + next,
    default: () => 0,
  }),
  toolCacheHits: Annotation<number>({
    reducer: (current, next) => current + next,
    default: () => 0,
  }),
  validated: Annotation<CoachResponse | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  structuredAttempts: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  knownIds: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),
  promptTokens: Annotation<number | null>({ reducer: (_, next) => next, default: () => null }),
  completionTokens: Annotation<number | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

type GraphState = typeof CoachState.State;

function tokensOf(message: AIMessage): { prompt: number | null; completion: number | null } {
  const usage = message.usage_metadata as
    { input_tokens?: number; output_tokens?: number } | undefined;
  return {
    prompt: typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
    completion: typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
  };
}

export function buildCoachGraph(deps: CoachGraphDeps) {
  const { registry, buildModel } = deps;
  // Run-scoped tool-result cache: gather, the reason loop, and ground share
  // it, so repeated calls for the same data never re-query PostgreSQL.
  const runCache = new Map<string, unknown>();
  let cacheHits = 0;
  const noteHit = (): void => {
    cacheHits += 1;
  };

  async function gather(state: GraphState): Promise<Partial<GraphState>> {
    const timed = <T>(promise: Promise<T>, name: string): Promise<T> =>
      withTimeout(promise, COACH_TOOL_TIMEOUT_MS, `AI tool ${name} timed out.`);
    const [performance, weakAreas, activity] = await Promise.all([
      timed(registry.execute(state.userId, 'getUserPerformance', {}), 'getUserPerformance'),
      timed(registry.execute(state.userId, 'getWeakAreas', {}), 'getWeakAreas'),
      timed(registry.execute(state.userId, 'getLearningProgress', {}), 'getLearningProgress'),
    ]);
    runCache.set(toolCacheKey('getUserPerformance', {}), performance);
    runCache.set(toolCacheKey('getWeakAreas', {}), weakAreas);
    runCache.set(toolCacheKey('getLearningProgress', {}), activity);
    const grounding = JSON.stringify({ performance, weakAreas, activity }).slice(
      0,
      GROUNDING_CHARS,
    );
    return {
      grounding,
      messages: [
        new SystemMessage(COACH_SYSTEM_PROMPT),
        new HumanMessage(
          `FACTS (observed backend data — ground every statistic in these):\n${grounding}\n\n` +
            `REQUEST: Coach me on my next week of practice. Give RECOMMENDATIONS (advice), ` +
            `not new facts.`,
        ),
      ],
    };
  }

  async function reason(state: GraphState): Promise<Partial<GraphState>> {
    const model = buildModel();
    const lcTools = buildCoachTools(state.userId, registry, runCache, noteHit);
    // Tools stay bound for the first MAX_TOOL_ROUNDS rounds; afterwards the
    // model answers from the accumulated transcript with tools unbound, so
    // the loop always terminates even with a tool-call-happy model.
    const bound = state.rounds < COACH_MAX_TOOL_ROUNDS ? bindToolsOrThrow(model, lcTools) : model;
    const answer = (await bound.invoke(state.messages)) as AIMessage;
    const tokens = tokensOf(answer);
    return {
      messages: [answer],
      rounds: state.rounds + 1,
      promptTokens: tokens.prompt,
      completionTokens: tokens.completion,
    };
  }

  function routeAfterReason(state: GraphState): 'tools' | 'finalize' {
    const last = state.messages[state.messages.length - 1];
    const calls = last instanceof AIMessage ? (last.tool_calls ?? []) : [];
    if (calls.length > 0 && state.rounds <= COACH_MAX_TOOL_ROUNDS) {
      return 'tools';
    }
    return 'finalize';
  }

  async function executeTools(state: GraphState): Promise<Partial<GraphState>> {
    const last = state.messages[state.messages.length - 1];
    const calls = last instanceof AIMessage ? (last.tool_calls ?? []) : [];
    const toolsByName = new Map(
      buildCoachTools(state.userId, registry, runCache, noteHit).map((t) => [t.name, t]),
    );
    const remaining = Math.max(0, COACH_MAX_TOTAL_TOOL_CALLS - state.toolCallCount);
    const toolMessages: ToolMessage[] = [];
    for (const call of calls.slice(0, Math.min(8, remaining))) {
      const toolFn = call.name ? toolsByName.get(call.name) : undefined;
      if (!toolFn || !call.id) {
        continue;
      }
      let content: string;
      try {
        // Invoke with args only: passing the LangChain `toolCall` config
        // would make invoke() return a ToolMessage object (which stringifies
        // to "[object ToolMessage]"). We build the ToolMessage ourselves.
        const raw = await toolFn.invoke(call.args);
        content = typeof raw === 'string' ? raw : JSON.stringify(raw);
      } catch (error) {
        content =
          `Tool ${call.name} failed: ${error instanceof Error ? error.message : String(error)}`.slice(
            0,
            TOOL_RESULT_CHARS,
          );
      }
      toolMessages.push(new ToolMessage({ content, tool_call_id: call.id, name: call.name }));
    }
    const hits = cacheHits;
    cacheHits = 0;
    return { messages: toolMessages, toolCallCount: toolMessages.length, toolCacheHits: hits };
  }

  async function finalize(state: GraphState): Promise<Partial<GraphState>> {
    const model = buildModel();
    // NOTE: the base withStructuredOutput implementation returns tool-call
    // args without running Zod validation itself (provider-native models
    // validate; generic ones may not), so every tier re-validates with
    // coachResponseSchema explicitly. Never trust model output blindly.
    const validate = (value: unknown) => coachResponseSchema.safeParse(value);
    // Tier 1: LangChain structured output + explicit Zod validation.
    try {
      const structured = model.withStructuredOutput(coachResponseSchema);
      const parsed = validate(await structured.invoke(state.messages));
      if (parsed.success) {
        return { validated: parsed.data, structuredAttempts: 1 };
      }
    } catch {
      // Tier 2: single repair retry with explicit schema instruction.
    }
    try {
      const structured = model.withStructuredOutput(coachResponseSchema);
      const parsed = validate(
        await structured.invoke([
          ...state.messages,
          new HumanMessage(
            'Your previous response did not match the required JSON schema. ' +
              'Respond with ONLY a JSON object matching the schema: summary, strengths[], weakAreas[], ' +
              'recommendations[], suggestedProblems[] (problem-ID strings already seen, or empty), confidence.',
          ),
        ]),
      );
      if (parsed.success) {
        return { validated: parsed.data, structuredAttempts: 2 };
      }
    } catch {
      // Tier 3: provider-agnostic plain-text parse (see below).
    }
    try {
      const answer = (await model.invoke([
        ...state.messages,
        new HumanMessage('Respond with ONLY the JSON object, no prose.'),
      ])) as AIMessage;
      const extracted = StructuredOutputService.extractJson(
        typeof answer.content === 'string' ? answer.content : '',
      );
      if (extracted.ok) {
        const parsed = coachResponseSchema.safeParse(extracted.value);
        if (parsed.success) {
          return { validated: parsed.data, structuredAttempts: 3 };
        }
      }
    } catch {
      // Fall through to deterministic fallback in the service.
    }
    return { validated: null, structuredAttempts: 3 };
  }

  async function ground(state: GraphState): Promise<Partial<GraphState>> {
    if (!state.validated) {
      return {};
    }
    const knownIds = await collectKnownProblemIds(state.userId, registry, runCache);
    const validated: CoachResponse = {
      ...state.validated,
      suggestedProblems: (state.validated.suggestedProblems ?? []).filter((id) => knownIds.has(id)),
    };
    return { validated, knownIds: [...knownIds] };
  }

  const graph = new StateGraph(CoachState)
    .addNode('gather', gather)
    .addNode('reason', reason)
    .addNode('tools', executeTools)
    .addNode('finalize', finalize)
    .addNode('ground', ground)
    .addEdge(START, 'gather')
    .addEdge('gather', 'reason')
    .addConditionalEdges('reason', routeAfterReason, { tools: 'tools', finalize: 'finalize' })
    .addEdge('tools', 'reason')
    .addEdge('finalize', 'ground')
    .addEdge('ground', END);
  return graph.compile();
}

/**
 * Tool binding is optional on the base chat-model type; the coach requires
 * it, so fail fast with a clear error instead of crashing mid-graph.
 */
function bindToolsOrThrow(
  model: BaseChatModel,
  lcTools: StructuredTool[],
): { invoke(messages: BaseMessage[]): Promise<AIMessage> } {
  const binder = model as unknown as {
    bindTools?: (tools: StructuredTool[]) => {
      invoke(messages: BaseMessage[]): Promise<AIMessage>;
    };
  };
  if (typeof binder.bindTools !== 'function') {
    throw new Error('Coach model does not support LangChain tool calling.');
  }
  return binder.bindTools(lcTools);
}

export async function runCoachGraph(
  input: CoachGraphInput,
  deps: CoachGraphDeps,
): Promise<CoachGraphResult> {
  const compiled = buildCoachGraph(deps);
  const signal = AbortSignal.timeout(COACH_GRAPH_TIMEOUT_MS);
  const final = await compiled.invoke(
    { userId: input.userId, grounding: '', messages: [], rounds: 0, toolCallCount: 0 },
    { signal, recursionLimit: 20 },
  );
  const validated = (final.validated ?? null) as CoachResponse | null;
  return {
    response: validated,
    validation: validated ? (final.structuredAttempts > 1 ? 'repaired' : 'valid') : 'invalid',
    structuredAttempts: final.structuredAttempts,
    toolCallCount: final.toolCallCount,
    toolCacheHits: final.toolCacheHits,
    model: deps.modelName,
    promptVersion: COACH_PROMPT_VERSION,
    graphVersion: COACH_GRAPH_VERSION,
    promptTokens: final.promptTokens ?? null,
    completionTokens: final.completionTokens ?? null,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * IDs the tools actually produced — the only suggestible problem set.
 * Reads through the run cache so data fetched by gather/reason is reused
 * instead of re-queried.
 */
async function collectKnownProblemIds(
  userId: string,
  registry: AiToolRegistry,
  cache: Map<string, unknown>,
): Promise<Set<string>> {
  const [recent, topics] = await Promise.all([
    cachedExecute(userId, registry, cache, 'getRecentSubmissions', { limit: 50 }).then(
      (result) => result.value,
    ),
    cachedExecute(userId, registry, cache, 'getTopicPerformance', {}).then(
      (result) => result.value,
    ),
  ]);
  const ids = new Set<string>();
  for (const row of (recent ?? []) as Array<{ problemId?: string }>) {
    if (row.problemId) {
      ids.add(row.problemId);
    }
  }
  for (const topic of (topics ?? []) as Array<{ topicSlug?: string }>) {
    if (!topic.topicSlug) {
      continue;
    }
    const problems = (await cachedExecute(userId, registry, cache, 'getProblemsForTopic', {
      topicSlug: topic.topicSlug,
      limit: 20,
    })
      .then((result) => result.value)
      .catch(() => [])) as Array<{ id?: string }>;
    for (const problem of problems ?? []) {
      if (problem.id) {
        ids.add(problem.id);
      }
    }
  }
  return ids;
}

/** Stable per-user cache key helper (sha256-truncated, no raw user IDs). */
export function coachCacheKey(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32);
}
