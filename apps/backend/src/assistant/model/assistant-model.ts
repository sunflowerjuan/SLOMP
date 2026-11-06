// The contract between Slompsim's conversation loop and a language model.
// The loop only speaks this neutral format, so changing provider means
// changing environment variables (assistant-model.factory.ts), never the
// loop.

export interface ModelTool {
  name: string;
  description: string;
  // JSON Schema of the tool's input.
  inputSchema: Record<string, unknown>;
}

export interface ModelToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ModelToolResult {
  callId: string;
  // JSON the tool returned, or the error it answered with.
  content: string;
  isError: boolean;
}

export type ModelMessage =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string;
      toolCalls: ModelToolCall[];
      // The provider's own copy of the turn, replayed unchanged on the next
      // call of the same message (it may carry more than text and tool
      // calls). Absent for turns that come from the client's history.
      raw?: unknown;
    }
  | { role: 'tool'; results: ModelToolResult[] };

export interface ModelRequest {
  system: string;
  messages: ModelMessage[];
  tools: ModelTool[];
  // Aborted when the message runs out of time.
  signal: AbortSignal;
}

export interface ModelResponse {
  text: string;
  toolCalls: ModelToolCall[];
  raw?: unknown;
  // The provider declined to answer.
  refused: boolean;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AssistantModel {
  // For the logs, e.g. "anthropic" and the model id.
  readonly provider: string;
  readonly model: string;
  respond(request: ModelRequest): Promise<ModelResponse>;
}

// Injection token. Its value is null when no provider is configured: the
// conversation then answers 503 and the rest of the panel keeps working.
export const ASSISTANT_MODEL = Symbol('ASSISTANT_MODEL');
