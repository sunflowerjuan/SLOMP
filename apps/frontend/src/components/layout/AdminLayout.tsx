import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSlidingIndicator } from "../../hooks/useSlidingIndicator";
import {
  readSidebarCollapsed,
  rememberSidebarCollapsed,
} from "../../api/sidebarCollapsed";
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
  // Active municipality and how to change it: a pill in the sidebar on
  // desktop, in the top bar on a phone.
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
  // Desktop only: the phone's bar has no room to give back.
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const isCollapsed = collapsed && !isCompact;
  // While the width animates, the indicator is re-measured every frame; its
  // own transition would restart each time and trail behind.
  const [resizing, setResizing] = useState(false);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
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

  const sidebarIcon = (
    <Icon box={24}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </Icon>
  );

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
        title={role ? undefined : tooltip(item.label)}
        onClick={() => {
          // Chosen from the logo menu: focus goes back to the logo.
          if (role) brandButtonRef.current?.focus();
          setMenuOpen(false);
          item.onSelect();
        }}
      >
        {item.icon}
        <span className="admin-layout__label">{item.label}</span>
      </button>
    );
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    setResizing(true);
    rememberSidebarCollapsed(next);
    // The pressed button hides; focus moves to the one that undoes it.
    requestAnimationFrame(() =>
      (next ? expandRef : collapseRef).current?.focus(),
    );
  }

  // With only the icons left, the pointer shows what each one is.
  const tooltip = (label: string) => (isCollapsed ? label : undefined);

  return (
    <div className="admin-layout" data-collapsed={isCollapsed || undefined}>
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
      <aside
        className="admin-layout__side"
        data-resizing={resizing || undefined}
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === "width"
          ) {
            setResizing(false);
          }
        }}
      >
        {!isCompact && (
          <div className="admin-layout__brandbar">
            <div className="admin-layout__brand-button">{brand}</div>
            {/* Collapsed, the logo itself expands the sidebar, so nothing
                has to move to make room for a button. */}
            {isCollapsed && (
              <button
                ref={expandRef}
                type="button"
                className="admin-layout__expand"
                aria-label="Expandir menú"
                title="Expandir menú"
                onClick={toggleCollapsed}
              >
                {sidebarIcon}
              </button>
            )}
            <button
              ref={collapseRef}
              type="button"
              className="admin-layout__collapse"
              aria-label="Contraer menú"
              title="Contraer menú"
              onClick={toggleCollapsed}
            >
              {sidebarIcon}
            </button>
          </div>
        )}
        {!isCompact && switcher && (
          <MunicipalitySwitcher switcher={switcher} compact={isCollapsed} />
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
                <span className="admin-layout__group-name">{group.label}</span>
              </span>
              {group.items.map((item) => (
                <a
                  key={item.id}
                  data-slide-item
                  className="admin-layout__link"
                  href={item.href}
                  draggable={false}
                  aria-current={item.id === activeId ? "page" : undefined}
                  title={tooltip(item.label)}
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
        {/* Phone only: one row that never scrolls, so the municipality the
            panel works in stays in sight and its pill changes it. On desktop
            the sidebar holds both. */}
        {isCompact && (
          <header className="admin-layout__topbar">
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
            {switcher && <MunicipalitySwitcher switcher={switcher} />}
          </header>
        )}
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
