// The municipality this browser last worked in, so signing in opens it again.
// Only a convenience: the URL decides which municipality a tab works with.
const KEY = "slomp.lastMunicipality";

// localStorage can throw (private mode, blocked storage); without it, the
// panel opens the first municipality.
export function readLastMunicipalitySlug(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function rememberMunicipality(slug: string): void {
  try {
    localStorage.setItem(KEY, slug);
  } catch {
    // Ignored: see comment above.
  }
}
