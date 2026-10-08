import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useSlidingIndicator } from "../../hooks/useSlidingIndicator";
import "./AdminLayout.css";

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
}

interface AdminLayoutProps {
  items: AdminNavItem[];
  activeId: string;
  onSignOut: () => void;
  children: ReactNode;
}

const SVG_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function AdminLayout({
  items,
  activeId,
  onSignOut,
  children,
}: AdminLayoutProps) {
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const { containerRef, indicatorStyle, dragging, axis, bind } =
    useSlidingIndicator<HTMLElement>(activeIndex, (index) => {
      window.location.hash = items[index].href;
    });

  // Moving to another section is a new "page": start reading from its content.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [activeId]);

  return (
    <div className="admin-layout">
      <button
        type="button"
        className="admin-layout__skip"
        onClick={() => mainRef.current?.focus()}
      >
        Saltar al contenido
      </button>
      <aside className="admin-layout__side">
        <div className="admin-layout__brandbar">
          <div className="admin-layout__mark" aria-hidden="true">
            <svg {...SVG_PROPS}>
              <path d="M6 3h8l4 4v14H6z" />
              <path d="M14 3v4h4" />
              <circle cx="12" cy="14" r="2.6" />
              <path d="M10.6 16.4L10 20l2-1 2 1-.6-3.6" />
            </svg>
          </div>
          <div>
            <span className="admin-layout__brand">SLOMP</span>
            <span className="admin-layout__brand-sub">Municipio de Páez</span>
          </div>
        </div>
        <nav
          ref={containerRef}
          className="admin-layout__nav"
          aria-label="Panel Administrador"
          data-axis={axis}
          data-dragging={dragging || undefined}
          {...bind}
        >
          {indicatorStyle && (
            <span
              className="admin-layout__indicator"
              style={indicatorStyle}
              aria-hidden="true"
            />
          )}
          {items.map((item) => (
            <a
              key={item.id}
              data-slide-item
              className="admin-layout__link"
              href={item.href}
              draggable={false}
              aria-current={item.id === activeId ? "page" : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <button
          type="button"
          className="admin-layout__signout"
          onClick={onSignOut}
        >
          <svg {...SVG_PROPS}>
            <path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" />
          </svg>
          <span>Cerrar sesión</span>
        </button>
      </aside>
      <main ref={mainRef} className="admin-layout__main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
