import type { ReactNode } from "react";
import { Button } from "../ui/Button";
import "./AdminLayout.css";

export interface AdminNavItem {
  id: string;
  label: string;
}

interface AdminLayoutProps {
  items: AdminNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  onSignOut: () => void;
  children: ReactNode;
}

export function AdminLayout({
  items,
  activeId,
  onNavigate,
  onSignOut,
  children,
}: AdminLayoutProps) {
  return (
    <div className="admin-layout">
      <header className="admin-layout__bar">
        <span className="admin-layout__brand">SLOMP</span>
        <nav className="admin-layout__nav" aria-label="Panel Administrador">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.id === activeId
                  ? "admin-layout__link admin-layout__link--active"
                  : "admin-layout__link"
              }
              aria-current={item.id === activeId ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <Button variant="secondary" onClick={onSignOut}>
          Cerrar sesión
        </Button>
      </header>
      <div className="admin-layout__content">{children}</div>
    </div>
  );
}
