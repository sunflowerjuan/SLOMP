import type {
  AcceptedStatusChange,
  AssistantReply,
  AssistantSettlement,
  AssistantTurn,
  PaymentOrderFileRow,
  RejectedStatusChange,
} from "../api/assistant";
import { toProposal, unlistedScope } from "./slompsim";
import type { Proposal } from "./slompsim";

// One Slompsim conversation in the panel. It is never saved: it lives in
// memory until the session ends, the page reloads, the municipality changes
// or the Administrator starts a new one (section 3 of the design). Pure.

const MAX_HISTORY_TURNS = 10;
const MAX_TURN_LENGTH = 8000;

export type ProposalStage =
  | { name: "open"; error?: string }
  | { name: "applying" }
  | { name: "applied"; applied: AcceptedStatusChange[]; at: string }
  | { name: "discarded" }
  | { name: "replaced" }
  // Some change no longer applied when confirming: nothing was applied.
  | { name: "conflict"; rejected: RejectedStatusChange[]; message: string };

interface EntryBase {
  id: number;
}

export interface ProposalEntry extends EntryBase {
  kind: "proposal";
  proposal: Proposal;
  stage: ProposalStage;
}

export interface UnlistedEntry extends EntryBase {
  kind: "unlisted";
  fileName: string;
  rows: AssistantSettlement[];
  // false once its periods were answered: only the last one asks.
  asking: boolean;
  // A later message about what is left of the same file.
  continued: boolean;
}

export type ConversationEntry =
  | (EntryBase & { kind: "user"; text: string })
  | (EntryBase & {
      kind: "assistant";
      text: string;
      settlements: AssistantSettlement[];
    })
  | ProposalEntry
  | UnlistedEntry
  | (EntryBase & { kind: "failure"; message: string; canRetry: boolean });

export interface ConversationState {
  entries: ConversationEntry[];
  nextId: number;
  // A reply or a preview is on its way.
  waiting: boolean;
  // The Excel the conversation was opened with: travels as `context`.
  fileRows: PaymentOrderFileRow[] | null;
  // Settlements this conversation is done with, for the screens behind it:
  // the ones it applied, and the ones already in the state it applied.
  appliedIds: number[];
}

export const INITIAL_CONVERSATION: ConversationState = {
  entries: [],
  nextId: 1,
  waiting: false,
  fileRows: null,
  appliedIds: [],
};

export type ConversationAction =
  | { type: "sent"; text: string }
  | { type: "waiting" }
  | { type: "replied"; reply: AssistantReply }
  | { type: "previewed"; proposal: Proposal }
  | { type: "failed"; message: string; canRetry: boolean }
  | { type: "discarded"; id: number }
  | { type: "applying"; id: number }
  | { type: "applied"; id: number; applied: AcceptedStatusChange[]; at: string }
  | { type: "applyFailed"; id: number; message: string }
  | {
      type: "conflict";
      id: number;
      rejected: RejectedStatusChange[];
      message: string;
    }
  | {
      type: "unlistedOpened";
      fileName: string;
      fileRows: PaymentOrderFileRow[];
      rows: AssistantSettlement[];
    }
  | { type: "reset" };

type WithoutId<Entry> = Entry extends unknown ? Omit<Entry, "id"> : never;
type NewEntry = WithoutId<ConversationEntry>;

function appendEntries(
  state: ConversationState,
  added: NewEntry[],
): ConversationState {
  return {
    ...state,
    entries: [
      ...state.entries,
      ...added.map(
        (entry, index) =>
          ({ ...entry, id: state.nextId + index }) as ConversationEntry,
      ),
    ],
    nextId: state.nextId + added.length,
  };
}

function setStage(
  entries: ConversationEntry[],
  id: number,
  stage: ProposalStage,
): ConversationEntry[] {
  return entries.map((entry) =>
    entry.id === id && entry.kind === "proposal" ? { ...entry, stage } : entry,
  );
}

// Only the last proposal can be applied.
function replaceOpenProposals(
  entries: ConversationEntry[],
): ConversationEntry[] {
  return entries.map((entry) =>
    entry.kind === "proposal" && entry.stage.name === "open"
      ? { ...entry, stage: { name: "replaced" } }
      : entry,
  );
}

function withoutFailures(entries: ConversationEntry[]): ConversationEntry[] {
  return entries.filter((entry) => entry.kind !== "failure");
}

function addProposal(
  state: ConversationState,
  proposal: Proposal,
): ConversationState {
  return appendEntries(
    { ...state, entries: replaceOpenProposals(state.entries) },
    [{ kind: "proposal", proposal, stage: { name: "open" } }],
  );
}

function lastUnlisted(entries: ConversationEntry[]): UnlistedEntry | undefined {
  return entries
    .filter((entry): entry is UnlistedEntry => entry.kind === "unlisted")
    .at(-1);
}

