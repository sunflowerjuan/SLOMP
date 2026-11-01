import { useEffect, useMemo, useReducer, useRef } from "react";
import type { ActionDispatch } from "react";
import {
  ApiError,
  NETWORK_ERROR_STATUS,
  getErrorMessage,
} from "../api/ApiError";
import {
  confirmStatusChanges,
  previewStatusChanges,
  sendAssistantMessage,
} from "../api/assistant";
import type {
  RejectedStatusChange,
  StatusChangeRequest,
} from "../api/assistant";
import { ASSISTANT_OFFLINE_MESSAGE } from "../api/errorMessages";
import { MAX_CHANGES_PER_BATCH, toProposal } from "../domain/slompsim";
import {
  INITIAL_CONVERSATION,
  conversationReducer,
  historyTurns,
  withoutLastMessage,
} from "../domain/slompsimConversation";
import type {
  ConversationAction,
  ConversationEntry,
  ConversationState,
  ProposalEntry,
} from "../domain/slompsimConversation";
import type { SettlementStatus } from "../domain/settlementStatus";

function failureMessage(error: unknown): string {
  return error instanceof ApiError && error.status === NETWORK_ERROR_STATUS
    ? ASSISTANT_OFFLINE_MESSAGE
    : getErrorMessage(error);
}

// What "Reintentar" repeats.
type LastRequest =
  | { kind: "message"; text: string }
  | { kind: "preview"; changes: StatusChangeRequest[] };

function changesOf({ proposal }: ProposalEntry): StatusChangeRequest[] {
  return proposal.changes.map(({ settlementId, to }) => ({
    settlementId,
    toStatus: to,
  }));
}

export interface SlompsimConversation extends ConversationState {
  send: (text: string) => void;
  retry: () => void;
  // Builds a proposal without the model: the chat's status buttons.
  propose: (settlementIds: number[], toStatus: SettlementStatus) => void;
  reviewAgain: (entry: ProposalEntry) => void;
  apply: (entry: ProposalEntry) => void;
  discard: (entry: ProposalEntry) => void;
  reset: () => void;
  dispatch: ActionDispatch<[action: ConversationAction]>;
}

// The conversation with Slompsim: the only part of the panel that talks to
// its endpoints. A change of municipality drops whatever is on its way; the
// provider resets the rest.
export function useSlompsimConversation(
  slug: string | null,
): SlompsimConversation {
  const [state, dispatch] = useReducer(
    conversationReducer,
    INITIAL_CONVERSATION,
  );
  const inFlight = useRef<AbortController | null>(null);
  const lastRequest = useRef<LastRequest | null>(null);

  useEffect(() => () => inFlight.current?.abort(), [slug]);

  return useMemo(() => {
    async function deliver(
      request: LastRequest,
      entries: ConversationEntry[] = state.entries,
    ) {
      lastRequest.current = request;
      const controller = new AbortController();
      inFlight.current = controller;
      const { signal } = controller;
      try {
        if (request.kind === "message") {
          const reply = await sendAssistantMessage(
            {
              message: request.text,
              history: historyTurns(entries),
              rows: state.fileRows,
            },
            signal,
          );
          dispatch({ type: "replied", reply });
        } else {
          const review = await previewStatusChanges(
            request.changes.slice(0, MAX_CHANGES_PER_BATCH),
            signal,
          );
          const leftOut = Math.max(
            request.changes.length - MAX_CHANGES_PER_BATCH,
            0,
          );
          dispatch({
            type: "previewed",
            proposal: toProposal(review, leftOut),
          });
        }
      } catch (error) {
        if (signal.aborted) return;
        dispatch({
          type: "failed",
          message: failureMessage(error),
          // The same request would only fail the same way.
          canRetry:
            !(error instanceof ApiError) ||
            error.code !== "ASSISTANT_TOO_MANY_TOOL_CALLS",
        });
      }
    }

    function preview(changes: StatusChangeRequest[]) {
      dispatch({ type: "waiting" });
      void deliver({ kind: "preview", changes });
    }

    async function confirm(entry: ProposalEntry) {
      const { id, proposal } = entry;
      dispatch({ type: "applying", id });
      try {
        const { applied } = await confirmStatusChanges(
          changesOf(entry),
          proposal.note,
        );
        dispatch({
          type: "applied",
          id,
          applied,
          at: new Date().toISOString(),
        });
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === "ASSISTANT_CHANGES_REJECTED"
        ) {
          dispatch({
            type: "conflict",
            id,
            rejected: (error.details.rejected ?? []) as RejectedStatusChange[],
            message: getErrorMessage(error),
          });
        } else {
          // All or nothing and repeatable, so "Aplicar" stays.
          dispatch({
            type: "applyFailed",
            id,
            message: getErrorMessage(error),
          });
        }
      }
    }

    return {
      ...state,
      send: (text) => {
        dispatch({ type: "sent", text });
        void deliver({ kind: "message", text });
      },
      retry: () => {
        const request = lastRequest.current;
        if (!request) return;
        dispatch({ type: "waiting" });
        void deliver(
          request,
          request.kind === "message"
            ? withoutLastMessage(state.entries)
            : state.entries,
        );
      },
      propose: (settlementIds, toStatus) =>
        preview(
          settlementIds.map((settlementId) => ({ settlementId, toStatus })),
        ),
      reviewAgain: (entry) => preview(changesOf(entry)),
      apply: (entry) => void confirm(entry),
      discard: ({ id }) => dispatch({ type: "discarded", id }),
      reset: () => {
        inFlight.current?.abort();
        dispatch({ type: "reset" });
      },
      dispatch,
    };
  }, [state]);
}
