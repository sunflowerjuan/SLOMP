import { useId } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import "./Card.css";

interface CardProps {
  title: string;
  subtitle?: string;
  className?: string;
  action?: ReactNode;
  // Pass `onToggle` to make the card collapsible: the title becomes the
  // toggle and `open` says whether the content is showing.
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}

export function Card({
  title,
  subtitle,
  className,
  action,
  open = true,
  onToggle,
  children,
}: CardProps) {
  const titleId = useId();
  const bodyId = useId();
  const collapsible = onToggle !== undefined;

  return (
    <section
      className={["ui-card", collapsible && "ui-card--collapsible", className]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={titleId}
      data-open={collapsible ? open : undefined}
    >
      <div className="ui-card__header">
        <div className="ui-card__heading">
          <h2 className="ui-card__title" id={titleId}>
            {collapsible ? (
              <button
                type="button"
                className="ui-card__toggle"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={onToggle}
              >
                {title}
                <Icon>
                  <path d="M4 6l4 4 4-4" />
                </Icon>
              </button>
            ) : (
              title
            )}
          </h2>
          {action}
        </div>
        {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
      </div>
      {collapsible ? (
        <div id={bodyId} className="ui-card__body" inert={!open}>
          <div className="ui-card__body-inner">{children}</div>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