function unchangedIn(
  entries: ConversationEntry[],
  id: number,
): AcceptedStatusChange[] {
  const entry = entries.find((candidate) => candidate.id === id);
  return entry?.kind === "proposal" ? entry.proposal.unchanged : [];
}

// Once a proposal answered some periods of the file, the question closes and
// what is left is asked again, at the end of the conversation.
function settleUnlisted(
  state: ConversationState,
  settled: AcceptedStatusChange[],
): ConversationState {
  const asked = lastUnlisted(state.entries);
  const ids = new Set(settled.map(({ settlementId }) => settlementId));
  if (!asked?.asking || !asked.rows.some(({ id }) => ids.has(id))) return state;

  const rows = asked.rows.filter(({ id }) => !ids.has(id));
  const closed = {
    ...state,
    entries: state.entries.map((entry) =>
      entry.id === asked.id ? { ...asked, asking: false } : entry,
    ),
  };
  return rows.length === 0
    ? closed
    : appendEntries(closed, [
        { ...asked, kind: "unlisted", rows, asking: true, continued: true },
      ]);
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case "sent":
      return appendEntries(
        { ...state, entries: withoutFailures(state.entries), waiting: true },
        [{ kind: "user", text: action.text }],
      );
    case "waiting":
      return {
        ...state,
        entries: withoutFailures(state.entries),
        waiting: true,
      };
    case "replied": {
      const { reply, proposals, settlements } = action.reply;
      const answered = { ...state, waiting: false };
      const withText =
        reply || settlements?.length
          ? appendEntries(answered, [
              {
                kind: "assistant",
                text: reply,
                settlements: settlements ?? [],
              },
            ])
          : answered;
      return proposals
        ? addProposal(withText, toProposal(proposals))
        : withText;
    }
    case "previewed":
      return addProposal({ ...state, waiting: false }, action.proposal);
    case "failed":
      return appendEntries({ ...state, waiting: false }, [
        {
          kind: "failure",
          message: action.message,
          canRetry: action.canRetry,
        },
      ]);
    case "discarded":
      return {
        ...state,
        entries: setStage(state.entries, action.id, { name: "discarded" }),
      };
    case "applying":
      return {
        ...state,
        entries: setStage(state.entries, action.id, { name: "applying" }),
      };
    case "applied": {
      const settled = [
        ...action.applied,
        ...unchangedIn(state.entries, action.id),
      ];
      return settleUnlisted(
        {
          ...state,
          entries: setStage(state.entries, action.id, {
            name: "applied",
            applied: action.applied,
            at: action.at,
          }),
          appliedIds: [
            ...state.appliedIds,
            ...settled.map(({ settlementId }) => settlementId),
          ],
        },
        settled,
      );
    }
    case "applyFailed":
      return {
        ...state,
        entries: setStage(state.entries, action.id, {
          name: "open",
          error: action.message,
        }),
      };
    case "conflict":
      return {
        ...state,
        entries: setStage(state.entries, action.id, {
          name: "conflict",
          rejected: action.rejected,
          message: action.message,
        }),
      };
    case "unlistedOpened": {
      const last = state.entries.at(-1);
      const withFile = { ...state, fileRows: action.fileRows };
      // The same notice pressed again: the question is already there.
      if (last?.kind === "unlisted" && last.fileName === action.fileName) {
        return withFile;
      }
      return appendEntries(withFile, [
        {
          kind: "unlisted",
          fileName: action.fileName,
          rows: action.rows,
          asking: true,
          continued: false,
        },
      ]);
    }
    case "reset":
      return INITIAL_CONVERSATION;
  }
}

// What the panel said in place of the model, as the model reads it later.
function unlistedTurn(rows: AssistantSettlement[]): string {
  const { periods, properties } = unlistedScope(rows);
  return `En el Excel faltan ${periods} de ${properties} que sí aparecen en este archivo. ¿A qué estado los paso?`;
}

// The last turns of the conversation, the only memory the model has.
export function historyTurns(entries: ConversationEntry[]): AssistantTurn[] {
  const turns = entries.flatMap((entry): AssistantTurn[] => {
    if (entry.kind === "user") return [{ role: "user", content: entry.text }];
    if (entry.kind === "assistant" && entry.text) {
      return [
        { role: "assistant", content: entry.text.slice(0, MAX_TURN_LENGTH) },
      ];
    }
    if (entry.kind === "unlisted") {
      return [{ role: "assistant", content: unlistedTurn(entry.rows) }];
    }
    return [];
  });
  return turns.slice(-MAX_HISTORY_TURNS);
}

// The conversation before its last message, the one a retry sends again.
export function withoutLastMessage(
  entries: ConversationEntry[],
): ConversationEntry[] {
  const lastUser = entries.map(({ kind }) => kind).lastIndexOf("user");
  return lastUser === -1 ? entries : entries.slice(0, lastUser);
}

export function isApplying(entries: ConversationEntry[]): boolean {
  return entries.some(
    (entry) => entry.kind === "proposal" && entry.stage.name === "applying",
  );
}
