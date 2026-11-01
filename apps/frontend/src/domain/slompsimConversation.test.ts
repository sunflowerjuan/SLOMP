import { describe, expect, it } from "vitest";
import type {
  AcceptedStatusChange,
  AssistantReply,
  AssistantSettlement,
} from "../api/assistant";
import { toProposal } from "./slompsim";
import {
  INITIAL_CONVERSATION,
  conversationReducer,
  historyTurns,
  isApplying,
  withoutLastMessage,
} from "./slompsimConversation";
import type {
  ConversationAction,
  ConversationState,
  ProposalEntry,
  UnlistedEntry,
} from "./slompsimConversation";

function run(
  actions: ConversationAction[],
  from: ConversationState = INITIAL_CONVERSATION,
): ConversationState {
  return actions.reduce(conversationReducer, from);
}

function change(settlementId: number): AcceptedStatusChange {
  return {
    settlementId,
    cadastralCode: "010000040021000",
    period: 2020,
    resolutionNumber: null,
    from: "EN_FIRME",
    to: "PAGADA",
  };
}

function reply(overrides: Partial<AssistantReply> = {}): AssistantReply {
  return { reply: "", proposals: null, settlements: null, ...overrides };
}

function proposalReply(...ids: number[]): ConversationAction {
  return {
    type: "replied",
    reply: reply({
      reply: "Revísalo y aplícalo.",
      proposals: { accepted: ids.map(change), rejected: [] },
    }),
  };
}

function settlement(id: number): AssistantSettlement {
  return {
    id,
    cadastralCode: "010000040021000",
    period: 2000 + id,
    status: "EN_FIRME",
    allowedStatuses: ["EN_FIRME", "PAGADA", "PRESCRITA"],
    hasPaymentOrder: false,
    resolutionNumber: null,
  };
}

const opened = (...ids: number[]): ConversationAction => ({
  type: "unlistedOpened",
  fileName: "mandamientos.xlsx",
  fileRows: [{ cadastralCode: "010000040021000", period: 2019 }],
  rows: ids.map(settlement),
});

function proposals({ entries }: ConversationState): ProposalEntry[] {
  return entries.filter(
    (entry): entry is ProposalEntry => entry.kind === "proposal",
  );
}

function questions({ entries }: ConversationState): UnlistedEntry[] {
  return entries.filter(
    (entry): entry is UnlistedEntry => entry.kind === "unlisted",
  );
}

