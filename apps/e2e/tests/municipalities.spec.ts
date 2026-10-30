import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resetTaxRoll } from "../src/db";
import {
  E2E_SECOND_MUNICIPALITY_SLUG,
  E2E_MUNICIPALITY_SLUG,
} from "../src/env";
import { loadTaxRoll } from "../src/fixtures";
import { signIn } from "../src/session";

// Recorrido 6 del SL-166: cambiar de municipio cambia los datos y la URL, y
// dos pestañas con municipios distintos no se mezclan. Only the main
// municipality has a tax roll; the second one is empty.

const CODE = "999990001000000010001";
const MAIN = /Municipio de prueba E2E/;
const SECOND = /Segundo municipio de prueba E2E/;

test.beforeEach(async () => {
  resetTaxRoll();
  await loadTaxRoll("cartera-valida.xlsx");
});

function pill(page: Page) {
  return page.getByRole("button", { name: /^Municipio:/ });
}

async function searchByCode(page: Page, slug: string) {
  await page.goto(`/#/${slug}/liquidaciones`);
  await page.getByRole("searchbox", { name: "Cédula" }).fill(CODE);
  await page.getByRole("button", { name: "Buscar" }).click();
}

test("cambiar de municipio en el selector cambia los datos y la URL @UAT-28", async ({
  page,
}) => {
  await signIn(page);
  await searchByCode(page, E2E_MUNICIPALITY_SLUG);
  await expect(page.getByRole("row").filter({ hasText: CODE })).toBeVisible();

  await pill(page).click();
  await page
    .getByRole("menu", { name: "Municipios" })
    .getByRole("menuitemradio", { name: SECOND })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`#/${E2E_SECOND_MUNICIPALITY_SLUG}/`),
  );
  await expect(pill(page)).toContainText(SECOND);
  await page.getByRole("searchbox", { name: "Cédula" }).fill(CODE);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByRole("row").filter({ hasText: CODE })).toHaveCount(0);
});

test("dos pestañas con municipios distintos no se mezclan @UAT-28", async ({
  page,
}) => {
  await signIn(page);
  await searchByCode(page, E2E_MUNICIPALITY_SLUG);
  await expect(page.getByRole("row").filter({ hasText: CODE })).toBeVisible();

  // The second tab shares the session (same browser context).
  const other = await page.context().newPage();
  await searchByCode(other, E2E_SECOND_MUNICIPALITY_SLUG);
  await expect(pill(other)).toContainText(SECOND);
  await expect(other.getByRole("row").filter({ hasText: CODE })).toHaveCount(0);

  // The first one still shows its own municipality and data, even reloaded.
  await expect(pill(page)).toContainText(MAIN);
  await page.reload();
  await expect(pill(page)).toContainText(MAIN);
  await expect(page).toHaveURL(new RegExp(`#/${E2E_MUNICIPALITY_SLUG}/`));
});
