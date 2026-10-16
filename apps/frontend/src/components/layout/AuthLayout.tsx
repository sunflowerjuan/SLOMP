import type { ReactNode } from "react";
import "./AuthLayout.css";

interface AuthLayoutProps {
  title: string;
  children: ReactNode;
  // Bottom of the card, under a divider: a secondary link or action.
  footer?: ReactNode;
}

// Screens outside the panel (login, mandatory password change): the
// institutional band and a single card, stacked on mobile. Forms inside use
// the `auth-layout__form` class for their spacing.
export function AuthLayout({
  title,
  children,
  footer,
}: Readonly<AuthLayoutProps>) {
  return (
    <div className="auth-layout">
      <aside className="auth-layout__institutional">
        <div className="auth-layout__grid" aria-hidden="true" />
        <div className="auth-layout__brand">
          <span className="auth-layout__brand-tag">SLOMP</span>
          <span className="auth-layout__brand-name">Tributaria Predial</span>
        </div>
      </aside>

      <main className="auth-layout__content">
        <div className="auth-layout__card">
          <h1 className="auth-layout__title">{title}</h1>
          {children}
          {footer && <p className="auth-layout__footer">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
