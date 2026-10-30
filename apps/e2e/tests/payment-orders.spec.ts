import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resetTaxRoll } from "../src/db";
import { fixture, loadTaxRoll } from "../src/fixtures";
import type { FixtureName } from "../src/fixtures";
import { adminPath } from "../src/paths";
import { signIn } from "../src/session";

// SL-173: Mandamientos in steps (Cargar, Revisar, Generar) with the history
// in its own tab. It runs on both projects: desktop and a 390 px phone.
// Reviewing an Excel saves nothing; the tax roll loaded first gives its
// properties liquidations without a resolution, so none is eligible yet
// and the flow stops at "Revisar" (issuing needs "En firme", 60 days later).

test.beforeAll(async () => {
  // Other files issue resolutions in this municipality: start without any.
  resetTaxRoll();
  await loadTaxRoll("cartera-valida.xlsx");
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.goto(adminPath("mandamientos"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Mandamientos" }),
  ).toBeVisible();
});

function currentStep(page: Page) {
  return page.getByRole("region", { name: /^Paso \d de 3/ });
}

async function review(page: Page, name: FixtureName) {
  await page.locator("input[type=file]").setInputFiles(fixture(name));
  await page.getByRole("button", { name: "Revisar archivo" }).click();
}

test("cargar un Excel válido pasa solo a Revisar, con su resumen y sin poder continuar @UAT-29", async ({
  page,
  isMobile,
}) => {
  await expect(currentStep(page)).toHaveAccessibleName("Paso 1 de 3: Cargar");
  const steps = page.getByRole("list", {
    name: "Pasos para generar mandamientos",
  });
  await expect(steps.getByRole("listitem").nth(0)).toHaveAttribute(
    "aria-current",
    "step",
  );

  await review(page, "cartera-valida.xlsx");

  await expect(currentStep(page)).toHaveAccessibleName("Paso 2 de 3: Revisar");
  // The new step takes the focus, so screen readers announce it.
  await expect(currentStep(page)).toBeFocused();
  await expect(steps.getByRole("listitem").nth(1)).toHaveAttribute(
    "aria-current",
    "step",
  );
  // A phone reads where the flow is in one line.
  const compact = page.locator(".ui-steps__compact");
  if (isMobile) {
    await expect(compact).toBeVisible();
    await expect(compact).toHaveText("Paso 2 de 3: Revisar");
  } else {
    await expect(compact).toBeHidden();
  }

  await expect(
    page.getByText("3 predios, 0 periodos elegibles, 6 no elegibles"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
  await expect(
    page.getByText("No hay mandamientos por generar en este archivo."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "No elegibles" }),
  ).toBeVisible();
  // Only the blocks of this step: no upload area, no history.
  await expect(
    page.getByRole("button", { name: "Revisar archivo" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Mandamientos emitidos" }),
  ).toHaveCount(0);
});

test("un Excel con filas inválidas se queda en Cargar con su motivo @UAT-29", async ({
  page,
}) => {
  await review(page, "cartera-fila-invalida.xlsx");

  const invalid = page.getByRole("region", { name: "Filas inválidas" });
  await expect(invalid).toBeVisible();
  await expect(invalid).toContainText(
    "El archivo tiene 1 fila inválida y no se puede revisar.",
  );
  await expect(invalid.getByRole("listitem")).toContainText(["1979"]);
  await expect(currentStep(page)).toHaveAccessibleName("Paso 1 de 3: Cargar");
  await expect(page.getByRole("button", { name: "Continuar" })).toHaveCount(0);
});

test("el paso se conserva al ir al Historial y volver @UAT-29", async ({
  page,
}) => {
  await review(page, "cartera-valida.xlsx");
  await expect(currentStep(page)).toHaveAccessibleName("Paso 2 de 3: Revisar");

  await page.getByRole("radio", { name: "Historial" }).click();
  await expect(
    page.getByRole("region", { name: "Mandamientos emitidos" }),
  ).toBeVisible();
  await expect(page.getByLabel("Buscar por cédula catastral")).toBeVisible();
  // The steps live only in "Generar".
  await expect(currentStep(page)).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Pasos para generar mandamientos" }),
  ).toHaveCount(0);

  await page.getByRole("radio", { name: "Generar" }).click();
  await expect(currentStep(page)).toHaveAccessibleName("Paso 2 de 3: Revisar");
  await expect(
    page.getByText("3 predios, 0 periodos elegibles, 6 no elegibles"),
  ).toBeVisible();
});

test("con teclado, Cambiar archivo vuelve a Cargar sin archivo @UAT-29", async ({
  page,
}) => {
  await review(page, "cartera-valida.xlsx");
  await expect(currentStep(page)).toBeFocused();

  // "Continuar" is off, so the step's previous stop is "Cambiar archivo".
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Cambiar archivo" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(currentStep(page)).toHaveAccessibleName("Paso 1 de 3: Cargar");
  await expect(currentStep(page)).toBeFocused();
  await expect(page.getByRole("button", { name: "Quitar" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Revisar archivo" }),
  ).toBeDisabled();
});
