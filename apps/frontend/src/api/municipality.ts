import { currentAdminSlug } from "../routes";

// The backend scopes every panel route under /municipalities/:slug, so every
// request is built through municipalityPath(). The slug comes from this tab's
// URL (#/paez/...) at the moment of the call, never from a stored value: two
// tabs on different municipalities can't send each other's slug (SL-122).
export function municipalityPath(path: string): string {
  const slug = currentAdminSlug();
  if (!slug) {
    // The panel only mounts its screens once the URL names a municipality.
    throw new Error("No municipality in the URL");
  }
  return `/municipalities/${encodeURIComponent(slug)}${path}`;
}

// Municipality of the "consult without signing in" link on the login screen,
// when this browser hasn't used the panel yet. VITE_MUNICIPALITY_SLUG
// overrides it for local testing.
export const DEFAULT_PUBLIC_CONSULTATION_SLUG: string =
  import.meta.env.VITE_MUNICIPALITY_SLUG || "paez";
