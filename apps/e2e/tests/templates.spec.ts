import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ensureActiveLiquidationTemplate, fixture } from "../src/fixtures";
import type { FixtureName } from "../src/fixtures";
import { adminPath } from "../src/paths";
import { signIn } from "../src/session";

// Guided marking of templates: a .docx without markers is uploaded as a
// draft, marked by selecting its text, previewed with sample data and saved
// as the active version; replacing an active one always asks first. It runs
// on both projects (desktop and a 390 px phone) and marks with the keyboard
// only, which works the same on both.

// Technical field names never reach the screen.
const TECHNICAL_NAMES =
  /resolutionNumber|cadastralCode|totalAmount|rows\.|paymentOrderNumber|capitalAmount|liquidations/;

interface Marking {
  // Start of the paragraph, as its keyboard button names it.
  paragraph: string;
  text: string;
  marker: string;
}

const LIQUIDATION: Marking[] = [
  {
    paragraph: "Resolución No.",
    text: "RES-0000-2026",
    marker: "Número de resolución",
  },
  {
    paragraph: "Predio Lote",
    text: "00-00-0000-0000-000",
    marker: "Código catastral del predio",
  },
  { paragraph: "2020»", text: "2020", marker: "Vigencia (año)" },
  {
    paragraph: "Valor total a pagar",
    text: "$120.000",
    marker: "Valor total a pagar",
  },
];

const PAYMENT_ORDER: Marking[] = [
  {
    paragraph: "MANDAMIENTO DE PAGO",
    text: "MND-0000-2026",
    marker: "Número del mandamiento",
  },
  {
    paragraph: "Predio Lote",
    text: "00-00-0000-0000-000",
    marker: "Código catastral del predio",
  },
  { paragraph: "Se libra", text: "$100.000", marker: "Valor del capital" },
  { paragraph: "Se libra", text: "LIQ-0000-2026", marker: "Liquidaciones" },
];

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.goto(adminPath("configuracion/plantillas/liquidacion"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Plantillas" }),
  ).toBeVisible();
});

async function upload(page: Page, type: string, name: FixtureName) {
  await page.getByRole("radio", { name: type }).click();
  // Each document has its own address: its panel is the one to use.
  await expect(page).toHaveURL(
    type === "Liquidación" ? /\/liquidacion$/ : /\/mandamiento$/,
  );
  await page.locator("input[type=file]").setInputFiles(fixture(name));
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(
    page.getByRole("region", { name: "Paso 2 de 3: Marcar" }),
  ).toBeVisible();
}

