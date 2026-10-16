// Secrets that must be unique to every deployed environment (security
// policy, section 2: "JWT_SECRET de al menos 32 bytes aleatorios, validado al
// arrancar"; SL-115).
export const MIN_SECRET_BYTES = 32;

// Values published in this repository (.env.example, docker-compose.yml, CI,
// tests). Anyone can read them, so a token or request signed with one of
// them can be forged.
const PUBLISHED_PLACEHOLDERS: ReadonlySet<string> = new Set([
  'reemplazar-en-local',
  'ci-placeholder-secret',
  'test-secret',
  'local-compose-only-change-me',
]);

// Checked only when set: JWT_SECRET is required anyway (AuthModule refuses
// to load without it), PDF_SERVICE_KEY is optional (PDF routes answer 503).
const DEPLOYMENT_SECRETS = ['JWT_SECRET', 'PDF_SERVICE_KEY'] as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

type Env = Record<string, string | undefined>;

// Same rule as the seed (packages/shared/src/security/environment.ts): an
// environment is local when its database lives on this machine, or when it
// is the docker compose stack, which says so with ALLOW_DEV_CREDENTIALS.
// Deliberately not based on NODE_ENV: a deployment that forgot to set it is
// still treated as non-local, and so is a DATABASE_URL that cannot be parsed.
export function isLocalEnvironment(env: Env): boolean {
  if (env.ALLOW_DEV_CREDENTIALS === 'true') return true;
  if (!env.DATABASE_URL) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(env.DATABASE_URL).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function secretProblem(value: string): string | undefined {
  if (PUBLISHED_PLACEHOLDERS.has(value)) {
    return 'is a placeholder published in the repository';
  }
  if (Buffer.byteLength(value, 'utf8') < MIN_SECRET_BYTES) {
    return `must have at least ${MIN_SECRET_BYTES} bytes`;
  }
  return undefined;
}

// Throws so the backend refuses to start, outside a local machine, with a
// secret anyone could know.
export function assertDeploymentSecrets(env: Env): void {
  if (isLocalEnvironment(env)) return;

  const problems = DEPLOYMENT_SECRETS.flatMap((name) => {
    const value = env[name];
    const problem = value ? secretProblem(value) : undefined;
    return problem ? [`${name} ${problem}`] : [];
  });
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start outside a local machine: ${problems.join('; ')}. ` +
        'Every environment needs its own random value, for example: ' +
        `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
}
