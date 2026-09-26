import { AIMessageChunk } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { AiToolRegistry } from './ai-tool-registry';
import {
  COACH_MAX_TOOL_ROUNDS,
  COACH_PROMPT_VERSION,
  buildCoachTools,
  runCoachGraph,
  toolCacheKey,
  type CoachGraphDeps,
} from './coach-graph';
import { StructuredOutputService } from './structured-output.service';

const KNOWN_PROBLEM_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_PROBLEM_ID = '22222222-2222-4222-8222-222222222222';

function cannedToolsService() {
  return {
    getUserPerformance: jest.fn(async () => ({
      overall: { totalSolved: 12, accuracy: 66 },
      domains: [],
    })),
    getTopicPerformance: jest.fn(async () => [{ topicSlug: 'time-and-work' }]),
    getRecentSubmissions: jest.fn(async () => [{ problemId: KNOWN_PROBLEM_ID }]),
    getChallengeHistory: jest.fn(async () => []),
    getContestHistory: jest.fn(async () => []),
    getLearningProgress: jest.fn(async () => ({ summary: 'steady' })),
    getWeakAreas: jest.fn(async () => [{ topicName: 'Percentages', reason: 'low accuracy' }]),
    getProblemsForTopic: jest.fn(async () => [{ id: KNOWN_PROBLEM_ID }]),
  };
}

/** Scripted chat model: pops one AIMessage per invoke, records bindings. */
class FakeCoachModel extends BaseChatModel {
  boundToolNames: string[][] = [];

  constructor(private readonly script: AIMessageChunk[]) {
    super({});
  }

