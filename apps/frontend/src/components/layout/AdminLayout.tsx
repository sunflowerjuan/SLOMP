import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSlidingIndicator } from "../../hooks/useSlidingIndicator";
import { moveMenuFocus } from "./menuFocus";
import { MunicipalityOptions } from "./MunicipalityOptions";
import type { MunicipalitySwitch } from "./MunicipalityOptions";
import { MunicipalitySwitcher } from "./MunicipalitySwitcher";
import "./AdminLayout.css";

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  // Setup sections: on a phone they open from the logo menu, so the bar keeps
  // only the daily work and its labels fit.
  inMenuOnPhone?: boolean;
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
  items: AdminNavItem[];
  activeId: string;
  menuItems: AdminMenuItem[];
  // Active municipality and how to change it: under SLOMP on desktop, in the
  // logo menu on a phone.
  switcher?: MunicipalitySwitch;
  children: ReactNode;
}

export function AdminLayout({
  items,
  activeId,
  menuItems,
  switcher,
  children,
}: AdminLayoutProps) {
  const mainRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isFirstRender = useRef(true);
  const isCompact = useMediaQuery("(max-width: 900px)");
  const barItems = isCompact
    ? items.filter((item) => !item.inMenuOnPhone)
    : items;
  const menuSections = isCompact
    ? items.filter((item) => item.inMenuOnPhone)
    : [];
  // -1 while a menu section is open on a phone: the bar marks none.
  const activeIndex = barItems.findIndex((item) => item.id === activeId);
  const { containerRef, indicatorStyle, dragging, axis, bind } =
    useSlidingIndicator<HTMLElement>(activeIndex, (index) => {
      window.location.hash = barItems[index].href;
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

  const activeLabel = switcher?.activeLabel ?? null;

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
      <span className="admin-layout__brand-text">
        <span className="admin-layout__brand">SLOMP</span>
        {/* Phone only: on desktop the selector below shows it. */}
        {activeLabel && (
          <span className="admin-layout__brand-context">{activeLabel}</span>
        )}
      </span>
    </>
  );

  function renderMenuItem(
    item: AdminMenuItem,
    role?: "menuitem",
    autoFocus?: boolean,
  ) {
    return (
      <button
        key={item.id}
        type="button"
        role={role}
        className="admin-layout__menu-item"
        autoFocus={autoFocus}
        onClick={() => {
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
      <button
        type="button"
        className="admin-layout__skip"
        onClick={() => mainRef.current?.focus()}
      >
        Saltar al contenido
      </button>
      <aside
        className="admin-layout__side"
        data-switcher={switcher ? "" : undefined}
      >
        <div ref={brandRef} className="admin-layout__brandbar">
          {isCompact ? (
            <button
              type="button"
              className="admin-layout__brand-button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={
                activeLabel ? `Menú. Municipio: ${activeLabel}` : "Menú"
              }
              onClick={() => setMenuOpen((open) => !open)}
            >
              {brand}
            </button>
          ) : (
            <div className="admin-layout__brand-button">{brand}</div>
          )}
          {isCompact && menuOpen && (
            <div
              className="admin-layout__menu"
              role="menu"
              aria-label="Menú"
              onKeyDown={moveMenuFocus}
            >
              {switcher && (
                <>
                  <p className="admin-layout__menu-heading" aria-hidden="true">
                    Municipio
                  </p>
                  <MunicipalityOptions
                    switcher={switcher}
                    onDone={() => setMenuOpen(false)}
                  />
                  <div
                    role="separator"
                    className="admin-layout__menu-separator"
                  />
                </>
              )}
              {menuSections.length > 0 && (
                <>
                  {menuSections.map((item, index) => (
                    <a
                      key={item.id}
                      role="menuitem"
                      className="admin-layout__menu-item"
                      href={item.href}
                      autoFocus={!switcher && index === 0}
                      aria-current={item.id === activeId ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.icon}
                      {item.label}
                    </a>
                  ))}
                  <div
                    role="separator"
                    className="admin-layout__menu-separator"
                  />
                </>
              )}
              {menuItems.map((item, index) =>
                renderMenuItem(
                  item,
                  "menuitem",
                  !switcher && menuSections.length === 0 && index === 0,
                ),
              )}
            </div>
          )}
        </div>
        {!isCompact && switcher && <MunicipalitySwitcher switcher={switcher} />}
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
          {barItems.map((item) => (
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
        {!isCompact && (
          <div className="admin-layout__actions">
            {menuItems.map((item) => renderMenuItem(item))}
          </div>
        )}
      </aside>
      <main ref={mainRef} className="admin-layout__main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
