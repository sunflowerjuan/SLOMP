import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resetTaxRoll } from "../src/db";
import { expectPdf, zipEntryNames } from "../src/downloads";
import { ensureActiveLiquidationTemplate, loadTaxRoll } from "../src/fixtures";
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

test("abrir el detalle muestra propietario, cédula y dirección @UAT-12", async ({
  page,
}) => {
  const row = await search(page);
  await row.click();

  const detail = page.getByRole("complementary", {
    name: "Detalle de la liquidación",
  });
  await expect(detail).toContainText(OWNER);
  await expect(detail).toContainText(CODE);
  await expect(detail).toContainText("Lote de Prueba 1");
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
