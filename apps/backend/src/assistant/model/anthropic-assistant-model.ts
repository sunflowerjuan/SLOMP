import Anthropic from '@anthropic-ai/sdk';
import type {
  AssistantModel,
  ModelMessage,
  ModelRequest,
  ModelResponse,
} from './assistant-model.js';

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AnthropicModelOptions {
  apiKey: string;
  model: string;
  effort: AnthropicEffort;
  // Only to go through a proxy or a compatible endpoint; the SDK's default
  // otherwise.
  baseURL?: string;
}

// Replies are a few sentences; the 30-second deadline is the real bound.
const MAX_TOKENS = 16000;

// The API wants the conversation to open with the user. The panel may open
// it itself (the payment orders import), so that turn gets a user turn
// before it.
const PANEL_OPENED =
  '[El panel abrió la conversación con el siguiente mensaje.]';

function toAnthropicMessages(
  messages: ModelMessage[],
): Anthropic.MessageParam[] {
  const converted: Anthropic.MessageParam[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      converted.push({ role: 'user', content: message.text });
    } else if (message.role === 'tool') {
      converted.push({
        role: 'user',
        content: message.results.map((result) => ({
          type: 'tool_result' as const,
          tool_use_id: result.callId,
          content: result.content,
          is_error: result.isError,
        })),
      });
    } else if (message.raw !== undefined) {
      // A turn of this same message: replayed exactly as it came.
      converted.push({
        role: 'assistant',
        content: message.raw as Anthropic.ContentBlockParam[],
      });
    } else if (message.text.trim()) {
      if (converted.length === 0) {
        converted.push({ role: 'user', content: PANEL_OPENED });
      }
      converted.push({ role: 'assistant', content: message.text });
    }
  }
  return converted;
}

// Claude through Anthropic's Messages API (the provider chosen in the
// Slompsim architecture spike).
export class AnthropicAssistantModel implements AssistantModel {
  readonly provider = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;

  // `client` only for tests; the real one is built from the options.
  constructor(
    private readonly options: AnthropicModelOptions,
    client?: Anthropic,
  ) {
    this.model = options.model;
    this.client =
      client ??
      new Anthropic({
        apiKey: options.apiKey,
        ...(options.baseURL ? { baseURL: options.baseURL } : {}),
        // The loop has its own deadline; one retry covers a passing failure.
        maxRetries: 1,
      });
  }

  async respond(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: request.system,
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
        })),
        messages: toAnthropicMessages(request.messages),
        output_config: { effort: this.options.effort },
        // The system prompt and the tools are the same on every call.
        cache_control: { type: 'ephemeral' },
      },
      { signal: request.signal },
    );

    const usage = response.usage;
    return {
      text: response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n')
        .trim(),
      toolCalls: response.content.flatMap((block) =>
        block.type === 'tool_use'
          ? [
              {
                id: block.id,
                name: block.name,
                input: (block.input ?? {}) as Record<string, unknown>,
              },
            ]
          : [],
      ),
      raw: response.content,
      refused: response.stop_reason === 'refusal',
      usage: {
        inputTokens:
          usage.input_tokens +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0),
        outputTokens: usage.output_tokens,
      },
    };
  }
}
