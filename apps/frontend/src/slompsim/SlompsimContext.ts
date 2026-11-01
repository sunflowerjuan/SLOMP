import { createContext } from "react";
import type {
  AssistantSettlement,
  PaymentOrderFileRow,
} from "../api/assistant";
import type { SlompsimConversation } from "./useSlompsimConversation";

export const SLOMPSIM_PANEL_ID = "slompsim";

export interface UnlistedReview {
  fileName: string;
  fileRows: PaymentOrderFileRow[];
  rows: AssistantSettlement[];
}

export interface SlompsimContextValue {
  isOpen: boolean;
  open: () => void;
  // `returnFocus`: back to the control that opened it (the X and Escape).
  close: (options?: { returnFocus: boolean }) => void;
  // Opens the chat on the periods the payment orders Excel left out.
  reviewUnlisted: (review: UnlistedReview) => void;
  conversation: SlompsimConversation;
}

export const SlompsimContext = createContext<SlompsimContextValue | null>(null);
