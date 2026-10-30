import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_MUNICIPALITY_SLUG } from "./env";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// Docker is run by absolute path, not looked up in PATH (a writable PATH
// directory could plant its own "docker"). E2E_DOCKER_BIN overrides these.
const DOCKER_CANDIDATES = [
  "/usr/bin/docker",
  "/usr/local/bin/docker",
  "/opt/homebrew/bin/docker",
  "C:/Program Files/Docker/Docker/resources/bin/docker.exe",
  join(
    process.env.LOCALAPPDATA ?? "",
    "Programs/DockerDesktop/resources/bin/docker.exe",
  ),
];

function dockerBinary(): string {
  const binary =
    process.env.E2E_DOCKER_BIN ??
    DOCKER_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!binary) {
    throw new Error(
      "No se encontró Docker. Define E2E_DOCKER_BIN con la ruta completa del ejecutable `docker`.",
    );
  }
  return binary;
}

// Runs SQL in the Compose database (local and CI start it the same way).
// There is no API to delete a tax roll or to age a resolution by 60 days, and
// the backend has no clock to fake, so these two starting states are set here.
function sql(statement: string): void {
  try {
    execFileSync(
      dockerBinary(),
      [
        "compose",
        "exec",
        "-T",
        "db",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "predial_dev",
        "-c",
        statement,
      ],
      { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "inherit"] },
    );
  } catch {
    throw new Error(
      "No se pudo correr SQL en el contenedor `db` de Docker Compose: estas pruebas necesitan el stack local o el de CI.",
    );
  }
}

const MUNICIPALITY = `(SELECT id FROM municipalities WHERE slug = '${E2E_MUNICIPALITY_SLUG}')`;

// Leaves the test municipality with no tax roll, resolutions or payment
// orders (its templates and the municipality itself stay). Order follows the
// foreign keys.
export function resetTaxRoll(): void {
  sql(`
    DELETE FROM settlements WHERE "propertyId" IN (SELECT id FROM properties WHERE "municipalityId" = ${MUNICIPALITY});
    DELETE FROM payment_orders WHERE "municipalityId" = ${MUNICIPALITY};
    DELETE FROM resolutions WHERE "municipalityId" = ${MUNICIPALITY};
    DELETE FROM pdf_jobs WHERE "municipalityId" = ${MUNICIPALITY};
    DELETE FROM tax_roll_imports WHERE "municipalityId" = ${MUNICIPALITY};
    DELETE FROM properties WHERE "municipalityId" = ${MUNICIPALITY};
    DELETE FROM owners WHERE "municipalityId" = ${MUNICIPALITY};
    DELETE FROM resolution_counters WHERE "municipalityId" = ${MUNICIPALITY};
    DELETE FROM payment_order_counters WHERE "municipalityId" = ${MUNICIPALITY};
  `);
}

// Ages every resolution of the test municipality past the 60 days after
// which its settlements are "En firme", and marks them so (the hourly job that
// does it may not have run yet).
export function makeSettlementsFirm(): void {
  sql(`
    UPDATE resolutions SET "issuedAt" = now() - interval '61 days' WHERE "municipalityId" = ${MUNICIPALITY};
    UPDATE settlements SET status = 'EN_FIRME' WHERE "resolutionId" IN (SELECT id FROM resolutions WHERE "municipalityId" = ${MUNICIPALITY}) AND status = 'VIGENTE';
  `);
}
