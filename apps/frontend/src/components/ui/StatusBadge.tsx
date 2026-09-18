import type { ReactNode } from "react";
import "./StatusBadge.css";

type StatusBadgeVariant = "success" | "warning" | "danger" | "neutral";

interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  children: ReactNode;
}

export function StatusBadge({ variant, children }: StatusBadgeProps) {
  return (
    <span className={`ui-status-badge ui-status-badge--${variant}`}>
      {children}
    </span>
  );
}
