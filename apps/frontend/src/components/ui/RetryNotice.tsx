import type { ReactNode } from "react";
import { Button } from "./Button";
import { Notice } from "./Notice";
import "./RetryNotice.css";

interface RetryNoticeProps {
  onRetry: () => void;
  children: ReactNode;
}

// An error that can go away by trying again.
export function RetryNotice({ onRetry, children }: RetryNoticeProps) {
  return (
    <Notice className="ui-retry-notice">
      {children}
      <Button type="button" variant="secondary" onClick={onRetry}>
        Reintentar
      </Button>
    </Notice>
  );
}
