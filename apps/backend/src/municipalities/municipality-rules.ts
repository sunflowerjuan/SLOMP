export const DANE_CODE_LENGTH = 5;
export const MAX_SLUG_LENGTH = 60;

const DANE_CODE_PATTERN = new RegExp(`^\\d{${DANE_CODE_LENGTH}}$`);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidDaneCode(value: string): boolean {
  return DANE_CODE_PATTERN.test(value);
}

// Lowercase letters, digits and single hyphens between them.
export function isValidSlug(value: string): boolean {
  return value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

// Proposes a slug from a municipality name ("Páez" -> "paez"). It is only a
// suggestion: two municipalities can share a name in different departments,
// so the caller still has to check it is free and may edit it.
export function suggestSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}
