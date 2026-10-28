import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSlidingIndicator } from "../../hooks/useSlidingIndicator";
import { focusMenuEntry, moveMenuFocus } from "./menuFocus";
import type { MunicipalitySwitch } from "./MunicipalityOptions";
import { MunicipalitySwitcher } from "./MunicipalitySwitcher";
import "./AdminLayout.css";

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
}

// Entries that go together under a title. The title is not a link and takes
// no focus; on a phone a divider shows it (SL-170).
export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
  // On a phone its links show only their icon, so the daily work keeps its
  // words whole in the bar; the name stays for screen readers.
  iconsOnPhone?: boolean;
}

// Account action (sign out, ...). On a phone they open from the logo; on
// desktop they sit at the foot of the sidebar.
export interface AdminMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

interface AdminLayoutProps {
  groups: AdminNavGroup[];
  activeId: string;
  menuItems: AdminMenuItem[];
  // Active municipality and how to change it: the pill of the top bar.
  switcher?: MunicipalitySwitch;
  children: ReactNode;
}

export function AdminLayout({
  groups,
  activeId,
  menuItems,
  switcher,
  children,
}: AdminLayoutProps) {
  const mainRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const brandButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isFirstRender = useRef(true);
  const isCompact = useMediaQuery("(max-width: 900px)");
  const items = groups.flatMap((group) => group.items);
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const { containerRef, indicatorStyle, dragging, axis, bind } =
    useSlidingIndicator<HTMLElement>(activeIndex, (index) => {
      window.location.hash = items[index].href;
    });
  const activeSlug = switcher?.activeSlug;

  // Moving to another section or municipality is a new "page": start reading
  // from its content.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [activeId, activeSlug]);

  // The logo opens the account menu, with focus on its first item; Escape
  // (back to the logo) or a tap elsewhere closes it.
  useEffect(() => {
    if (!menuOpen) return;
    focusMenuEntry(menuRef.current);
    const close = (event: Event) => {
      if (event.type === "keydown") {
        if ((event as KeyboardEvent).key !== "Escape") return;
        brandButtonRef.current?.focus();
      } else if (brandRef.current?.contains(event.target as Node)) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const brand = (
    <>
      <span className="admin-layout__mark" aria-hidden="true">
        <Icon box={24}>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4" />
          <circle cx="12" cy="14" r="2.6" />
          <path d="M10.6 16.4L10 20l2-1 2 1-.6-3.6" />
        </Icon>
      </span>
      <span className="admin-layout__brand">SLOMP</span>
    </>
  );

  function renderMenuItem(item: AdminMenuItem, role?: "menuitem") {
    return (
      <button
        key={item.id}
        type="button"
        role={role}
        className="admin-layout__menu-item"
        onClick={() => {
          // Chosen from the logo menu: focus goes back to the logo.
          if (role) brandButtonRef.current?.focus();
          setMenuOpen(false);
          item.onSelect();
        }}
      >
        {item.icon}
        {item.label}
      </button>
    );
  }

  return (
    <div className="admin-layout">
      {/* Its default jump would change the hash, and the hash is the route. */}
      <a
        className="admin-layout__skip"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Saltar al contenido
      </a>
      <aside className="admin-layout__side">
        {!isCompact && (
          <div className="admin-layout__brandbar">
            <div className="admin-layout__brand-button">{brand}</div>
          </div>
        )}
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
          {groups.map((group) => (
            <div
              key={group.id}
              role="group"
              aria-labelledby={`admin-nav-${group.id}`}
              className="admin-layout__group"
              data-icons-on-phone={group.iconsOnPhone || undefined}
              // On a phone every link of the bar gets the same width.
              style={{ "--group-size": group.items.length } as CSSProperties}
            >
              <span
                id={`admin-nav-${group.id}`}
                className="admin-layout__group-title"
              >
                {group.label}
              </span>
              {group.items.map((item) => (
                <a
                  key={item.id}
                  data-slide-item
                  className="admin-layout__link"
                  href={item.href}
                  draggable={false}
                  aria-current={item.id === activeId ? "page" : undefined}
                >
                  {item.icon}
                  <span className="admin-layout__label">{item.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        {!isCompact && (
          <div className="admin-layout__actions">
            {menuItems.map((item) => renderMenuItem(item))}
          </div>
        )}
      </aside>
      <div className="admin-layout__column">
        {/* One row that never scrolls: the municipality the panel works in
            stays in sight, and its pill changes it (SL-170). */}
        <header className="admin-layout__topbar">
          {isCompact && (
            <div ref={brandRef} className="admin-layout__brandbar">
              <button
                ref={brandButtonRef}
                type="button"
                className="admin-layout__brand-button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Menú"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {brand}
              </button>
              {menuOpen && (
                <div
                  ref={menuRef}
                  className="admin-layout__menu"
                  role="menu"
                  aria-label="Menú"
                  tabIndex={-1}
                  onKeyDown={moveMenuFocus}
                >
                  {menuItems.map((item) => renderMenuItem(item, "menuitem"))}
                </div>
              )}
            </div>
          )}
          {switcher && <MunicipalitySwitcher switcher={switcher} />}
        </header>
        <main
          id="main"
          ref={mainRef}
          className="admin-layout__main"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
