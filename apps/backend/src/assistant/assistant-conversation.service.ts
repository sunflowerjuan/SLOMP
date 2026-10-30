import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { LogSink } from '../request-logging.js';
import {
  ASSISTANT_SYSTEM_PROMPT,
  ASSISTANT_TOOLS,
  FIND_UNLISTED_PERIODS,
  paymentOrderFileNote,
  PROPOSE_STATUS_CHANGE,
  SEARCH_SETTLEMENTS,
} from './assistant-prompt.js';
import {
  AssistantToolsService,
  type PaymentOrderFileRow,
} from './assistant-tools.service.js';
import { maskDocuments } from './mask-documents.js';
import {
  ASSISTANT_MODEL,
  type AssistantModel,
  type ModelMessage,
  type ModelToolCall,
  type ModelToolResult,
} from './model/assistant-model.js';
import type {
  AcceptedStatusChange,
  RejectedStatusChange,
  StatusChangeRequest,
} from './review-status-changes.js';

export const MAX_TOOL_CALLS_PER_MESSAGE = 5;
export const MESSAGE_DEADLINE_MS = 30_000;

// Where the per-message log line goes; stdout unless a test provides one.
export const ASSISTANT_LOG_SINK = Symbol('ASSISTANT_LOG_SINK');

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantMessageInput {
  message: string;
  // The last turns, kept by the client: the server stores no conversation.
  history?: ConversationTurn[];
  context?: { paymentOrderRows?: PaymentOrderFileRow[] };
}

// The changes the model proposed, already checked against the domain rules:
// what the panel shows and sends to POST .../assistant/changes/confirm.
export interface AssistantProposals {
  accepted: AcceptedStatusChange[];
  rejected: RejectedStatusChange[];
  note?: string;
}

export interface AssistantReply {
  reply: string;
  // The last proposal of this message; null when it proposed nothing.
  proposals: AssistantProposals | null;
}

// Shown when the provider declines to answer.
const REFUSED_REPLY =
  'Eso no lo puedo hacer. Puedo buscar liquidaciones por código catastral, explicarte las reglas de los estados y preparar cambios de estado.';

const stdout: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

function unavailable(reason: 'NOT_CONFIGURED' | 'FAILED' | 'TIMEOUT') {
  return new ServiceUnavailableException(
    errorBody(
      ErrorCode.ASSISTANT_UNAVAILABLE,
      'The assistant is not available right now. No settlement changed.',
      { reason },
    ),
  );
}

