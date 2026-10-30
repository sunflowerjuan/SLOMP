import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { makeSettlementsFirm, resetTaxRoll } from "../src/db";
import { expectPdf, zipEntryNames } from "../src/downloads";
import {
  ensureActiveLiquidationTemplate,
  ensureActivePaymentOrderTemplate,
  fixture,
  issueResolutions,
  loadTaxRoll,
} from "../src/fixtures";
import { adminPath } from "../src/paths";
import { signIn } from "../src/session";

// Recorrido 4 del SL-166: generar mandamientos. They only cover "En firme"
// liquidations (60 days after the resolution), so each test issues the
// resolutions of cartera-valida.xlsx and ages them before opening the panel.
// The same file is then the Excel of the periods to collect.

const CODES = [
  "999990001000000010001",
  "999990001000000020001",
  "999990002000010000001",
];

test.beforeEach(async ({ page }) => {
  resetTaxRoll();
  await loadTaxRoll("cartera-valida.xlsx");
  await ensureActiveLiquidationTemplate();
  await ensureActivePaymentOrderTemplate();
  await issueResolutions(CODES);
  makeSettlementsFirm();
  await signIn(page);
  await page.goto(adminPath("mandamientos"));
});

test.afterAll(() => {
  // The other Mandamientos tests expect liquidations without a resolution.
  resetTaxRoll();
});

async function reviewAndContinue(page: Page) {
  await page
    .locator("input[type=file]")
    .setInputFiles(fixture("cartera-valida.xlsx"));
  await page.getByRole("button", { name: "Revisar archivo" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(
    page.getByRole("region", { name: /^Paso 3 de 3/ }),
  ).toBeVisible();
}

test("con las liquidaciones en firme se ven elegibles y se generan uno por uno @UAT-30", async ({
  page,
}, testInfo) => {
  await page
    .locator("input[type=file]")
    .setInputFiles(fixture("cartera-valida.xlsx"));
  await page.getByRole("button", { name: "Revisar archivo" }).click();
  await expect(
    page.getByText("3 predios, 6 periodos elegibles, 0 no elegibles"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page
    .getByRole("button", {
      name: `Generar el mandamiento del predio ${CODES[0]}`,
    })
    .click();
  await page
    .getByRole("dialog", { name: "Generar mandamiento" })
    .getByRole("button", { name: "Generar" })
    .click();

  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /^Descargar el PDF del mandamiento/ })
    .click();
  const path = testInfo.outputPath("mandamiento.pdf");
  await (await download).saveAs(path);
  expectPdf(path);
});

test("generar el lote en ZIP baja los mandamientos @UAT-30", async ({
  page,
}, testInfo) => {
  await reviewAndContinue(page);

  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Generar ZIP de mandamientos" })
    .click();
  await expect(
    page.getByRole("progressbar", {
      name: "Progreso de la generación del ZIP",
    }),
  ).toBeVisible();
  const path = testInfo.outputPath("mandamientos.zip");
  await (await download).saveAs(path);

  const names = zipEntryNames(path);
  expect(names.length).toBe(3);
  for (const name of names) {
    expect(name).toMatch(/^Mandamientos de pago\/MP-.+\.pdf$/);
  }
});
