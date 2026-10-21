import type { HTMLAttributes, ReactNode } from "react";
import { PageHeader } from "./PageHeader";
import "./Screen.css";

interface ScreenProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: string;
  subtitle?: string;
  // Main action, beside the title.
  action?: ReactNode;
  // Search, filters or upload: stays put under the title.
  input?: ReactNode;
  // Makes the three zones inert (a sheet or dialog covers them).
  covered?: boolean;
  // Rendered outside the zones, e.g. a detail sheet.
  overlay?: ReactNode;
  children: ReactNode;
}

// One screen tall: title and input never scroll, only the result does.
export function Screen({
  title,
  subtitle,
  action,
  input,
  covered,
  overlay,
  className,
  children,
  ...rest
}: ScreenProps) {
  return (
    <div
      {...rest}
      className={["page", "ui-screen", className].filter(Boolean).join(" ")}
    >
      <div className="ui-screen__zones" inert={covered}>
        <div className="ui-screen__head">
          <PageHeader title={title} subtitle={subtitle} />
          {action}
        </div>
        {input}
        <div className="ui-screen__body">{children}</div>
      </div>
      {overlay}
    </div>
  );
}
