import type { KeyboardEvent as ReactKeyboardEvent } from "react";

// Arrow keys walk the items of a role="menu" (wrapping), as the role promises.
export function moveMenuFocus(event: ReactKeyboardEvent<HTMLElement>) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const entries = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemradio"]',
    ),
  ];
  const next = entries.indexOf(document.activeElement as HTMLElement) + step;
  entries.at(next % entries.length)?.focus();
}
