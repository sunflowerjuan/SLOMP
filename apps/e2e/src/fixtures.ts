import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_MUNICIPALITY_SLUG, adminCredentials, apiUrl } from "./env";

// The fictional Excel files and Word templates of
// apps/backend/scripts/generate-e2e-fixtures.mjs (cadastral codes of the
// e2e-prueba municipality).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED = join(ROOT, "fixtures/generated");
const GENERATOR = join(ROOT, "../backend/scripts/generate-e2e-fixtures.mjs");
const NAMES = [
  "cartera-valida.xlsx",
  "cartera-invalida.xlsx",
  "cartera-fila-invalida.xlsx",
  "plantilla-liquidacion-sin-marcadores.docx",
  "plantilla-mandamiento-sin-marcadores.docx",
  "plantilla-liquidacion-tabla-llena.docx",
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

async function apiToken(): Promise<string> {
  const { email, password } = adminCredentials();
  const login = await fetch(`${apiUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    throw new Error(`El login por API falló (${login.status}).`);
  }
  return ((await login.json()) as { accessToken: string }).accessToken;
}

// Loads a tax roll into the test municipality through the API, as the
// starting data of a test. A file loaded before only reports conflicts.
export async function loadTaxRoll(name: FixtureName): Promise<void> {
  const accessToken = await apiToken();

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

// Makes sure the test municipality has an active liquidation template, as
// the starting data of a test: the template without markers, marked through
// the guided marking API (replacing whatever was active).
export async function ensureActiveLiquidationTemplate(): Promise<{
  version: number;
}> {
  const accessToken = await apiToken();
  const base = `${apiUrl}/municipalities/${E2E_MUNICIPALITY_SLUG}/templates`;
  const auth = { Authorization: `Bearer ${accessToken}` };

  const form = new FormData();
  const path = fixture("plantilla-liquidacion-sin-marcadores.docx");
  form.append("documentType", "LIQUIDACION");
  form.append("file", new Blob([readFileSync(path)]), basename(path));
  const created = await fetch(`${base}/drafts`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  if (!created.ok) {
    throw new Error(`No se pudo crear el borrador (${created.status}).`);
  }
  const { draftId } = (await created.json()) as { draftId: string };
  const content = (await (
    await fetch(`${base}/drafts/${draftId}/content`, { headers: auth })
  ).json()) as { blocks: { blockId: string; text: string }[] };

  const select = (text: string, field: string) => {
    // A cell holding just the text (the year of the table) before a
    // paragraph that mentions it.
    const block =
      content.blocks.find((candidate) => candidate.text === text) ??
      content.blocks.find((candidate) => candidate.text.includes(text));
    if (!block) throw new Error(`"${text}" no está en la plantilla.`);
    const start = block.text.indexOf(text);
    return { blockId: block.blockId, start, end: start + text.length, field };
  };
  const saved = await fetch(`${base}/drafts/${draftId}/save`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      replaceConfirmed: true,
      selections: [
        select("RES-0000-2026", "resolutionNumber"),
        select("00-00-0000-0000-000", "cadastralCode"),
        select("2020", "rows.year"),
        select("$120.000", "totalAmount"),
      ],
    }),
  });
  if (!saved.ok) {
    throw new Error(`No se pudo guardar la plantilla (${saved.status}).`);
  }
  return (await saved.json()) as { version: number };
}

// The paragraphs of the municipality's active liquidation template, as the
// API reads them back.
export async function activeLiquidationTexts(): Promise<string[]> {
  const accessToken = await apiToken();
  const base = `${apiUrl}/municipalities/${E2E_MUNICIPALITY_SLUG}/templates`;
  const auth = { Authorization: `Bearer ${accessToken}` };
  const versions = (await (
    await fetch(`${base}?documentType=LIQUIDACION`, { headers: auth })
  ).json()) as { id: number; isActive: boolean }[];
  const active = versions.find((version) => version.isActive);
  if (!active) throw new Error("No hay plantilla de liquidación activa.");
  const content = (await (
    await fetch(`${base}/${active.id}/content`, { headers: auth })
  ).json()) as { blocks: { text: string }[] };
  return content.blocks.map((block) => block.text);
}