describe("conversationReducer", () => {
  it("adds the message, waits, and adds the answer", () => {
    const sent = run([{ type: "sent", text: "¿Qué estados hay?" }]);
    expect(sent.waiting).toBe(true);

    const answered = run(
      [{ type: "replied", reply: reply({ reply: "Hay cinco." }) }],
      sent,
    );
    expect(answered.waiting).toBe(false);
    expect(answered.entries.map(({ kind }) => kind)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("gives every entry its own id", () => {
    const { entries } = run([
      { type: "sent", text: "Marca la 1" },
      proposalReply(1),
    ]);
    expect(new Set(entries.map(({ id }) => id)).size).toBe(entries.length);
  });

  it("shows a search that found settlements even with no text", () => {
    const { entries } = run([
      {
        type: "replied",
        reply: reply({ settlements: [settlement(1)] }),
      },
    ]);
    expect(entries).toMatchObject([
      { kind: "assistant", text: "", settlements: [{ id: 1 }] },
    ]);
  });

  it("keeps only the last proposal open", () => {
    const state = run([proposalReply(1), proposalReply(2)]);
    expect(proposals(state).map(({ stage }) => stage.name)).toEqual([
      "replaced",
      "open",
    ]);
  });

  it("doesn't touch a proposal already applied when a new one arrives", () => {
    const first = run([proposalReply(1)]);
    const [{ id }] = proposals(first);
    const state = run(
      [
        { type: "applied", id, applied: [change(1)], at: "2026-10-30" },
        proposalReply(2),
      ],
      first,
    );
    expect(proposals(state).map(({ stage }) => stage.name)).toEqual([
      "applied",
      "open",
    ]);
  });

  it("goes through applying to applied and remembers what changed", () => {
    const first = run([proposalReply(1, 2)]);
    const [{ id }] = proposals(first);

    const applying = run([{ type: "applying", id }], first);
    expect(isApplying(applying.entries)).toBe(true);

    const applied = run(
      [{ type: "applied", id, applied: [change(1)], at: "2026-10-30" }],
      applying,
    );
    expect(isApplying(applied.entries)).toBe(false);
    expect(applied.appliedIds).toEqual([1]);
  });

  it("goes back to open when applying fails, so it can be tried again", () => {
    const first = run([proposalReply(1)]);
    const [{ id }] = proposals(first);
    const state = run(
      [
        { type: "applying", id },
        { type: "applyFailed", id, message: "Sin conexión." },
      ],
      first,
    );
    expect(proposals(state)[0].stage).toEqual({
      name: "open",
      error: "Sin conexión.",
    });
  });

  it("keeps what was rejected when something changed before applying", () => {
    const first = run([proposalReply(1)]);
    const [{ id }] = proposals(first);
    const rejected = [
      {
        settlementId: 1,
        to: "PAGADA" as const,
        reason: "REPLACED" as const,
        allowed: [],
      },
    ];
    const state = run(
      [{ type: "conflict", id, rejected, message: "No se aplicó." }],
      first,
    );
    expect(proposals(state)[0].stage).toEqual({
      name: "conflict",
      rejected,
      message: "No se aplicó.",
    });
  });

  it("clears a failure when something else is tried", () => {
    const failed = run([
      { type: "sent", text: "Hola" },
      { type: "failed", message: "No responde.", canRetry: true },
    ]);
    expect(failed.waiting).toBe(false);

    for (const action of [
      { type: "waiting" },
      { type: "sent", text: "Otra vez" },
    ] as ConversationAction[]) {
      const { entries } = run([action], failed);
      expect(entries.some(({ kind }) => kind === "failure")).toBe(false);
    }
  });

  it("opens from the Excel with its rows as context, only once for the same file", () => {
    const state = run([opened(1, 2), opened(1, 2)]);
    expect(questions(state)).toHaveLength(1);
    expect(state.fileRows).toHaveLength(1);
  });

  it("asks again only about what a proposal left of the file", () => {
    const first = run([opened(1, 2, 3), proposalReply(1, 2)]);
    const [{ id }] = proposals(first);
    const state = run(
      [
        {
          type: "applied",
          id,
          applied: [change(1), change(2)],
          at: "2026-10-30",
        },
      ],
      first,
    );

    expect(
      questions(state).map(({ asking, continued, rows }) => ({
        asking,
        continued,
        ids: rows.map((row) => row.id),
      })),
    ).toEqual([
      { asking: false, continued: false, ids: [1, 2, 3] },
      { asking: true, continued: true, ids: [3] },
    ]);
  });

  it("doesn't ask again about a period already in the state it applied", () => {
    const first = run([
      opened(1, 2),
      {
        type: "replied",
        reply: reply({
          proposals: {
            accepted: [change(1), { ...change(2), from: "PAGADA" }],
            rejected: [],
          },
        }),
      },
    ]);
    const [{ id }] = proposals(first);
    const state = run(
      [{ type: "applied", id, applied: [change(1)], at: "2026-10-30" }],
      first,
    );

    expect(questions(state).map(({ asking }) => asking)).toEqual([false]);
    expect(state.appliedIds).toEqual([1, 2]);
  });

  it("stops asking once every period of the file was answered", () => {
    const first = run([opened(1), proposalReply(1)]);
    const [{ id }] = proposals(first);
    const state = run(
      [{ type: "applied", id, applied: [change(1)], at: "2026-10-30" }],
      first,
    );
    expect(questions(state).map(({ asking }) => asking)).toEqual([false]);
  });

  it("leaves the question open when the changes were about other periods", () => {
    const first = run([opened(1), proposalReply(9)]);
    const [{ id }] = proposals(first);
    const state = run(
      [{ type: "applied", id, applied: [change(9)], at: "2026-10-30" }],
      first,
    );
    expect(questions(state).map(({ asking }) => asking)).toEqual([true]);
  });

  it("forgets everything on reset", () => {
    const state = run([opened(1), { type: "reset" }]);
    expect(state).toEqual(INITIAL_CONVERSATION);
  });
});

describe("historyTurns", () => {
  it("sends what was said, with the panel's question, and no cards", () => {
    const { entries } = run([
      opened(1, 2),
      { type: "sent", text: "Pásalos a pagada" },
      proposalReply(1, 2),
    ]);

    expect(historyTurns(entries)).toEqual([
      {
        role: "assistant",
        content:
          "En el Excel faltan 2 periodos de 1 predio que sí aparecen en este archivo. ¿A qué estado los paso?",
      },
      { role: "user", content: "Pásalos a pagada" },
      { role: "assistant", content: "Revísalo y aplícalo." },
    ]);
  });

  it("keeps the last 10 turns", () => {
    const actions = Array.from(
      { length: 12 },
      (_, index): ConversationAction => ({
        type: "sent",
        text: `Mensaje ${index}`,
      }),
    );

    const turns = historyTurns(run(actions).entries);

    expect(turns).toHaveLength(10);
    expect(turns.at(-1)?.content).toBe("Mensaje 11");
  });

  it("cuts a turn longer than the endpoint accepts", () => {
    const { entries } = run([
      { type: "replied", reply: reply({ reply: "a".repeat(9000) }) },
    ]);
    expect(historyTurns(entries)[0].content).toHaveLength(8000);
  });

  it("leaves out the message a retry sends again", () => {
    const { entries } = run([
      { type: "sent", text: "Primero" },
      { type: "replied", reply: reply({ reply: "Listo." }) },
      { type: "sent", text: "Segundo" },
      { type: "failed", message: "No responde.", canRetry: true },
    ]);

    expect(historyTurns(withoutLastMessage(entries))).toEqual([
      { role: "user", content: "Primero" },
      { role: "assistant", content: "Listo." },
    ]);
  });
});

describe("toProposal in a conversation", () => {
  it("is what a status button adds, with what didn't fit in the batch", () => {
    const state = run([
      {
        type: "previewed",
        proposal: toProposal({ accepted: [change(1)], rejected: [] }, 20),
      },
    ]);
    expect(proposals(state)[0].proposal.leftOut).toBe(20);
    expect(state.waiting).toBe(false);
  });
});
