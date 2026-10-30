import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  activeLiquidationTexts,
  ensureActiveLiquidationTemplate,
  fixture,
} from "../src/fixtures";
import type { FixtureName } from "../src/fixtures";
import { E2E_MUNICIPALITY_SLUG } from "../src/env";
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

// "N de M obligatorios" where it shows: beside the steps on a desktop, and
// shortened to "N de M" on the phone's Marcadores button.
function progress(page: Page, done: number, total: number) {
  return page
    .getByText(new RegExp(`^${done} de ${total}( obligatorios)?$`))
    .filter({ visible: true })
    .first();
}

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
  // The first paragraph that matches: a table repeats values ("2022").
  const button = page
    .getByRole("button", {
      name: new RegExp(`^Marcar texto del párrafo «.*${escape(paragraph)}`),
    })
    .first();
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
  // The search narrows the list (typing on a marker goes there too); the
  // arrows go on from it to the marker.
  await page.keyboard.type(marker);
  await expect(
    page.getByRole("searchbox", { name: "Buscar marcador" }),
  ).toHaveValue(marker);
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
  test(`${type}: subir sin marcadores, marcar con teclado, previsualizar y guardar @UAT-26`, async ({
    page,
  }) => {
    await upload(page, type, name);
    await expect(
      page.getByText(new RegExp(`^Nueva plantilla de ${documentName} · `)),
    ).toBeVisible();
    await expect(progress(page, 0, required)).toBeVisible();
    await expectNoTechnicalNames(page);

    for (const marking of markings) await mark(page, marking);
    await expect(progress(page, required, required)).toBeVisible();

    // The title is the name it is saved under: the uploaded file's until
    // the pencil changes it.
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText(name.replace(/\.docx$/, ""));
    await page
      .getByRole("button", { name: /^Cambiar el nombre de la plantilla/ })
      .click();
    const nameBox = page.getByRole("textbox", {
      name: `Nombre de la plantilla de ${documentName}`,
    });
    await expect(nameBox).toBeFocused();
    // An empty name is refused and the box stays open.
    await nameBox.fill("");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toHaveText(
      "Escribe el nombre con el que se guardará la plantilla.",
    );
    // Escape leaves the name as it was.
    await page.keyboard.press("Escape");
    await expect(heading).toHaveText(name.replace(/\.docx$/, ""));
    await page
      .getByRole("button", { name: /^Cambiar el nombre de la plantilla/ })
      .click();
    await nameBox.fill(`Plantilla de ${documentName} e2e`);
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText(`Plantilla de ${documentName} e2e`);

    await saveFromPreview(page);

    await expect(
      page.getByRole("status").filter({ hasText: "Se guardó" }),
    ).toContainText(`ya es la plantilla de ${documentName} en uso`);
    // The newest version, first in the history, is the one in use.
    const newest = page
      .getByRole("region", { name: "Historial de versiones" })
      .getByRole("listitem")
      .first();
    await expect(newest).toContainText(`Plantilla de ${documentName} e2e.docx`);
    await expect(newest).toContainText("Activa");
  });
}

