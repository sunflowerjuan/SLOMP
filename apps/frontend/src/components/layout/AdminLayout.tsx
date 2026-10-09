import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { useSlidingIndicator } from "../../hooks/useSlidingIndicator";
import "./AdminLayout.css";

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
}

// Entry of the account menu that opens from the logo.
export interface AdminMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

interface AdminLayoutProps {
  items: AdminNavItem[];
  activeId: string;
  menuItems: AdminMenuItem[];
  children: ReactNode;
}

export function AdminLayout({
  items,
  activeId,
  menuItems,
  children,
}: AdminLayoutProps) {
  const mainRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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

  // The logo opens the account menu; Escape or a tap elsewhere closes it.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape")
        return;
      if (
        event.type === "pointerdown" &&
        brandRef.current?.contains(event.target as Node)
      )
        return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  // Arrow keys walk the menu items (wrapping), as role="menu" promises.
  function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const entries = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
    const next = entries.indexOf(document.activeElement as HTMLElement) + step;
    entries.at(next % entries.length)?.focus();
  }

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
        <div ref={brandRef} className="admin-layout__brandbar">
          <button
            type="button"
            className="admin-layout__brand-button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Menú de cuenta"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="admin-layout__mark" aria-hidden="true">
              <Icon box={24}>
                <path d="M6 3h8l4 4v14H6z" />
                <path d="M14 3v4h4" />
                <circle cx="12" cy="14" r="2.6" />
                <path d="M10.6 16.4L10 20l2-1 2 1-.6-3.6" />
              </Icon>
            </span>
            <span className="admin-layout__brand">SLOMP</span>
          </button>
          {menuOpen && (
            <div
              className="admin-layout__menu"
              role="menu"
              aria-label="Cuenta"
              onKeyDown={moveFocus}
            >
              {menuItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className="admin-layout__menu-item"
                  autoFocus={index === 0}
                  onClick={() => {
                    setMenuOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}
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
      </aside>
      <main ref={mainRef} className="admin-layout__main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