  _llmType(): string {
    return 'fake-coach-model';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async _generate(_messages: BaseMessage[], _options: any): Promise<ChatResult> {
    const message = this.script.shift() ?? new AIMessageChunk('{}');
    const text = typeof message.content === 'string' ? message.content : '';
    return { generations: [{ text, message }] };
  }

  override bindTools(tools: { name?: string }[]): this {
    this.boundToolNames.push(tools.map((tool) => tool.name ?? '?'));
    return this;
  }
}

function validExtract(id: string): AIMessageChunk {
  return new AIMessageChunk({
    content: '',
    tool_calls: [
      {
        id: `extract-${id.slice(0, 8)}`,
        name: 'extract',
        args: {
          summary: 'Focus on percentages this week.',
          strengths: [],
          weakAreas: ['Percentages'],
          recommendations: ['Drill percentages in short timed sets.'],
          suggestedProblems: [id, UNKNOWN_PROBLEM_ID],
          confidence: 'medium',
        },
      },
    ],
  });
}

function invalidExtract(id: string): AIMessageChunk {
  return new AIMessageChunk({
    content: '',
    tool_calls: [{ id: `bad-${id}`, name: 'extract', args: { summary: '' } }],
  });
}

function depsFor(model: FakeCoachModel): { deps: CoachGraphDeps; registry: AiToolRegistry } {
  const registry = new AiToolRegistry(cannedToolsService() as never);
  return {
    deps: { registry, modelName: 'fake-model', buildModel: () => model },
    registry,
  };
}

describe('coach-graph (LangGraph Performance Coach)', () => {
  it('runs gather → tool loop → structured output and grounds suggested IDs', async () => {
    const model = new FakeCoachModel([
      new AIMessageChunk({
        content: 'checking weak areas',
        tool_calls: [{ id: 'call-1', name: 'getWeakAreas', args: {} }],
      }),
      new AIMessageChunk('I have what I need.'),
      validExtract(KNOWN_PROBLEM_ID),
    ]);
    const { deps } = depsFor(model);
    const result = await runCoachGraph({ userId: 'user-1' }, deps);

    expect(result.response).not.toBeNull();
    expect(result.validation).toBe('valid');
    expect(result.toolCallCount).toBe(1);
    // getWeakAreas was already gathered: the loop hit the run cache.
    expect(result.toolCacheHits).toBeGreaterThanOrEqual(1);
    expect(result.promptVersion).toBe(COACH_PROMPT_VERSION);
    // Unknown IDs are dropped; tool-produced IDs survive grounding.
    expect(result.response?.suggestedProblems).toEqual([KNOWN_PROBLEM_ID]);
    // All eight controlled tools were bound for the reasoning rounds.
    expect(model.boundToolNames[0]).toHaveLength(8);
    expect(model.boundToolNames[0]).toContain('getUserPerformance');
    expect(model.boundToolNames[0]).toContain('getProblemsForTopic');
  });

  it('terminates a tool-call-happy model within the round budget', async () => {
    let calls = 0;
    const endless = (): AIMessageChunk =>
      new AIMessageChunk({
        content: 'more data',
        tool_calls: [{ id: `c-${(calls += 1)}`, name: 'getWeakAreas', args: {} }],
      });
    // After MAX_TOOL_ROUNDS the graph unbinds tools, so even a model that
    // always requests calls ends up answering from the transcript.
    const model = new FakeCoachModel([
      endless(),
      endless(),
      new AIMessageChunk('answering from the transcript now'),
      validExtract(KNOWN_PROBLEM_ID),
    ]);
    const { deps } = depsFor(model);
    const result = await runCoachGraph({ userId: 'user-1' }, deps);

    expect(result.response).not.toBeNull();
    expect(result.toolCallCount).toBeLessThanOrEqual(COACH_MAX_TOOL_ROUNDS * 8);
  });

  it('returns null after repeated invalid structured output (service falls back)', async () => {
    const model = new FakeCoachModel([
      new AIMessageChunk('answering directly'),
      invalidExtract('a'),
      invalidExtract('b'),
      new AIMessageChunk('not json at all {{{'),
    ]);
    const { deps } = depsFor(model);
    const result = await runCoachGraph({ userId: 'user-1' }, deps);

    expect(result.response).toBeNull();
    expect(result.validation).toBe('invalid');
  });

  it('scopes every tool call to the requesting user', async () => {
    const service = cannedToolsService();
    const registry = new AiToolRegistry(service as never);
    const cache = new Map<string, unknown>();
    const tools = buildCoachTools('user-abc', registry, cache);
    const weakAreas = tools.find((tool) => tool.name === 'getWeakAreas');
    await weakAreas?.invoke({});
    expect(service.getWeakAreas).toHaveBeenCalled();
    // No tool schema accepts a userId: the model cannot redirect reads.
    for (const definition of registry.definitions()) {
      const shape =
        definition.input instanceof Object && 'shape' in definition.input
          ? (definition.input as { shape: Record<string, unknown> }).shape
          : {};
      expect(Object.keys(shape)).not.toContain('userId');
    }
    // Unknown tool names requested by the model are skipped, never executed.
    // NOTE: one shared fake — buildModel() runs per graph node, so a fresh
    // instance per call would replay the script forever.
    const sneaky = new FakeCoachModel([
      new AIMessageChunk({
        content: 'sneaky',
        tool_calls: [
          { id: 'evil-1', name: 'dropDatabase', args: {} },
          { id: 'ok-1', name: 'getWeakAreas', args: {} },
        ],
      }),
      new AIMessageChunk('done'),
      validExtract(KNOWN_PROBLEM_ID),
    ]);
    const result = await runCoachGraph(
      { userId: 'user-abc' },
      { registry, modelName: 'fake-model', buildModel: () => sneaky },
    );
    expect(result.toolCallCount).toBe(1);
    expect(result.response).not.toBeNull();
  });

  it('tool cache keys are stable regardless of key order', () => {
    expect(toolCacheKey('getTopicPerformance', { topicSlug: 'a', limit: 5 })).toBe(
      toolCacheKey('getTopicPerformance', { limit: 5, topicSlug: 'a' }),
    );
    expect(toolCacheKey('getTopicPerformance', { topicSlug: 'a' })).not.toBe(
      toolCacheKey('getTopicPerformance', { topicSlug: 'b' }),
    );
  });

  it('text fallback extracts balanced JSON via the shared extractor', () => {
    expect(StructuredOutputService.extractJson('```json\n{"a":1}\n```').value).toEqual({ a: 1 });
    expect(StructuredOutputService.extractJson('  {"a":2}  ').value).toEqual({ a: 2 });
    expect(StructuredOutputService.extractJson('no json here').ok).toBe(false);
  });
});
