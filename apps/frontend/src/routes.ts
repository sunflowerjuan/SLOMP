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
// The panel carries its municipality in the URL too (`#/municipio-a/cargas`),
// so each tab works with the municipality of its own address (SL-122,
// section 7). Configuración has a tab per thing to set up, each with its own
// address (`#/municipio-a/configuracion/plantillas`), SL-170.
const PUBLIC_CONSULTATION_PREFIX = "#/consulta";

export type SettingsTab = "plantillas" | "consulta";

// What the panel shows: a screen of the menu, or a tab of Configuración.
export type AdminView =
  "cargas" | "liquidaciones" | "mandamientos" | `configuracion/${SettingsTab}`;

// The menu entry a view belongs to.
export type AdminSection =
  "cargas" | "liquidaciones" | "mandamientos" | "configuracion";

const SETTINGS_TABS: SettingsTab[] = ["plantillas", "consulta"];

const ADMIN_VIEWS: AdminView[] = [
  "cargas",
  "liquidaciones",
  "mandamientos",
  ...SETTINGS_TABS.map((tab) => settingsView(tab)),
];

// Other addresses of a view: the ones Plantillas and Consulta pública had
// before they moved under Configuración (saved links keep working), and
// Configuración without a tab. The panel replaces them with the view's own.
const VIEW_ALIASES = new Map<string, AdminView>([
  ["plantillas", "configuracion/plantillas"],
  ["consulta-publica", "configuracion/consulta"],
  ["configuracion", "configuracion/plantillas"],
]);

const DEFAULT_ADMIN_VIEW: AdminView = "cargas";

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

export function settingsView(tab: SettingsTab): AdminView {
  return `configuracion/${tab}`;
}

// The Configuración tab a view shows; null outside Configuración.
export function settingsTabOf(view: AdminView): SettingsTab | null {
  return SETTINGS_TABS.find((tab) => settingsView(tab) === view) ?? null;
}

// Both tabs of Configuración belong to its single menu entry.
export function adminSectionOf(view: AdminView): AdminSection {
  return (settingsTabOf(view) ? "configuracion" : view) as AdminSection;
}

export function adminHref(
  slug: string,
  view: AdminView = DEFAULT_ADMIN_VIEW,
): string {
  return `#/${encodeURIComponent(slug)}/${view}`;
}

// `slug: null` when the address names no municipality (`#/`, or a link from
// before SL-126 such as `#/cargas`); the panel then opens one. A slug that
// isn't well formed is still returned, so the panel can say it doesn't exist
// instead of quietly opening another municipality.
export interface AdminRoute {
  slug: string | null;
  view: AdminView;
  // The address is an alias of the view (`#/municipio-a/plantillas`): the panel
  // replaces it with the view's own address.
  isAlias: boolean;
}

function asView(path: string): Omit<AdminRoute, "slug"> | null {
  const view = ADMIN_VIEWS.find((candidate) => candidate === path);
  if (view) return { view, isAlias: false };
  const target = VIEW_ALIASES.get(path);
  return target ? { view: target, isAlias: true } : null;
}

const DEFAULT_VIEW_ROUTE: Omit<AdminRoute, "slug"> = {
  view: DEFAULT_ADMIN_VIEW,
  isAlias: false,
};

export function parseAdminRoute(hash: string): AdminRoute {
  const [path] = hash.replace(/^#\/?/, "").split("?");
  const [first = "", ...rest] = path
    .split("/")
    .filter((segment) => segment !== "");
  const legacyView = rest.length === 0 ? asView(first) : null;
  if (first === "" || legacyView) {
    return { slug: null, ...(legacyView ?? DEFAULT_VIEW_ROUTE) };
  }
  let slug: string;
  try {
    slug = decodeURIComponent(first);
  } catch {
    slug = first;
  }
  return { slug, ...(asView(rest.join("/")) ?? DEFAULT_VIEW_ROUTE) };
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
  const { slug, view, isAlias } = parseAdminRoute(hash);
  return useMemo(() => ({ slug, view, isAlias }), [slug, view, isAlias]);
}

// The municipality of this tab's address, for code outside React (the HTTP
// client). Read on every call, never kept from before.
export function currentAdminSlug(): string | null {
  return parseAdminRoute(getHash()).slug;
}
