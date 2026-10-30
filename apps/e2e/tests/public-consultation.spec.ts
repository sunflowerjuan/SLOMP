import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiUrl, E2E_MUNICIPALITY_SLUG } from "../src/env";
import {
  ensureActiveLiquidationTemplate,
  issueResolutions,
  loadTaxRoll,
} from "../src/fixtures";
import { resetTaxRoll } from "../src/db";

// Recorrido 7 del SL-166: la consulta pública (sin sesión) de un municipio.
// Desktop only: the iframe and the request limit don't depend on the width,
// and the limit is counted per municipality and client for a minute, so the
// test that exhausts it goes last and nothing after it queries.
test.skip(({ isMobile }) => isMobile, "No depende del ancho de pantalla");

// Fictional owner and property of cartera-valida.xlsx.
const CODE = "999990001000000010001";
const OWNER = "Propietario Prueba Uno";
const ADDRESS = "Lote de Prueba 1";

const PAGE_URL = `/#/consulta/${E2E_MUNICIPALITY_SLUG}`;

// The consultation lists only liquidations whose resolution was issued.
test.beforeAll(async () => {
  resetTaxRoll();
  await loadTaxRoll("cartera-valida.xlsx");
  await ensureActiveLiquidationTemplate();
  await issueResolutions([CODE]);
});

async function consult(
  page: Page,
  data: { code?: string; owner?: string; address?: string },
) {
  if (data.code) await page.getByLabel("Cédula catastral").fill(data.code);
  if (data.owner) await page.getByLabel("Propietario").fill(data.owner);
  if (data.address)
    await page.getByLabel("Dirección del predio").fill(data.address);
  await page.getByRole("button", { name: "Consultar" }).click();
}

function results(page: Page) {
  return page.getByRole("region", { name: "Resultado de la consulta" });
}

test("con 2 de 3 datos exactos devuelve las liquidaciones vigentes del predio @UAT-20", async ({
  page,
}) => {
  await page.goto(PAGE_URL);
  await consult(page, { code: CODE, owner: OWNER });

  await expect(
    results(page).getByText("Liquidaciones del predio"),
  ).toBeVisible();
  await expect(results(page)).toContainText(CODE);
  // The two periods of the property.
  await expect(results(page)).toContainText("2024");
  await expect(results(page)).toContainText("2025");
});

test("con 1 solo dato lo rechaza y no sugiere ningún predio @UAT-21", async ({
  page,
}) => {
  await page.goto(PAGE_URL);
  await consult(page, { code: CODE });

  await expect(page.getByRole("button", { name: "Consultar" })).toBeVisible();
  await expect(results(page)).not.toContainText(OWNER);
  await expect(results(page)).not.toContainText("Liquidaciones del predio");
});

test("con 2 datos de los que uno no es exacto no encuentra nada @UAT-21", async ({
  page,
}) => {
  await page.goto(PAGE_URL);
  await consult(page, { code: CODE, owner: "Propietario Prueba" });

  await expect(
    results(page).getByText("No encontramos liquidaciones vigentes"),
  ).toBeVisible();
  await expect(results(page)).not.toContainText(CODE);
});

test("la página funciona dentro de un iframe @UAT-22", async ({ page }) => {
  await page.goto("/");
  await page.setContent(
    `<iframe title="Consulta" src="${new URL(PAGE_URL, page.url()).href}" width="900" height="900"></iframe>`,
  );
  const frame = page.frameLocator("iframe");
  await frame.getByLabel("Cédula catastral").fill(CODE);
  await frame.getByLabel("Dirección del predio").fill(ADDRESS);
  await frame.getByRole("button", { name: "Consultar" }).click();

  await expect(
    frame.getByRole("region", { name: "Resultado de la consulta" }),
  ).toContainText(CODE);
});

// Last: it spends the municipality's budget of public requests for a minute.
test("superar el límite de consultas muestra el aviso de espera @UAT-25", async ({
  page,
  request,
}) => {
  await page.goto(PAGE_URL);
  await expect(page.getByLabel("Cédula catastral")).toBeVisible();

  // Past the limit (30 a minute) the API answers 429; the loop ends there.
  let limited = false;
  for (let sent = 0; sent < 60 && !limited; sent += 1) {
    const response = await request.post(
      `${apiUrl}/consulta-publica/${E2E_MUNICIPALITY_SLUG}`,
      { data: { cadastralCode: CODE, ownerName: OWNER } },
    );
    limited = response.status() === 429;
  }
  expect(limited).toBe(true);

  await consult(page, { code: CODE, owner: OWNER });
  await expect(
    page.getByText("Realizaste demasiadas consultas en poco tiempo."),
  ).toBeVisible();
});
