import { E2E_MUNICIPALITY_SLUG } from "./env";

// Panel route of the test municipality (hash routing, see frontend/src/routes.ts).
export function adminPath(section: string): string {
  return `/#/${E2E_MUNICIPALITY_SLUG}/${section}`;
}
