import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resetTaxRoll } from "../src/db";
import { expectPdf, zipEntryNames } from "../src/downloads";
import {
  ensureActiveLiquidationTemplate,
  issueResolutions,
  loadTaxRoll,
} from "../src/fixtures";
import { adminPath } from "../src/paths";
import { signIn } from "../src/session";

// Recorrido 3 del SL-166: buscar, abrir el detalle y generar el PDF individual
// y el lote en ZIP. Generating issues a resolution, so every test starts from
// a clean tax roll with the active template.

// Fictional property of cartera-valida.xlsx.
const CODE = "999990001000000010001";
const OWNER = "Propietario Prueba Uno";

test.beforeEach(async ({ page }) => {
  resetTaxRoll();
  await loadTaxRoll("cartera-valida.xlsx");
  await ensureActiveLiquidationTemplate();
  await signIn(page);
});

async function search(page: Page) {
  await page.goto(adminPath("liquidaciones"));
  await page.getByRole("searchbox", { name: "Cédula" }).fill(CODE);
  await page.getByRole("button", { name: "Buscar" }).click();
  const row = page.getByRole("row").filter({ hasText: CODE });
  await expect(row).toBeVisible();
  return row;
}

test("buscar por código catastral encuentra el predio con su propietario @UAT-12", async ({
  page,
}) => {
  const row = await search(page);
  await expect(row).toContainText(OWNER);
});

test("el detalle agrega lo que la fila no tiene @UAT-N/A", async ({ page }) => {
  const row = await search(page);
  await row.click();

  const detail = page.getByRole("complementary", {
    name: "Detalle de la liquidación",
  });
  await expect(detail).toContainText("Lote de Prueba 1");
  await expect(detail).not.toContainText(OWNER);
  await expect(detail).not.toContainText(CODE);
});

test("el estado se cambia por periodo: los demás conservan el suyo @UAT-15", async ({
  page,
}) => {
  await issueResolutions([CODE]);
  const row = await search(page);
  await expect(row.getByRole("button", { name: /Cambiar estado/ })).toHaveCount(
    0,
  );

  const detail = page.getByRole("complementary", {
    name: "Detalle de la liquidación",
  });
  const period = (year: number) =>
    detail.getByRole("listitem").filter({ hasText: String(year) });

  async function markPaid(year: number) {
    await row.click();
    await period(year)
      .getByRole("button", { name: /Cambiar estado/ })
      .click();
    await period(year).getByRole("combobox").selectOption("PAGADA");
    await period(year)
      .getByRole("button", { name: "Confirmar cambio de estado" })
      .click();
    await expect(
      page.getByText(`Estado del periodo ${year} actualizado a «Pagada».`),
    ).toBeVisible();
  }

  await markPaid(2024);
  await expect(period(2024)).toContainText("Pagada");
  await expect(period(2025)).toContainText("Vigente");
  await detail.getByRole("button", { name: "Cerrar detalle" }).click();
  await expect(row).toContainText("Varios estados");

  // What was saved, not only what the screen painted.
  await search(page);
  await expect(row).toContainText("Varios estados");

  // The second period of a resolution can be changed too.
  await markPaid(2025);
  await detail.getByRole("button", { name: "Cerrar detalle" }).click();
  await expect(row).toContainText("Pagada");
  await expect(row).not.toContainText("Varios estados");
});

test("una búsqueda fallida tiene su propio estado y se reintenta @UAT-N/A", async ({
  page,
}) => {
  await page.goto(adminPath("liquidaciones"));
  await page.route("**/settlements/search*", (route) => route.abort());
  await page.getByRole("searchbox", { name: "Cédula" }).fill(CODE);
  await page.getByRole("button", { name: "Buscar" }).click();

  await expect(page.getByText("No pudimos hacer la búsqueda")).toBeVisible();
  await expect(page.getByText("Busca una liquidación")).toBeHidden();

  await page.unroute("**/settlements/search*");
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("row").filter({ hasText: CODE })).toBeVisible();
});

test("generar el PDF individual descarga un PDF que no está vacío @UAT-05", async ({
  page,
}, testInfo) => {
  const row = await search(page);
  await row.click();
  await page
    .getByRole("complementary", { name: "Detalle de la liquidación" })
    .getByRole("button", { name: "Generar PDF" })
    .click();

  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog", { name: "Generar liquidación oficial" })
    .getByRole("button", { name: "Generar", exact: true })
    .click();
  const path = testInfo.outputPath("liquidacion.pdf");
  await (await download).saveAs(path);

  expectPdf(path);
});

test("con su resolución, el PDF sale de la hoja sin volver a confirmar @UAT-05", async ({
  page,
}, testInfo) => {
  await issueResolutions([CODE]);
  const row = await search(page);
  await row.click();

  const download = page.waitForEvent("download");
  await page
    .getByRole("complementary", { name: "Detalle de la liquidación" })
    .getByRole("button", { name: "Generar PDF" })
    .click();
  const path = testInfo.outputPath("liquidacion.pdf");
  await (await download).saveAs(path);

  expectPdf(path);
});

test("el lote en ZIP avanza, baja y trae las liquidaciones en su carpeta @UAT-09", async ({
  page,
}, testInfo) => {
  await page.goto(adminPath("cargas"));
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Generar ZIP de liquidaciones actuales" })
    .click();

  await expect(
    page.getByRole("progressbar", {
      name: "Progreso de la generación del ZIP",
    }),
  ).toBeVisible();
  const path = testInfo.outputPath("liquidaciones.zip");
  await (await download).saveAs(path);

  const names = zipEntryNames(path);
  // The fixture's periods (2024, 2025) are current ones: their folder is
  // "desde hace 5 años" (the backend's bulkFolder), one PDF per resolution.
  const folder = `Liquidaciones ${new Date().getFullYear() - 4} en adelante/`;
  expect(names.length).toBe(3);
  for (const name of names) {
    expect(name.startsWith(folder) && name.endsWith(".pdf")).toBe(true);
  }
});