// Keyboard only: focus the paragraph, Enter opens its text in a box, Shift +
// arrows select, Enter opens the menu and the arrows reach the marker.
async function mark(page: Page, { paragraph, text, marker }: Marking) {
  const button = page.getByRole("button", {
    name: new RegExp(`^Marcar texto del párrafo «.*${escape(paragraph)}`),
  });
  await button.focus();
  await page.keyboard.press("Enter");
  const box = page.locator(".marking-doc__picker-text");
  await expect(box).toBeFocused();
  const original = await box.inputValue();
  const start = original.indexOf(text);
  await page.keyboard.press("Home");
  for (let i = 0; i < start; i += 1) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < text.length; i += 1) {
    await page.keyboard.press("Shift+ArrowRight");
  }
  // The box selects, it never edits.
  await page.keyboard.press("Backspace");
  await expect(box).toHaveValue(original);
  await page.keyboard.press("Enter");

  const menu = page.getByRole("menu", { name: "¿Qué dato va aquí?" });
  await expect(menu).toBeVisible();
  for (let i = 0; i < 20; i += 1) {
    const focused = await page.evaluate(
      () => document.activeElement?.textContent ?? "",
    );
    if (focused.startsWith(marker)) break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(
    page.locator(".marking-doc__mark[data-source=lawyer]", { hasText: text }),
  ).toContainText(marker);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectNoTechnicalNames(page: Page) {
  await expect(page.locator("body")).not.toHaveText(TECHNICAL_NAMES);
}

async function saveFromPreview(page: Page) {
  await page.getByRole("button", { name: "Vista previa" }).click();
  const review = page.getByRole("region", {
    name: "Paso 3 de 3: Revisar y guardar",
  });
  await expect(review).toBeFocused();
  await expect(
    review.getByText(/Vista previa con datos de ejemplo ficticios/),
  ).toBeVisible();
  // Only a desktop shows the PDF inside the page. The PDF service renders
  // one document at a time and turns away the rest: with both projects
  // previewing at once, the screen's own "Reintentar" is the way.
  const ready = review
    .locator("iframe")
    .or(review.getByRole("button", { name: "Abrir la vista previa" }));
  const retry = review.getByRole("button", { name: "Reintentar" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await expect(ready.or(retry)).toBeVisible({ timeout: 30_000 });
    if (await ready.isVisible()) break;
    await retry.click();
  }
  await expect(ready).toBeVisible();
  await expectNoTechnicalNames(page);

  await page.getByRole("button", { name: "Guardar plantilla" }).click();
  // The municipality may already have one from an earlier run.
  const replace = page.getByRole("dialog");
  const saved = page.getByRole("status").filter({ hasText: "Se guardó" });
  await expect(replace.or(saved)).toBeVisible();
  if (await replace.isVisible()) {
    await replace.getByRole("button", { name: "Reemplazar plantilla" }).click();
  }
}

// The desktop and phone projects share the municipality, so another run may
// have saved a version meanwhile: only "newer" is certain.
async function activeVersion(page: Page): Promise<number> {
  const text = await page.getByText("En uso: versión").textContent();
  return Number(/versión (\d+)/.exec(text ?? "")?.[1] ?? 0);
}

for (const { type, name, markings, required, documentName } of [
  {
    type: "Liquidación",
    name: "plantilla-liquidacion-sin-marcadores.docx" as const,
    markings: LIQUIDATION,
    required: 5,
    documentName: "liquidación",
  },
  {
    type: "Mandamiento",
    name: "plantilla-mandamiento-sin-marcadores.docx" as const,
    markings: PAYMENT_ORDER,
    required: 4,
    documentName: "mandamiento",
  },
]) {
  test(`${type}: subir sin marcadores, marcar con teclado, previsualizar y guardar`, async ({
    page,
  }) => {
    await upload(page, type, name);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `Nueva plantilla de ${documentName}`,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(`0 de ${required} obligatorios`).first(),
    ).toBeVisible();
    await expectNoTechnicalNames(page);

    for (const marking of markings) await mark(page, marking);
    await expect(
      page.getByText(`${required} de ${required} obligatorios`).first(),
    ).toBeVisible();

    await saveFromPreview(page);

    await expect(
      page.getByRole("status").filter({ hasText: "Se guardó" }),
    ).toContainText(`ya es la plantilla de ${documentName} en uso`);
    // The newest version, first in the history, is the one in use.
    const newest = page
      .getByRole("region", { name: "Historial de versiones" })
      .getByRole("listitem")
      .first();
    await expect(newest).toContainText(name);
    await expect(newest).toContainText("Activa");
  });
}

test("con una plantilla activa, guardar pregunta antes de reemplazarla y Cancelar no cambia nada", async ({
  page,
}) => {
  const active = await ensureActiveLiquidationTemplate();
  await page.reload();
  await upload(
    page,
    "Liquidación",
    "plantilla-liquidacion-sin-marcadores.docx",
  );

  // Saving stays off, saying what is missing, until every required one is in.
  await mark(page, LIQUIDATION[0]);
  await page.getByRole("button", { name: "Vista previa" }).click();
  await expect(
    page.getByRole("button", { name: "Guardar plantilla" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/^Para guardar falta asignar «Código catastral del predio»/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Volver a marcar" }).click();
  for (const marking of LIQUIDATION.slice(1)) await mark(page, marking);

  await page.getByRole("button", { name: "Vista previa" }).click();
  await page.getByRole("button", { name: "Guardar plantilla" }).click();
  const dialog = page.getByRole("dialog", {
    name: "¿Reemplazar la plantilla de liquidación en uso?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    /La versión \d+ \(plantilla-liquidacion-sin-marcadores\.docx, subida el/,
  );
  await expect(dialog).toContainText("se conserva como versión anterior");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  // Nothing changed: still reviewing, the earlier version still in use.
  await expect(
    page.getByRole("region", { name: "Paso 3 de 3: Revisar y guardar" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Guardar plantilla" }).click();
  await dialog.getByRole("button", { name: "Reemplazar plantilla" }).click();
  await expect(page.getByText("En uso: versión")).toBeVisible();
  expect(await activeVersion(page)).toBeGreaterThan(active.version);
});

test("el borrador sobrevive a una recarga y Cancelar pide confirmación si hay marcadores", async ({
  page,
}) => {
  await upload(
    page,
    "Liquidación",
    "plantilla-liquidacion-sin-marcadores.docx",
  );
  await mark(page, LIQUIDATION[0]);

  await page.reload();
  await expect(page.getByText("1 de 5 obligatorios").first()).toBeVisible();
  await expect(
    page.locator(".marking-doc__mark[data-source=lawyer]"),
  ).toContainText("Número de resolución");

  await page.getByRole("button", { name: "Cancelar" }).click();
  const dialog = page.getByRole("dialog", {
    name: "¿Descartar este borrador?",
  });
  await dialog.getByRole("button", { name: "Seguir marcando" }).click();
  await expect(page.getByText("1 de 5 obligatorios").first()).toBeVisible();

  await page.getByRole("button", { name: "Cancelar" }).click();
  await dialog.getByRole("button", { name: "Descartar borrador" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Plantillas" }),
  ).toBeVisible();
});

test("una selección que cruza párrafos se avisa y no asigna nada", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Seleccionar arrastrando es con mouse.");
  await upload(
    page,
    "Liquidación",
    "plantilla-liquidacion-sin-marcadores.docx",
  );

  const from = await page
    .locator(".marking-doc__block", { hasText: "Liquidación oficial" })
    .boundingBox();
  const to = await page
    .locator(".marking-doc__block", { hasText: "Predio Lote" })
    .boundingBox();
  await page.mouse.move(from!.x + 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + 120, to!.y + to!.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByRole("alert")).toHaveText(
    "Selecciona texto dentro de un solo párrafo o de una sola celda. No se asignó ningún marcador.",
  );
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(page.getByText("0 de 5 obligatorios").first()).toBeVisible();

  await page.getByRole("button", { name: "Cancelar" }).click();
});

test("en el teléfono la lista de marcadores es una hoja inferior", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Solo en el teléfono.");
  await upload(
    page,
    "Mandamiento",
    "plantilla-mandamiento-sin-marcadores.docx",
  );

  await page.getByRole("button", { name: /^Marcadores · 0 de 4/ }).click();
  const sheet = page.getByRole("complementary", { name: "Marcadores" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Número del mandamiento");
  await sheet.getByRole("button", { name: "Cerrar marcadores" }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: "Cancelar" }).click();
});

test("Configuración solo dice qué plantilla de cada documento está en uso, y lleva a su historial", async ({
  page,
}) => {
  const active = await ensureActiveLiquidationTemplate();
  await page.goto(adminPath("configuracion/plantillas"));

  const liquidation = page.getByRole("region", { name: "Liquidación oficial" });
  await expect(liquidation).toContainText("Activa");
  await expect(liquidation).toContainText(/Versión \d+/);
  await expect(page.getByRole("region", { name: "Mandamiento" })).toBeVisible();
  // No upload and no history here.
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Activar/ })).toHaveCount(0);
  await expectNoTechnicalNames(page);

  await liquidation
    .getByRole("link", { name: "Ver historial y subir una nueva" })
    .click();
  await expect(page).toHaveURL(/configuracion\/plantillas\/liquidacion$/);
  const history = page.getByRole("region", { name: "Historial de versiones" });
  await expect(
    history.getByText(`Versión ${active.version}`, { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Volver a Configuración" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Configuración" }),
  ).toBeVisible();
});
