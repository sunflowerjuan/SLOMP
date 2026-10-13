import { useMemo, useSyncExternalStore } from "react";

// Minimal hash-based routing (no react-router).
//
// A hash (`/#/consulta`) is used instead of a real path (`/consulta`) because
// the frontend is served from a Storage static website
// (infra/static-web-app.bicep) whose 404 document is configured by hand via
// CLI: with a hash, a direct link shared with taxpayers works even if that
// setting is missing -- the public consultation must always be available.
//
// Each municipality has its own public consultation, `#/consulta/:slug`: it is
// the page its website embeds in an iframe. Without a municipality
// (`#/consulta`) there is nothing to show, and no municipality is ever listed.
const PUBLIC_CONSULTATION_PREFIX = "#/consulta";
export const ADMIN_HREF = "#/";

export type AdminSection = "cargas" | "liquidaciones" | "consulta-publica";

export const ADMIN_SECTION_HREF: Record<AdminSection, string> = {
  cargas: "#/cargas",
  liquidaciones: "#/liquidaciones",
  "consulta-publica": "#/consulta-publica",
};

// Same shape the backend accepts for a slug: lowercase words joined by single
// hyphens (no overlapping groups, so it cannot backtrack badly).
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function publicConsultationHref(slug: string): string {
  return `${PUBLIC_CONSULTATION_PREFIX}/${encodeURIComponent(slug)}`;
}

// `null`: not a public consultation route. `{ slug: null }`: it is one, but
// without a (valid) municipality, so the page is "Consulta no disponible".
export interface PublicConsultationRoute {
  slug: string | null;
}

export function parsePublicConsultationRoute(
  hash: string,
): PublicConsultationRoute | null {
  if (!hash.startsWith(PUBLIC_CONSULTATION_PREFIX)) return null;
  const rest = hash.slice(PUBLIC_CONSULTATION_PREFIX.length);
  if (rest !== "" && !rest.startsWith("/") && !rest.startsWith("?")) {
    return null; // e.g. "#/consulta-publica", an admin section
  }

  const [path] = rest.split("?");
  const [, segment = "", ...extra] = path.split("/");
  if (extra.some((part) => part !== "")) return { slug: null };

  let slug: string;
  try {
    slug = decodeURIComponent(segment);
  } catch {
    return { slug: null };
  }
  return { slug: SLUG_PATTERN.test(slug) ? slug : null };
}

function adminSectionOf(hash: string): AdminSection {
  if (hash === ADMIN_SECTION_HREF.liquidaciones) return "liquidaciones";
  if (hash === ADMIN_SECTION_HREF["consulta-publica"])
    return "consulta-publica";
  return "cargas";
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const getHash = () => window.location.hash;

export function usePublicConsultationRoute(): PublicConsultationRoute | null {
  const hash = useSyncExternalStore(subscribe, getHash);
  return useMemo(() => parsePublicConsultationRoute(hash), [hash]);
}

export function useAdminSection(): AdminSection {
  return adminSectionOf(useSyncExternalStore(subscribe, getHash));
}
