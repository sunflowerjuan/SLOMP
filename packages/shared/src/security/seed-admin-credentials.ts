import { isLocalEnvironment, type LocalEnv } from "./environment.js";

// Dev-only fallback so `db:seed` works out of the box on a local machine.
export const LOCAL_SEED_ADMIN_EMAIL = "admin@paez-boyaca.gov.co";
export const LOCAL_SEED_ADMIN_PASSWORD = "changeme123";

export interface SeedAdminCredentials {
  email: string;
  password: string;
}

type SeedEnv = LocalEnv &
  Partial<Record<"SEED_ADMIN_EMAIL" | "SEED_ADMIN_PASSWORD", string>>;

// Which Administrator the seed creates. Only on a local machine, with the
// development default unless SEED_ADMIN_* say otherwise. Anywhere else it
// creates none, so a seeded environment never has a password someone could
// know (security policy, SEC-09): the first Administrator is created with
// `pnpm --filter backend run admin:create`, which applies the password
// policy and forces a change on first login.
export function resolveSeedAdminCredentials(
  env: SeedEnv,
): SeedAdminCredentials | null {
  if (!isLocalEnvironment(env)) return null;
  return {
    email: env.SEED_ADMIN_EMAIL?.trim() || LOCAL_SEED_ADMIN_EMAIL,
    password: env.SEED_ADMIN_PASSWORD || LOCAL_SEED_ADMIN_PASSWORD,
  };
}
