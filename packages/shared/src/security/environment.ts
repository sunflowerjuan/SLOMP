const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type LocalEnv = Partial<
  Record<"DATABASE_URL" | "ALLOW_DEV_CREDENTIALS", string>
>;

// An environment counts as local when its database lives on this machine,
// or when it is the docker compose stack, which says so with
// ALLOW_DEV_CREDENTIALS (its database host is "db", not localhost).
// Deliberately not based on NODE_ENV: a deployed environment that forgot to
// set it must still be treated as non-local. A DATABASE_URL that cannot be
// parsed is non-local too, so the strict rules apply by default. Same rule
// as the backend (apps/backend/src/common/deployment-secrets.ts).
export function isLocalEnvironment(env: LocalEnv): boolean {
  if (env.ALLOW_DEV_CREDENTIALS === "true") return true;
  if (!env.DATABASE_URL) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(env.DATABASE_URL).hostname.toLowerCase());
  } catch {
    return false;
  }
}
