import { useId } from "react";
import type { ReactNode } from "react";
import "./Card.css";

interface CardProps {
  title: string;
  subtitle?: string;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Card({
  title,
  subtitle,
  className,
  action,
  children,
}: CardProps) {
  const titleId = useId();

  return (
    <section
      className={["ui-card", className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
    >
      <div className="ui-card__header">
        <div className="ui-card__heading">
          <h2 className="ui-card__title" id={titleId}>
            {title}
          </h2>
          {action}
        </div>
        {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
