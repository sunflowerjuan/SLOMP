const TOKEN_KEY = "slomp.accessToken";

// sessionStorage can throw (private mode, blocked storage); without it, the
// session just doesn't survive a reload.
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignored: see comment above.
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignored: see comment above.
  }
}
