import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const MENU_ENTRY = '[role="menuitem"], [role="menuitemradio"]';

// Arrow keys walk the items of a role="menu" (wrapping), as the role promises.
export function moveMenuFocus(event: ReactKeyboardEvent<HTMLElement>) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const entries = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(MENU_ENTRY),
  ];
  const next = entries.indexOf(document.activeElement as HTMLElement) + step;
  entries.at(next % entries.length)?.focus();
}

// A menu that just opened starts on its checked option, or else on its first
// item.
export function focusMenuEntry(menu: HTMLElement | null) {
  const checked = menu?.querySelector<HTMLElement>(
    '[role="menuitemradio"][aria-checked="true"]',
  );
  (checked ?? menu?.querySelector<HTMLElement>(MENU_ENTRY))?.focus();
}
