// Whether the desktop sidebar was left collapsed, so the panel opens the same
// way next time in this browser.
const KEY = "slomp.sidebarCollapsed";

// localStorage can throw (private mode, blocked storage); without it, the
// sidebar opens expanded.
export function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // Ignored: see comment above.
  }
}
