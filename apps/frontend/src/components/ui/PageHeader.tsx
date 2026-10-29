import type { ReactNode } from "react";
import "./PageHeader.css";

interface PageHeaderProps {
  // Usually text; a screen may put an editable title in its place.
  title: ReactNode;
  subtitle?: string;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <header className="ui-page-header">
      <h1 className="ui-page-header__title">{title}</h1>
      {subtitle && <p className="ui-page-header__subtitle">{subtitle}</p>}
      {children}
    </header>
  );
}
