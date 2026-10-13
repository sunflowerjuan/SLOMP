// Slug of the municipality the panel works in. The backend scopes every panel
// route under /municipalities/:slug, so every request is built through
// municipalityPath(). Until the panel has a municipality selector this is one
// fixed municipality; VITE_MUNICIPALITY_SLUG overrides it for local testing.
export const ACTIVE_MUNICIPALITY_SLUG: string =
  import.meta.env.VITE_MUNICIPALITY_SLUG || "paez";

export function municipalityPath(path: string): string {
  return `/municipalities/${encodeURIComponent(ACTIVE_MUNICIPALITY_SLUG)}${path}`;
}