function tooManyToolCalls() {
  return new HttpException(
    errorBody(
      ErrorCode.ASSISTANT_TOO_MANY_TOOL_CALLS,
      `The request needed more than ${MAX_TOOL_CALLS_PER_MESSAGE} tool calls. Split it, for example one property at a time.`,
    ),
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

class DeadlineExceeded extends Error {}
// The provider failed: down, wrong key, network.
class ModelFailed extends Error {}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// Integer ids may come as numbers or numeric strings from a model.
function asId(value: unknown): number | undefined {
  if (isPositiveInteger(value)) return value;
  if (typeof value === 'string' && /^\d{1,10}$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

// Answers one message of the Administrator: sends it to the model with the
// tools, runs the tools the model calls (none of them writes) and returns
// the reply with the changes it proposed. Only data without personal
// information reaches the model (the tools' output, see
// assistant-settlement.ts) plus what the Administrator typed, with document
// numbers masked.
@Injectable()
export class AssistantConversationService {
  private readonly log: LogSink;

  constructor(
    @Inject(ASSISTANT_MODEL) private readonly model: AssistantModel | null,
    private readonly tools: AssistantToolsService,
    @Optional() @Inject(ASSISTANT_LOG_SINK) log?: LogSink,
  ) {
    this.log = log ?? stdout;
  }

  async reply(
    municipalityId: number,
    input: AssistantMessageInput,
    requestId: string,
    deadlineMs: number = MESSAGE_DEADLINE_MS,
  ): Promise<AssistantReply> {
    const startedAt = Date.now();
    const toolsCalled: string[] = [];
    const tokens = { inputTokens: 0, outputTokens: 0 };
    let result: string = 'OK';
    try {
      if (!this.model) throw unavailable('NOT_CONFIGURED');
      return await this.converse(
        this.model,
        municipalityId,
        input,
        deadlineMs,
        toolsCalled,
        tokens,
      );
    } catch (error) {
      const response =
        error instanceof HttpException ? error.getResponse() : undefined;
      result =
        typeof response === 'object' && response && 'code' in response
          ? String(response.code)
          : ErrorCode.INTERNAL_ERROR;
      throw error;
    } finally {
      // One line per message. Never the conversation's text nor the tools'
      // arguments: only names, counts and timing.
      this.log(
        JSON.stringify({
          time: new Date().toISOString(),
          event: 'assistant.message',
          requestId,
          provider: this.model?.provider ?? null,
          model: this.model?.model ?? null,
          tools: toolsCalled,
          durationMs: Date.now() - startedAt,
          result,
          ...tokens,
        }),
      );
    }
  }

  private async converse(
    model: AssistantModel,
    municipalityId: number,
    input: AssistantMessageInput,
    deadlineMs: number,
    toolsCalled: string[],
    tokens: { inputTokens: number; outputTokens: number },
  ): Promise<AssistantReply> {
    const rows = input.context?.paymentOrderRows;
    const messages: ModelMessage[] = (input.history ?? []).map((turn) =>
      turn.role === 'user'
        ? { role: 'user', text: maskDocuments(turn.content) }
        : {
            role: 'assistant',
            text: maskDocuments(turn.content),
            toolCalls: [],
          },
    );
    const message = maskDocuments(input.message);
    messages.push({
      role: 'user',
      text: rows
        ? `${paymentOrderFileNote(rows.length)}\n\n${message}`
        : message,
    });

    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), deadlineMs);
    let proposals: AssistantProposals | null = null;
    try {
      for (;;) {
        const response = await model
          .respond({
            system: ASSISTANT_SYSTEM_PROMPT,
            tools: ASSISTANT_TOOLS,
            messages,
            signal: deadline.signal,
          })
          .catch((error: unknown) => {
            throw deadline.signal.aborted
              ? new DeadlineExceeded()
              : new ModelFailed(String(error));
          });
        tokens.inputTokens += response.usage.inputTokens;
        tokens.outputTokens += response.usage.outputTokens;

        if (response.refused) return { reply: REFUSED_REPLY, proposals: null };
        if (response.toolCalls.length === 0) {
          return { reply: response.text, proposals };
        }
        if (
          toolsCalled.length + response.toolCalls.length >
          MAX_TOOL_CALLS_PER_MESSAGE
        ) {
          throw tooManyToolCalls();
        }

        messages.push({
          role: 'assistant',
          text: response.text,
          toolCalls: response.toolCalls,
          raw: response.raw,
        });
        const results: ModelToolResult[] = [];
        for (const call of response.toolCalls) {
          toolsCalled.push(call.name);
          const outcome = await this.runTool(municipalityId, call, rows);
          if (outcome.proposals) proposals = outcome.proposals;
          results.push({
            callId: call.id,
            content: JSON.stringify(outcome.content),
            isError: outcome.isError,
          });
        }
        if (deadline.signal.aborted) throw new DeadlineExceeded();
        messages.push({ role: 'tool', results });
      }
    } catch (error) {
      if (error instanceof DeadlineExceeded) throw unavailable('TIMEOUT');
      if (error instanceof ModelFailed) throw unavailable('FAILED');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // Runs one tool call for the active municipality. A rejected input goes
  // back to the model as an error result, so it can correct itself.
  private async runTool(
    municipalityId: number,
    call: ModelToolCall,
    rows: PaymentOrderFileRow[] | undefined,
  ): Promise<{
    content: unknown;
    isError: boolean;
    proposals?: AssistantProposals;
  }> {
    try {
      switch (call.name) {
        case SEARCH_SETTLEMENTS: {
          const cadastralCode = call.input.cadastralCode;
          return {
            content: await this.tools.searchSettlements(municipalityId, {
              cadastralCode:
                typeof cadastralCode === 'string' ? cadastralCode : undefined,
              settlementId:
                call.input.settlementId === undefined
                  ? undefined
                  : (asId(call.input.settlementId) ?? -1),
            }),
            isError: false,
          };
        }
        case FIND_UNLISTED_PERIODS:
          if (!rows) {
            return {
              content: {
                error: 'NO_PAYMENT_ORDER_FILE',
                message:
                  'There is no payment orders Excel in this conversation. Ask the Administrator to load it from Mandamientos.',
              },
              isError: true,
            };
          }
          return {
            content: await this.tools.findUnlistedPeriods(municipalityId, rows),
            isError: false,
          };
        case PROPOSE_STATUS_CHANGE: {
          const changes = (
            Array.isArray(call.input.changes) ? call.input.changes : []
          ).map((change: Record<string, unknown>) => ({
            settlementId: asId(change?.settlementId) ?? -1,
            toStatus: change?.toStatus as SettlementStatus,
          })) as StatusChangeRequest[];
          if (
            changes.some(
              ({ toStatus }) =>
                !Object.values(SettlementStatus).includes(toStatus),
            )
          ) {
            return {
              content: {
                error: ErrorCode.ASSISTANT_TOOL_INPUT_INVALID,
                message: `toStatus must be one of: ${Object.values(SettlementStatus).join(', ')}.`,
              },
              isError: true,
            };
          }
          const review = await this.tools.proposeStatusChange(
            municipalityId,
            changes,
          );
          const note =
            typeof call.input.note === 'string'
              ? call.input.note.trim().slice(0, 500)
              : '';
          return {
            content: review,
            isError: false,
            proposals: { ...review, ...(note ? { note } : {}) },
          };
        }
        default:
          return {
            content: {
              error: 'UNKNOWN_TOOL',
              message: `No tool ${call.name}.`,
            },
            isError: true,
          };
      }
    } catch (error) {
      if (error instanceof HttpException) {
        return { content: error.getResponse(), isError: true };
      }
      throw error;
    }
  }
}
