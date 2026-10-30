import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_MUNICIPALITY_SLUG } from "./env";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// Runs SQL in the Compose database (local and CI start it the same way).
// There is no API to delete a tax roll or to age a resolution by 60 days, and
// the backend has no clock to fake, so these two starting states are set here.
function sql(statement: string): void {
  try {
    execFileSync(
      "docker",
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