test("con una plantilla activa, guardar pregunta antes de reemplazarla y Cancelar no cambia nada @UAT-26", async ({
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
  // The step takes the focus first, so screen readers announce it.
  await expect(
    page.getByRole("region", { name: "Paso 2 de 3: Marcar" }),
  ).toBeFocused();
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

test("el borrador sobrevive a una recarga y Cancelar pide confirmación si hay marcadores @UAT-26", async ({
  page,
}) => {
  await upload(
    page,
    "Liquidación",
    "plantilla-liquidacion-sin-marcadores.docx",
  );
  await mark(page, LIQUIDATION[0]);

  await page.reload();
  await expect(progress(page, 1, 5)).toBeVisible();
  await expect(
    page.locator(".marking-doc__mark[data-source=lawyer]"),
  ).toContainText("Número de resolución");

  await page.getByRole("button", { name: "Cancelar" }).click();
  const dialog = page.getByRole("dialog", {
    name: "¿Descartar este borrador?",
  });
  await dialog.getByRole("button", { name: "Seguir marcando" }).click();
  await expect(progress(page, 1, 5)).toBeVisible();

  await page.getByRole("button", { name: "Cancelar" }).click();
  await dialog.getByRole("button", { name: "Descartar borrador" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Plantillas" }),
  ).toBeVisible();
});

test("una selección que cruza párrafos se avisa y no asigna nada @UAT-26", async ({
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
  await expect(progress(page, 0, 5)).toBeVisible();

  await page.getByRole("button", { name: "Cancelar" }).click();
});

test("en el teléfono la lista de marcadores es una hoja inferior @UAT-26", async ({
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

test("Configuración solo dice qué plantilla de cada documento está en uso, y lleva a su historial @UAT-26", async ({
  page,
}) => {
  const active = await ensureActiveLiquidationTemplate();
  await page.goto(adminPath("configuracion"));

  const liquidation = page.getByRole("region", {
    name: "Plantilla de liquidación",
  });
  const paymentOrder = page.getByRole("region", {
    name: "Plantilla de mandamiento",
  });
  await expect(liquidation).toContainText("Activa");
  await expect(liquidation).toContainText(/Versión \d+/);
  await expect(paymentOrder).toBeVisible();
  // Side by side on a desktop, both as tall as the taller one.
  const [left, right] = await Promise.all([
    liquidation.boundingBox(),
    paymentOrder.boundingBox(),
  ]);
  if (left && right && left.y === right.y) {
    expect(left.height).toBe(right.height);
  }
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

test("el enlace de consulta pública se ve completo en Configuración y se copia @UAT-26", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(adminPath("configuracion"));

  const link = page.getByRole("region", { name: "Enlace de consulta pública" });
  const address = link.getByLabel("Dirección de la consulta");
  await expect(address).toHaveValue(
    new RegExp(`#/consulta/${E2E_MUNICIPALITY_SLUG}$`),
  );
  await link.getByRole("button", { name: "Copiar enlace" }).click();
  await expect(link.getByRole("status")).toHaveText("Enlace copiado.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    await address.inputValue(),
  );
});

test("cada versión del historial se puede ver antes de activarla @UAT-26", async ({
  page,
}) => {
  // Two saves: the second leaves the first as an earlier version.
  await ensureActiveLiquidationTemplate();
  const active = await ensureActiveLiquidationTemplate();
  await page.reload();

  const history = page.getByRole("region", { name: "Historial de versiones" });
  await history
    .getByRole("button", { name: `Ver la versión ${active.version - 1}` })
    .click();

  const viewer = page.getByRole("dialog", {
    name: `Versión ${active.version - 1} de la plantilla de liquidación`,
  });
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText("Versión anterior");
  await expect(viewer).toContainText(
    /Vista previa con datos de ejemplo ficticios/,
  );
  // Only a desktop shows the PDF inside the page; the screen's own
  // "Reintentar" covers a busy PDF service.
  const ready = viewer
    .locator("iframe")
    .or(viewer.getByRole("button", { name: "Abrir la vista previa" }));
  const retry = viewer.getByRole("button", { name: "Reintentar" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await expect(ready.or(retry)).toBeVisible({ timeout: 30_000 });
    if (await ready.isVisible()) break;
    await retry.click();
  }
  await expect(ready).toBeVisible();

  const download = page.waitForEvent("download");
  await viewer.getByRole("button", { name: "Descargar .docx" }).click();
  expect((await download).suggestedFilename()).toBe(
    "plantilla-liquidacion-sin-marcadores.docx",
  );

  // Activating from the viewer still asks first; cancelling changes nothing.
  await viewer.getByRole("button", { name: "Activar esta versión" }).click();
  const confirm = page.getByRole("dialog", {
    name: `¿Activar la versión ${active.version - 1}?`,
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(
    history.getByRole("listitem").first().getByText("Activa"),
  ).toBeVisible();

  // The active one can be looked at too, with nothing to activate.
  await history
    .getByRole("button", { name: `Ver la versión ${active.version}` })
    .click();
  const current = page.getByRole("dialog", {
    name: `Versión ${active.version} de la plantilla de liquidación`,
  });
  await expect(current.getByText("Activa", { exact: true })).toBeVisible();
  await expect(
    current.getByRole("button", { name: "Activar esta versión" }),
  ).toHaveCount(0);
  await current.getByRole("button", { name: "Cerrar" }).click();
  await expect(current).toBeHidden();
});

test("una tabla llena se marca en su fila de ejemplo y las demás filas se quitan desde la pantalla @UAT-26", async ({
  page,
}) => {
  await upload(page, "Liquidación", "plantilla-liquidacion-tabla-llena.docx");
  for (const marking of [
    {
      paragraph: "RESOLUCIÓN No.",
      text: "RES-0000-2026",
      marker: "Número de resolución",
    },
    {
      paragraph: "Predio con",
      text: "00-00-0000-0000-000",
      marker: "Código catastral del predio",
    },
    { paragraph: "2022»", text: "2022", marker: "Vigencia (año)" },
    {
      paragraph: "$ 371.429»",
      text: "$ 371.429",
      marker: "Valor total a pagar",
    },
  ]) {
    await mark(page, marking);
  }
  await expect(progress(page, 5, 5)).toBeVisible();

  // Marking the example row removed the other rows of values at once:
  // crossed out, explained, and each one can come back.
  const removed = page.locator("tr[data-removed]");
  await expect(removed).toHaveCount(3);
  await expect(
    page.getByText(
      "Se quitaron 3 filas con valores de ejemplo: saldrían iguales en todas las liquidaciones.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/^Deja solo esta fila con los datos de la tabla/),
  ).toBeVisible();
  await expect(page.getByRole("note")).toHaveCount(0);

  // One restored stays restored, and the table says it would print as is.
  await page.getByRole("button", { name: /^Restaurar la fila «2023/ }).click();
  await expect(removed).toHaveCount(2);
  const surplus = page.getByRole("note");
  await expect(surplus).toContainText(
    "Esta tabla tiene 1 fila más con valores de ejemplo.",
  );
  await surplus.getByRole("button", { name: "Quitar esa fila" }).click();
  await expect(removed).toHaveCount(3);
  await expect(surplus).toBeHidden();

  await saveFromPreview(page);
  await expect(
    page.getByRole("status").filter({ hasText: "Se guardó" }),
  ).toBeVisible();

  const texts = await activeLiquidationTexts();
  expect(texts).toContain("{#rows}{year}");
  expect(texts).toContain("{totalAmount}");
  expect(texts).not.toContain("SOBRETASA AMBIENTAL");
  expect(texts).not.toContain("2023");
  expect(texts).not.toContain("2024");
});

test("el menú de marcadores no se mueve al recorrerlo y se cierra si la selección sale de la vista @UAT-26", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "En el teléfono el menú es una hoja inferior fija.");
  // A short window: the document scrolls and the menu has to scroll inside.
  await page.setViewportSize({ width: 1280, height: 560 });
  await upload(page, "Liquidación", "plantilla-liquidacion-tabla-llena.docx");

  const title = page
    .locator(".marking-doc__block", { hasText: "RESOLUCIÓN" })
    .locator("[data-start]")
    .first();
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  const menu = page.locator(".marker-menu");
  await expect(menu).toBeVisible();
  const before = await menu.boundingBox();

  // Down to the end of its list with the wheel: it stays where it was.
  await menu.locator(".marker-menu__list").hover();
  for (let i = 0; i < 10; i += 1) await page.mouse.wheel(0, 200);
  await page.waitForTimeout(300);
  expect(await menu.boundingBox()).toEqual(before);
  await expect(
    menu.getByRole("menuitem", { name: /^Capital de la vigencia/ }),
  ).toBeInViewport();

  // The document scrolled until the selection is out of sight: it closes.
  await page.locator(".guided-marking__document").evaluate((zone) => {
    zone.scrollTop = zone.scrollHeight;
  });
  await expect(menu).toBeHidden();
});

test("ir a un marcador al final del documento no desplaza la pantalla entera @UAT-26", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "En el teléfono la lista está en una hoja inferior.");
  await page.setViewportSize({ width: 1280, height: 560 });
  await upload(page, "Liquidación", "plantilla-liquidacion-tabla-llena.docx");
  await mark(page, {
    paragraph: "$ 371.429»",
    text: "$ 371.429",
    marker: "Valor total a pagar",
  });

  const zone = page.locator(".guided-marking__document");
  await zone.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page
    .getByRole("button", { name: "Ver Valor total a pagar en el documento" })
    .click();
  await page.waitForTimeout(800);

  // Only the document's own area scrolled; nothing around it moved.
  const outside = await zone.evaluate((element) => {
    const moved: string[] = [];
    for (
      let current = element.parentElement;
      current;
      current = current.parentElement
    ) {
      if (current.scrollTop !== 0) moved.push(current.className);
    }
    return { moved, window: window.scrollY, zone: element.scrollTop };
  });
  expect(outside.moved).toEqual([]);
  expect(outside.window).toBe(0);
  expect(outside.zone).toBeGreaterThan(0);
  await expect(
    page.locator(".marking-doc__mark[data-field=totalAmount]"),
  ).toBeInViewport();
});

test("el buscador del menú filtra los marcadores sin importar tildes @UAT-26", async ({
  page,
}) => {
  await upload(
    page,
    "Liquidación",
    "plantilla-liquidacion-sin-marcadores.docx",
  );
  const button = page
    .getByRole("button", { name: /^Marcar texto del párrafo «Resolución No\./ })
    .first();
  await button.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  for (let i = 0; i < 13; i += 1) await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Enter");

  const menu = page.getByRole("menu", { name: "¿Qué dato va aquí?" });
  const search = page.getByRole("searchbox", { name: "Buscar marcador" });
  await expect(menu).toBeVisible();
  await search.fill("codigo catastral");
  await expect(menu.getByRole("menuitem")).toHaveCount(1);
  await expect(menu.getByRole("menuitem")).toContainText(
    "Código catastral del predio",
  );

  await search.fill("xyz");
  await expect(menu.getByRole("menuitem")).toHaveCount(0);
  await expect(menu).toContainText("Ningún marcador coincide con «xyz».");

  // Escape clears the search first, then closes.
  await search.focus();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(menu.getByRole("menuitem").first()).toBeVisible();

  // Enter in the search takes the first marker that fits.
  await search.fill("resolucion");
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(
    page.locator(".marking-doc__mark[data-source=lawyer]"),
  ).toContainText("Número de resolución");
});
