import type { ReactNode } from "react";
import "./Notice.css";

type NoticeVariant = "error" | "success" | "info";

interface NoticeProps {
  variant?: NoticeVariant;
  className?: string;
  children: ReactNode;
}

export function Notice({
  variant = "error",
  className,
  children,
}: NoticeProps) {
  return (
    <div
      className={["ui-notice", `ui-notice--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
      role={variant === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
