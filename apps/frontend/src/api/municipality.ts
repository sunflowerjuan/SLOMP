import { currentAdminSlug, publicConsultationHref } from "../routes";

// The backend scopes every panel route under /municipalities/:slug, so every
// request is built through municipalityPath(). The slug comes from this tab's
// URL (#/municipio-a/...) at the moment of the call, never from a stored value:
// two tabs on different municipalities can't send each other's slug (SL-122).
export function municipalityPath(path: string): string {
  const slug = currentAdminSlug();
  if (!slug) {
    // The panel only mounts its screens once the URL names a municipality.
    throw new Error("No municipality in the URL");
  }
  return `/municipalities/${encodeURIComponent(slug)}${path}`;
}

// Where the "consult without signing in" link on the login screen goes: the
// municipality of the URL, else the one this browser remembers, else
// VITE_MUNICIPALITY_SLUG. That variable is optional and has no default, so
// with none of the three there is no link (SL-176).
export function loginConsultationHref(
  urlSlug: string | null,
  lastSlug: string | null,
): string | null {
  const configuredSlug: string | undefined = import.meta.env
    .VITE_MUNICIPALITY_SLUG;
  const slug = urlSlug ?? lastSlug ?? configuredSlug;
  return slug ? publicConsultationHref(slug) : null;
}
