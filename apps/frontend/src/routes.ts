import { useSyncExternalStore } from "react";

// Minimal hash-based routing (no react-router).
//
// A hash (`/#/consulta`) is used instead of a real path (`/consulta`) because
// the frontend is served from a Storage static website
// (infra/static-web-app.bicep) whose 404 document is configured by hand via
// CLI: with a hash, a direct link shared with taxpayers works even if that
// setting is missing -- the public consultation must always be available.
export const PUBLIC_CONSULTATION_HREF = "#/consulta";
export const ADMIN_HREF = "#/";

export type AdminSection = "cargas" | "liquidaciones";

export const ADMIN_SECTION_HREF: Record<AdminSection, string> = {
  cargas: "#/cargas",
  liquidaciones: "#/liquidaciones",
};

function isPublicConsultationHash(hash: string): boolean {
  return (
    hash === PUBLIC_CONSULTATION_HREF ||
    hash.startsWith(`${PUBLIC_CONSULTATION_HREF}?`)
  );
}

function adminSectionOf(hash: string): AdminSection {
  return hash === ADMIN_SECTION_HREF.liquidaciones ? "liquidaciones" : "cargas";
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const getHash = () => window.location.hash;

export function useIsPublicConsultationRoute(): boolean {
  return isPublicConsultationHash(useSyncExternalStore(subscribe, getHash));
}

export function useAdminSection(): AdminSection {
  return adminSectionOf(useSyncExternalStore(subscribe, getHash));
}
