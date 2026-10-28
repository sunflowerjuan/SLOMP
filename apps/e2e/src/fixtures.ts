import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_MUNICIPALITY_SLUG, adminCredentials, apiUrl } from "./env";

// The fictional Excel files of apps/backend/scripts/generate-e2e-fixtures.mjs
// (cadastral codes of the e2e-prueba municipality).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED = join(ROOT, "fixtures/generated");
const GENERATOR = join(ROOT, "../backend/scripts/generate-e2e-fixtures.mjs");
const NAMES = [
  "cartera-valida.xlsx",
  "cartera-invalida.xlsx",
  "cartera-fila-invalida.xlsx",
] as const;

export type FixtureName = (typeof NAMES)[number];

export function fixture(name: FixtureName): string {
  return join(GENERATED, name);
}

// A clean checkout (CI) has none: they are written once, by the backend's
// script, which has exceljs.
export function ensureFixtures(): void {
  if (NAMES.every((name) => existsSync(fixture(name)))) return;
  execFileSync(process.execPath, [GENERATOR], { stdio: "inherit" });
}

// Loads a tax roll into the test municipality through the API, as the
// starting data of a test. A file loaded before only reports conflicts.
export async function loadTaxRoll(name: FixtureName): Promise<void> {
  const { email, password } = adminCredentials();
  const login = await fetch(`${apiUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    throw new Error(`El login por API falló (${login.status}).`);
  }
  const { accessToken } = (await login.json()) as { accessToken: string };

  const form = new FormData();
  const path = fixture(name);
  form.append("file", new Blob([readFileSync(path)]), basename(path));
  form.append("confirmReplace", "false");
  const response = await fetch(
    `${apiUrl}/municipalities/${E2E_MUNICIPALITY_SLUG}/tax-roll/import`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );
  if (!response.ok) {
    throw new Error(
      `No se pudo cargar ${name} en ${E2E_MUNICIPALITY_SLUG} (${response.status}).`,
    );
  }
}
