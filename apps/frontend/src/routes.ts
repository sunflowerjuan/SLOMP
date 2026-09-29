import { useSyncExternalStore } from "react";

// Enrutamiento minimo por hash (sin react-router): el frontend hoy tiene un
// solo punto de entrada publico, la consulta del contribuyente (SL-86).
//
// Se usa hash (`/#/consulta`) y no una ruta real (`/consulta`) porque el
// frontend se sirve desde un Storage static website (infra/static-web-app.bicep)
// cuyo documento 404 se configura a mano por CLI: con hash, el enlace directo
// que se comparta con los contribuyentes funciona aunque esa configuracion
// falte (RNF-08: la consulta publica debe estar siempre disponible).
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
