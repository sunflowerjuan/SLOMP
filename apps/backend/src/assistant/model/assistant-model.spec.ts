import { describe, expect, it, vi } from 'vitest';
import { ASSISTANT_TOOLS } from '../assistant-prompt.js';
import { AnthropicAssistantModel } from './anthropic-assistant-model.js';
import {
  createAssistantModel,
  DEFAULT_ANTHROPIC_EFFORT,
  DEFAULT_ANTHROPIC_MODEL,
} from './assistant-model.factory.js';
import type { ModelMessage } from './assistant-model.js';
import { FakeAssistantModel } from './fake-assistant-model.js';

describe('createAssistantModel', () => {
  it('turns the assistant off when no provider, or no key for Anthropic, is set', () => {
    expect(createAssistantModel({})).toBeNull();
    expect(createAssistantModel({ ASSISTANT_PROVIDER: '  ' })).toBeNull();
    expect(
      createAssistantModel({ ASSISTANT_PROVIDER: 'anthropic' }),
    ).toBeNull();
    expect(createAssistantModel({ ASSISTANT_PROVIDER: 'unknown' })).toBeNull();
  });

  it('picks the provider from the environment', () => {
    expect(createAssistantModel({ ASSISTANT_PROVIDER: 'fake' })).toBeInstanceOf(
      FakeAssistantModel,
    );

    const anthropic = createAssistantModel({
      ASSISTANT_PROVIDER: 'Anthropic',
      ASSISTANT_API_KEY: 'test-key',
    });
    expect(anthropic).toBeInstanceOf(AnthropicAssistantModel);
    expect(anthropic?.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    // Slompsim's requests are small: Haiku by default.
    expect(DEFAULT_ANTHROPIC_MODEL).toBe('claude-haiku-5-5');

    expect(
      createAssistantModel({
        ASSISTANT_PROVIDER: 'anthropic',
        ASSISTANT_API_KEY: 'test-key',
        ASSISTANT_MODEL: 'claude-sonnet-5-5',
      })?.model,
    ).toBe('claude-sonnet-5-5');
  });
});

describe('AnthropicAssistantModel', () => {
  function build(effort = DEFAULT_ANTHROPIC_EFFORT) {
    const create = vi.fn(async () => ({
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: 'Busco el predio.' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'search_settlements',
          input: { cadastralCode: '155140001000200030000' },
        },
      ],
      stop_reason: 'tool_use',
      usage: {
        input_tokens: 50,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 1000,
        output_tokens: 30,
      },
    }));
    const model = new AnthropicAssistantModel(
      { apiKey: 'test-key', model: 'claude-haiku-5-5', effort },
      { messages: { create } } as never,
    );
    return { model, create };
  }

  it('sends the system prompt, the tools and the effort, and reads text, tool calls and tokens', async () => {
    const { model, create } = build();
    const signal = new AbortController().signal;

    const response = await model.respond({
      system: 'Eres Slompsim.',
      tools: ASSISTANT_TOOLS,
      messages: [{ role: 'user', text: 'Hola' }],
      signal,
    });

    const [params, options] = create.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { signal: AbortSignal },
    ];
    expect(params).toMatchObject({
      model: 'claude-haiku-5-5',
      system: 'Eres Slompsim.',
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Hola' }],
    });
    expect(
      (params.tools as { name: string }[]).map(({ name }) => name),
    ).toEqual([
      'search_settlements',
      'find_unlisted_periods',
      'propose_status_change',
    ]);
    expect(options.signal).toBe(signal);
    expect(response).toMatchObject({
      text: 'Busco el predio.',
      toolCalls: [
        {
          id: 'toolu_1',
          name: 'search_settlements',
          input: { cadastralCode: '155140001000200030000' },
        },
      ],
      refused: false,
      usage: { inputTokens: 1060, outputTokens: 30 },
    });
  });

  it('replays this message turns unchanged, sends tool results, and opens a panel-started history with a user turn', async () => {
    const { model, create } = build();
    const raw = [{ type: 'tool_use', id: 'toolu_1', name: 'x', input: {} }];
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        text: 'Hay 2 periodos sin mandamiento.',
        toolCalls: [],
      },
      { role: 'user', text: 'Márcalos como pagados' },
      { role: 'assistant', text: '', toolCalls: [], raw },
      {
        role: 'tool',
        results: [{ callId: 'toolu_1', content: '[]', isError: false }],
      },
    ];

    await model.respond({
      system: 's',
      tools: [],
      messages,
      signal: new AbortController().signal,
    });

    const [params] = create.mock.calls[0] as unknown as [
      { messages: unknown[] },
    ];
    expect(params.messages).toEqual([
      { role: 'user', content: expect.stringContaining('El panel abrió') },
      { role: 'assistant', content: 'Hay 2 periodos sin mandamiento.' },
      { role: 'user', content: 'Márcalos como pagados' },
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: '[]',
            is_error: false,
          },
        ],
      },
    ]);
  });
});
