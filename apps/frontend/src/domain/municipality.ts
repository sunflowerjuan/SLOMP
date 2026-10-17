import { SLUG_PATTERN } from "../routes";

// Rules of a municipality as the panel sees it (SL-122, sections 5 and 7).
// The slug and DANE checks mirror the backend's
// (apps/backend/src/municipalities/municipality-rules.ts), so the add dialog
// can point at the field before sending; the backend still has the last word.

export const DANE_CODE_LENGTH = 5;
export const MAX_SLUG_LENGTH = 60;

const DANE_CODE_PATTERN = new RegExp(`^\\d{${DANE_CODE_LENGTH}}$`);

// `#/consulta/...` is the public consultation, so a municipality called
// "consulta" would have panel addresses (`#/consulta/cargas`) that open the
// public page instead.
const RESERVED_SLUGS = ["consulta"];

export interface MunicipalityName {
  name: string;
  state: string;
}

// "Páez, Boyacá": the department is part of the name, since two
// municipalities can share one (Páez, Boyacá and Páez, Cauca).
export function municipalityLabel({ name, state }: MunicipalityName): string {
  return `${name}, ${state}`;
}

export function isValidDaneCode(value: string): boolean {
  return DANE_CODE_PATTERN.test(value);
}

export function isValidSlug(value: string): boolean {
  return value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

export function isReservedSlug(value: string): boolean {
  return RESERVED_SLUGS.includes(value);
}

// Proposes a slug from the name ("Páez" -> "paez"), same as the backend. Only
// a suggestion: the dialog lets the super user change it before creating.
export function suggestSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
}

// Same order as GET /municipalities (name, then department), so a municipality
// just created lands where a reload would put it.
export function sortMunicipalities<T extends MunicipalityName>(
  municipalities: T[],
): T[] {
  return [...municipalities].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "es") ||
      a.state.localeCompare(b.state, "es"),
  );
}

// The municipality to open when the address names none: the last one used in
// this browser if it still exists, otherwise the first of the list.
export function pickInitialMunicipality<T extends { slug: string }>(
  municipalities: T[],
  lastSlug: string | null,
): T | null {
  return (
    municipalities.find((municipality) => municipality.slug === lastSlug) ??
    municipalities[0] ??
    null
  );
}
