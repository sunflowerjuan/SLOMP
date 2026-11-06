import type {
  AssistantModel,
  ModelRequest,
  ModelResponse,
} from './assistant-model.js';

export type FakeTurn = Partial<Omit<ModelResponse, 'usage'>> & {
  usage?: ModelResponse['usage'];
};

// Decides each turn from what the model received. `turn` counts the calls
// made for the current message, from 0.
export type FakeScript = (
  request: ModelRequest,
  turn: number,
) => FakeTurn | Promise<FakeTurn>;

const FIXED_REPLY: FakeScript = () => ({
  text: 'Slompsim está en modo de prueba: no hay un modelo conectado.',
});

// A model with a scripted answer, with no provider behind it. Tests give it
// a script and read what it received in `requests`;
// ASSISTANT_PROVIDER=fake runs it with a fixed reply, to work on the panel
// without a key.
export class FakeAssistantModel implements AssistantModel {
  readonly provider = 'fake';
  readonly model = 'scripted';
  // A copy of every request, as the model received it.
  readonly requests: ModelRequest[] = [];
  private turn = 0;

  constructor(private readonly script: FakeScript = FIXED_REPLY) {}

  async respond(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push({
      ...request,
      messages: structuredClone(request.messages),
    });
    const isNewMessage = request.messages.at(-1)?.role === 'user';
    if (isNewMessage) this.turn = 0;
    const answer = await this.script(request, this.turn++);
    return {
      text: answer.text ?? '',
      toolCalls: answer.toolCalls ?? [],
      raw: answer.raw,
      refused: answer.refused ?? false,
      usage: answer.usage ?? { inputTokens: 100, outputTokens: 20 },
    };
  }

  // Everything the model was sent, as one string: what a test searches for
  // data that must never reach it.
  everythingSent(): string {
    return JSON.stringify(
      this.requests.map(({ system, tools, messages }) => ({
        system,
        tools,
        messages,
      })),
    );
  }
}
