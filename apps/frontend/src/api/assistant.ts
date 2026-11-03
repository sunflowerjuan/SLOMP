import type { SettlementStatus } from "../domain/settlementStatus";
import { request } from "./httpClient";
import { municipalityPath } from "./municipality";

// Slompsim, the assistant of the panel (SL-154, SL-155; design in Confluence
// "Diseño de Slompsim"). Only confirmStatusChanges changes anything, and it
// sends the exact list of a proposal the Administrator applied, never text
// from the model.

// One settlement as Slompsim sees it: no names, documents or addresses.
export interface AssistantSettlement {
  id: number;
  cadastralCode: string;
  period: number;
  status: SettlementStatus;
  allowedStatuses: SettlementStatus[];
  hasPaymentOrder: boolean;
  resolutionNumber: string | null;
}

export interface StatusChangeRequest {
  settlementId: number;
  toStatus: SettlementStatus;
}

export interface AcceptedStatusChange {
  settlementId: number;
  cadastralCode: string;
  period: number;
  resolutionNumber: string | null;
  from: SettlementStatus;
  to: SettlementStatus;
}

export interface RejectedStatusChange {
  settlementId: number;
  to: SettlementStatus;
  reason: "TRANSITION_NOT_ALLOWED" | "NOT_FOUND" | "REPLACED";
  // States it may move to now; empty when it can't be changed at all.
  allowed: SettlementStatus[];
  // Absent for NOT_FOUND.
  cadastralCode?: string;
  period?: number;
  current?: SettlementStatus;
  paymentOrder?: { number: string; issuedAt: string };
}

export interface StatusChangeReview {
  // A change to the state it already has is accepted (from === to).
  accepted: AcceptedStatusChange[];
  rejected: RejectedStatusChange[];
}

export interface AssistantProposals extends StatusChangeReview {
  note?: string;
}

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PaymentOrderFileRow {
  cadastralCode: string;
  period: number;
}

export interface AssistantReply {
  reply: string;
  proposals: AssistantProposals | null;
  // What the message searched; the panel lists it below the reply.
  settlements: AssistantSettlement[] | null;
}

interface AssistantMessage {
  message: string;
  history: AssistantTurn[];
  rows: PaymentOrderFileRow[] | null;
}

export function sendAssistantMessage(
  { message, history, rows }: AssistantMessage,
  signal: AbortSignal,
): Promise<AssistantReply> {
  return request(municipalityPath("/assistant/messages"), {
    method: "POST",
    body: {
      message,
      history,
      ...(rows && { context: { paymentOrderRows: rows } }),
    },
    signal,
  });
}

// Checks changes with the domain rules, without the model: the status
// buttons of the chat build their proposal with it. It changes nothing.
export function previewStatusChanges(
  changes: StatusChangeRequest[],
  signal: AbortSignal,
): Promise<StatusChangeReview> {
  return request(municipalityPath("/assistant/changes/preview"), {
    method: "POST",
    body: { changes },
    signal,
  });
}

export interface ConfirmStatusChangesResult {
  applied: AcceptedStatusChange[];
  // Settlements that already had the requested state.
  unchanged: number[];
}

// All or nothing: if any change no longer applies it answers 409
// ASSISTANT_CHANGES_REJECTED, with the rejected ones in `details`.
export function confirmStatusChanges(
  changes: StatusChangeRequest[],
  note?: string,
): Promise<ConfirmStatusChangesResult> {
  return request(municipalityPath("/assistant/changes/confirm"), {
    method: "POST",
    body: { changes, ...(note && { note }) },
  });
}
