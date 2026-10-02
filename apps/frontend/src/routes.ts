import { useSyncExternalStore } from "react";

// Minimal hash-based routing (no react-router): today the frontend has a
// single public entry point, the taxpayer consultation (SL-86).
//
// A hash (`/#/consulta`) is used instead of a real path (`/consulta`) because
// the frontend is served from a Storage static website
// (infra/static-web-app.bicep) whose 404 document is configured by hand via
// CLI: with a hash, a direct link shared with taxpayers works even if that
// setting is missing (RNF-08: the public consultation must always be
// available).
export const PUBLIC_CONSULTATION_HREF = "#/consulta";
export const ADMIN_HREF = "#/";

function isPublicConsultationHash(hash: string): boolean {
  return (
    hash === PUBLIC_CONSULTATION_HREF ||
    hash.startsWith(`${PUBLIC_CONSULTATION_HREF}?`)
  );
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getSnapshot(): boolean {
  return isPublicConsultationHash(window.location.hash);
}

export function useIsPublicConsultationRoute(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
