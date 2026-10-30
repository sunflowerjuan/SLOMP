import type { AssistantModel } from './assistant-model.js';
import {
  AnthropicAssistantModel,
  type AnthropicEffort,
} from './anthropic-assistant-model.js';
import { FakeAssistantModel } from './fake-assistant-model.js';

// Slompsim's requests are small (pick one of three tools and its arguments,
// or explain a rule), well within Haiku's reach, at a fraction of the cost.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';
// Short reasoning is enough for that, and a reply has 30 seconds.
export const DEFAULT_ANTHROPIC_EFFORT: AnthropicEffort = 'low';

const EFFORTS: readonly AnthropicEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export type AssistantEnv = Partial<
  Record<
    | 'ASSISTANT_PROVIDER'
    | 'ASSISTANT_API_KEY'
    | 'ASSISTANT_BASE_URL'
    | 'ASSISTANT_MODEL'
    | 'ASSISTANT_EFFORT',
    string
  >
>;

// The model Slompsim talks to, from environment variables:
//   ASSISTANT_PROVIDER  "anthropic" or "fake"; unset turns the assistant off
//   ASSISTANT_API_KEY   the provider's key (required for "anthropic")
//   ASSISTANT_BASE_URL  optional, a different endpoint for the same API
//   ASSISTANT_MODEL     optional, the model id
//   ASSISTANT_EFFORT    optional, low | medium | high | xhigh | max
// Null when the assistant is off or misconfigured: its conversation answers
// 503 and everything else keeps working.
export function createAssistantModel(env: AssistantEnv): AssistantModel | null {
  const provider = env.ASSISTANT_PROVIDER?.trim().toLowerCase();
  if (!provider) return null;

  if (provider === 'fake') return new FakeAssistantModel();

  if (provider === 'anthropic') {
    const apiKey = env.ASSISTANT_API_KEY?.trim();
    if (!apiKey) return null;
    const effort = env.ASSISTANT_EFFORT?.trim().toLowerCase();
    return new AnthropicAssistantModel({
      apiKey,
      model: env.ASSISTANT_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
      effort: EFFORTS.includes(effort as AnthropicEffort)
        ? (effort as AnthropicEffort)
        : DEFAULT_ANTHROPIC_EFFORT,
      baseURL: env.ASSISTANT_BASE_URL?.trim() || undefined,
    });
  }

  return null;
}
