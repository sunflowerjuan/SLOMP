import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apiFetch, apiLogin } from "./api";
import { E2E_MUNICIPALITY_SLUG, apiUrl } from "./env";

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

// Loads a tax roll into the test municipality through the API, as the
// starting data of a test. A file loaded before only reports conflicts.
export async function loadTaxRoll(name: FixtureName): Promise<void> {
  const accessToken = await apiLogin();

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

interface Selection {
  text: string;
  field: string;
}

// Makes sure the test municipality has an active template of a document
// type, as the starting data of a test: the template without markers, marked
// through the guided marking API (replacing whatever was active).
async function ensureActiveTemplate(
  documentType: "LIQUIDACION" | "MANDAMIENTO",
  file: FixtureName,
  selections: Selection[],
): Promise<{ version: number }> {
  const accessToken = await apiLogin();
  const base = `${apiUrl}/municipalities/${E2E_MUNICIPALITY_SLUG}/templates`;
  const auth = { Authorization: `Bearer ${accessToken}` };

  const form = new FormData();
  const path = fixture(file);
  form.append("documentType", documentType);
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
      selections: selections.map(({ text, field }) => select(text, field)),
    }),
  });
  if (!saved.ok) {
    throw new Error(`No se pudo guardar la plantilla (${saved.status}).`);
  }
  return (await saved.json()) as { version: number };
}

export function ensureActiveLiquidationTemplate(): Promise<{
  version: number;
}> {
  return ensureActiveTemplate(
    "LIQUIDACION",
    "plantilla-liquidacion-sin-marcadores.docx",
    [
      { text: "RES-0000-2026", field: "resolutionNumber" },
      { text: "00-00-0000-0000-000", field: "cadastralCode" },
      { text: "2020", field: "rows.year" },
      { text: "$120.000", field: "totalAmount" },
    ],
  );
}

export function ensureActivePaymentOrderTemplate(): Promise<{
  version: number;
}> {
  return ensureActiveTemplate(
    "MANDAMIENTO",
    "plantilla-mandamiento-sin-marcadores.docx",
    [
      { text: "MND-0000-2026", field: "paymentOrderNumber" },
      { text: "00-00-0000-0000-000", field: "cadastralCode" },
      { text: "$100.000", field: "capitalAmount" },
      { text: "LIQ-0000-2026", field: "liquidations" },
    ],
  );
}

// Issues the resolution of the given properties, as the starting data of a
// payment order or public consultation test (the liquidation PDF is what
// creates the resolution, and the public consultation lists only those).
export async function issueResolutions(codes: string[]): Promise<void> {
  for (const code of codes) {
    const found = await apiFetch(
      `/municipalities/${E2E_MUNICIPALITY_SLUG}/settlements/search?cadastralCode=${code}`,
    );
    const entries = (await found.json()) as { settlementId: number }[];
    if (entries.length === 0) throw new Error(`No hay liquidación de ${code}.`);
    const issued = await apiFetch(
      `/municipalities/${E2E_MUNICIPALITY_SLUG}/settlements/${entries[0].settlementId}/liquidation-pdf`,
      { method: "POST" },
    );
    if (!issued.ok) {
      throw new Error(
        `No se pudo emitir la resolución de ${code} (${issued.status}).`,
      );
    }
  }
}

// The paragraphs of the municipality's active liquidation template, as the
// API reads them back.
export async function activeLiquidationTexts(): Promise<string[]> {
  const accessToken = await apiLogin();
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
