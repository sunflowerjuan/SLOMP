import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resetTaxRoll } from "../src/db";
import { fixture } from "../src/fixtures";
import type { FixtureName } from "../src/fixtures";
import { adminPath } from "../src/paths";
import { signIn } from "../src/session";

// Recorrido 2 del SL-166: la carga de cartera. Each test starts from a
// municipality with no tax roll, so the figures are always those of the file.

test.beforeEach(async ({ page }) => {
  resetTaxRoll();
  await signIn(page);
  await page.goto(adminPath("cargas"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Cartera" }),
  ).toBeVisible();
});

async function upload(page: Page, name: FixtureName) {
  await page.locator("input[type=file]").setInputFiles(fixture(name));
  await page.getByRole("button", { name: "Procesar archivo" }).click();
}

function result(page: Page) {
  // The card inside is a region with the same name: take the outer one.
  return page.getByRole("region", { name: "Resultado de la carga" }).first();
}

// The history is closed on a narrow screen until it is asked for.
async function openHistory(page: Page) {
  const toggle = page.getByRole("button", { name: /Historial de cargas/ });
  if (!(await page.getByText("cartera-valida.xlsx").first().isVisible())) {
    await toggle.click();
  }
}

test("un Excel válido muestra los conteos del archivo @UAT-01", async ({
  page,
}) => {
  await upload(page, "cartera-valida.xlsx");

  // 3 properties with the periods 2024 and 2025: 6 settlements (the figure
  // follows its label in the text).
  await expect(result(page)).toContainText(/liquidaciones generadas\s*6/);
  await expect(result(page)).toContainText(/predios procesados\s*3/);
  await expect(result(page)).toContainText(/propietarios procesados\s*3/);
  await expect(result(page)).toContainText(/filas inválidas omitidas\s*0/);
});

test("un archivo al que le falta una columna muestra el error y no importa nada @UAT-02", async ({
  page,
}) => {
  await upload(page, "cartera-invalida.xlsx");

  await expect(
    page.getByText(/Las columnas del Excel no coinciden con el formato/),
  ).toBeVisible();
  await expect(result(page)).toBeHidden();
});

test("una fila con periodo fuera de rango se omite con su motivo @UAT-03", async ({
  page,
}) => {
  await upload(page, "cartera-fila-invalida.xlsx");

  await expect(result(page)).toContainText(/fila inválida omitida\s*1/);
  await expect(result(page)).toContainText(
    "El periodo 1979 está fuera de rango",
  );
});

test("el historial lista la carga con su estado @UAT-01", async ({ page }) => {
  await upload(page, "cartera-valida.xlsx");
  await expect(result(page)).toBeVisible();

  await openHistory(page);
  await expect(page.getByText("cartera-valida.xlsx").first()).toBeVisible();
  await expect(page.getByText("Procesado", { exact: true })).toBeVisible();
});
