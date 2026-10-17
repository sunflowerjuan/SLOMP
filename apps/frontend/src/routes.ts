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
//
// The panel carries its municipality in the URL too (`#/paez/cargas`), so each
// tab works with the municipality of its own address (SL-122, section 7).
const PUBLIC_CONSULTATION_PREFIX = "#/consulta";

export type AdminSection =
  | "cargas"
  | "liquidaciones"
  | "mandamientos"
  | "plantillas"
  | "consulta-publica";

const ADMIN_SECTIONS: AdminSection[] = [
  "cargas",
  "liquidaciones",
  "mandamientos",
  "plantillas",
  "consulta-publica",
];

const DEFAULT_ADMIN_SECTION: AdminSection = "cargas";

// Same shape the backend accepts for a slug: lowercase words joined by single
// hyphens (no overlapping groups, so it cannot backtrack badly).
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export function adminHref(
  slug: string,
  section: AdminSection = DEFAULT_ADMIN_SECTION,
): string {
  return `#/${encodeURIComponent(slug)}/${section}`;
}

// `slug: null` when the address names no municipality (`#/`, or a link from
// before SL-126 such as `#/cargas`); the panel then opens one. A slug that
// isn't well formed is still returned, so the panel can say it doesn't exist
// instead of quietly opening another municipality.
export interface AdminRoute {
  slug: string | null;
  section: AdminSection;
}

function asSection(value: string | undefined): AdminSection | null {
  return ADMIN_SECTIONS.find((section) => section === value) ?? null;
}

export function parseAdminRoute(hash: string): AdminRoute {
  const [path] = hash.replace(/^#\/?/, "").split("?");
  const [first = "", second] = path.split("/");
  const legacySection = second === undefined ? asSection(first) : null;
  if (first === "" || legacySection) {
    return { slug: null, section: legacySection ?? DEFAULT_ADMIN_SECTION };
  }
  let slug: string;
  try {
    slug = decodeURIComponent(first);
  } catch {
    slug = first;
  }
  return { slug, section: asSection(second) ?? DEFAULT_ADMIN_SECTION };
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

export function useAdminRoute(): AdminRoute {
  const hash = useSyncExternalStore(subscribe, getHash);
  const { slug, section } = parseAdminRoute(hash);
  return useMemo(() => ({ slug, section }), [slug, section]);
}

// The municipality of this tab's address, for code outside React (the HTTP
// client). Read on every call, never kept from before.
export function currentAdminSlug(): string | null {
  return parseAdminRoute(getHash()).slug;
}
