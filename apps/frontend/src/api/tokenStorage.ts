// The access token lives only in memory: it is gone on reload (the refresh
// cookie brings the session back) and no script can read it from storage.
export interface Session {
  accessToken: string;
  // Timestamps in ms.
  accessTokenExpiresAt: number;
  sessionExpiresAt: number;
  refreshedAt: number;
  idleTimeoutMs: number;
  // Someone else chose the password: the panel stays closed until the
  // Administrator replaces it.
  mustChangePassword: boolean;
}

// What the backend answers on login and on refresh.
export interface SessionResponse {
  accessToken: string;
  expiresIn: number;
  idleTimeoutSeconds: number;
  sessionExpiresAt: string;
  mustChangePassword: boolean;
}

let session: Session | null = null;

export function getSession(): Session | null {
  return session;
}

export function getToken(): string | null {
  return session?.accessToken ?? null;
}

export function setSession(response: SessionResponse): Session {
  const now = Date.now();
  session = {
    accessToken: response.accessToken,
    accessTokenExpiresAt: now + response.expiresIn * 1000,
    sessionExpiresAt: Date.parse(response.sessionExpiresAt),
    refreshedAt: now,
    idleTimeoutMs: response.idleTimeoutSeconds * 1000,
    mustChangePassword: response.mustChangePassword === true,
  };
  return session;
}

export function markPasswordChanged(): void {
  if (session) session = { ...session, mustChangePassword: false };
}

export function clearToken(): void {
  session = null;
}

// Last time the Administrator used the panel, shared by every tab so a tab
// left in the background doesn't close a session another tab is using. It is
// only a timestamp; its presence also tells a freshly loaded page that there
// may be a session worth restoring.
const ACTIVITY_KEY = "slomp.lastActivity";

let lastActivity = 0;

// localStorage can throw (private mode, blocked storage); without it, each
// tab just tracks its own activity.
export function getLastActivity(): number {
  try {
    const shared = Number(localStorage.getItem(ACTIVITY_KEY));
    if (Number.isFinite(shared) && shared > lastActivity) {
      lastActivity = shared;
    }
  } catch {
    // Ignored: see comment above.
  }
  return lastActivity;
}

export function markActivity(): void {
  lastActivity = Date.now();
  try {
    localStorage.setItem(ACTIVITY_KEY, String(lastActivity));
  } catch {
    // Ignored: see comment above.
  }
}

export function clearActivity(): void {
  lastActivity = 0;
  try {
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    // Ignored: see comment above.
  }
}

export function hasSessionHint(): boolean {
  return getLastActivity() > 0;
}
