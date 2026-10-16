import { isLocalEnvironment, type LocalEnv } from "./environment.js";
import {
  checkPasswordPolicy,
  describePasswordViolations,
} from "./password-policy.js";

// Dev-only fallback so `db:seed` works out of the box on a local machine.
export const LOCAL_SEED_ADMIN_EMAIL = "admin@paez-boyaca.gov.co";
export const LOCAL_SEED_ADMIN_PASSWORD = "changeme123";

export interface SeedAdminCredentials {
  email: string;
  password: string;
  isLocal: boolean;
}

type SeedEnv = LocalEnv &
  Partial<Record<"SEED_ADMIN_EMAIL" | "SEED_ADMIN_PASSWORD", string>>;

// Decides which Administrator the seed creates. On a local machine the
// known development default is allowed; anywhere else both values must be
// given explicitly and the password must pass the policy, so a seeded
// environment never ends up with credentials published in the repository
// (security policy, SEC-09).
export function resolveSeedAdminCredentials(
  env: SeedEnv,
): SeedAdminCredentials {
  const isLocal = isLocalEnvironment(env);
  const email = env.SEED_ADMIN_EMAIL?.trim() || undefined;
  const password = env.SEED_ADMIN_PASSWORD || undefined;

  if (isLocal) {
    return {
      email: email ?? LOCAL_SEED_ADMIN_EMAIL,
      password: password ?? LOCAL_SEED_ADMIN_PASSWORD,
      isLocal,
    };
  }

  if (!email || !password) {
    throw new Error(
      "This is not a local database: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set explicitly (no default credentials outside a local machine).",
    );
  }

  const violations = checkPasswordPolicy(password);
  if (violations.length > 0) {
    throw new Error(
      `SEED_ADMIN_PASSWORD is not acceptable outside a local machine: ${describePasswordViolations(violations)}.`,
    );
  }

  return { email, password, isLocal };
}
