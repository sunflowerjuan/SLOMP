import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SlompsimContext } from "./SlompsimContext";
import type { SlompsimContextValue, UnlistedReview } from "./SlompsimContext";
import { useSlompsimConversation } from "./useSlompsimConversation";

interface SlompsimProviderProps {
  // The active municipality: the conversation belongs to it.
  slug: string | null;
  children: ReactNode;
}

// Slompsim stays with the whole panel: it survives moving between sections,
// and goes away with the session, a reload or a change of municipality.
export function SlompsimProvider({ slug, children }: SlompsimProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversationSlug, setConversationSlug] = useState(slug);
  const opener = useRef<HTMLElement | null>(null);
  const conversation = useSlompsimConversation(slug);
  const { dispatch } = conversation;

  if (slug !== conversationSlug) {
    setConversationSlug(slug);
    setIsOpen(false);
    dispatch({ type: "reset" });
  }

  const value = useMemo<SlompsimContextValue>(() => {
    function open() {
      opener.current = document.activeElement as HTMLElement | null;
      setIsOpen(true);
    }
    return {
      isOpen,
      open,
      close: ({ returnFocus } = { returnFocus: true }) => {
        setIsOpen(false);
        if (!returnFocus) return;
        // The control that opened it may be gone: the notice of an answered
        // Excel, a screen left behind.
        const target = opener.current?.isConnected
          ? opener.current
          : document.getElementById("main");
        target?.focus({ preventScroll: true });
      },
      reviewUnlisted: ({ fileName, fileRows, rows }: UnlistedReview) => {
        dispatch({ type: "unlistedOpened", fileName, fileRows, rows });
        open();
      },
      conversation,
    };
  }, [isOpen, dispatch, conversation]);

  return (
    <SlompsimContext.Provider value={value}>
      {children}
    </SlompsimContext.Provider>
  );
}
