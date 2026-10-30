import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { E2E_MUNICIPALITY_SLUG } from "../src/env";
import { adminPath } from "../src/paths";
import { signIn } from "../src/session";

// SL-170: the menu in two groups, Configuración as one panel (the old
// addresses, its former tabs among them, lead there), and the active
// municipality always in sight. It
// runs on both projects: desktop and a 390 px phone.

// Created by the global setup: "Municipio de prueba E2E, Prueba".
const MUNICIPALITY = /Municipio de prueba E2E/;

const VIEWS = [
  "cargas",
  "liquidaciones",
  "mandamientos",
  "configuracion",
  "configuracion/plantillas/liquidacion",
];

function menu(page: Page) {
  return page.getByRole("navigation", { name: "Panel Administrador" });
}

function municipalityPill(page: Page) {
  return page.getByRole("button", { name: /^Municipio:/ });
}

function viewUrl(view: string): RegExp {
  return new RegExp(`#/${E2E_MUNICIPALITY_SLUG}/${view}$`);
}

// Opens an address of the test municipality and waits until the panel shows
// it (moving to a screen also moves the focus to its content).
async function open(page: Page, view: string) {
  await page.goto(adminPath(view));
  await expect(municipalityPill(page)).toContainText(MUNICIPALITY);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("el menú muestra Operación y Configuración, sin otras entradas @UAT-N/A", async ({
  page,
  isMobile,
}) => {
  await open(page, "cargas");

  await expect(menu(page).getByRole("group")).toHaveCount(2);
  await expect(
    menu(page).getByRole("group", { name: "Operación" }).getByRole("link"),
  ).toHaveText(["Cartera", "Liquidaciones", "Mandamientos"]);
  await expect(
    menu(page).getByRole("group", { name: "Configuración" }).getByRole("link"),
  ).toHaveText(["Configuración"]);
  // The group titles are not links.
  await expect(menu(page).getByRole("link")).toHaveCount(4);

  // Cerrar sesión stays apart: at the foot of the sidebar, or in the logo
  // menu on a phone.
  if (isMobile) {
    await page.getByRole("button", { name: "Menú" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Cerrar sesión" }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeVisible();
  }
});

test("cada entrada del menú lleva a su pantalla y queda marcada @UAT-N/A", async ({
  page,
}) => {
  await open(page, "cargas");

  for (const [name, view] of [
    ["Liquidaciones", "liquidaciones"],
    ["Mandamientos", "mandamientos"],
    ["Configuración", "configuracion"],
    ["Cartera", "cargas"],
  ]) {
    const link = menu(page).getByRole("link", { name, exact: true });
    await link.click();
    await expect(page).toHaveURL(viewUrl(view));
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(menu(page).locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test("las direcciones antiguas llevan al panel de Configuración @UAT-N/A", async ({
  page,
}) => {
  for (const old of [
    "plantillas",
    "consulta-publica",
    "configuracion/plantillas",
    "configuracion/consulta",
  ]) {
    await open(page, old);
    await expect(page).toHaveURL(viewUrl("configuracion"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Configuración",
    );
  }
  await expect(
    menu(page).getByRole("link", { name: "Configuración" }),
  ).toHaveAttribute("aria-current", "page");

  // One panel: the templates in use and the consultation link, no tabs.
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Plantilla de liquidación" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Enlace de consulta pública" }),
  ).toBeVisible();

  // A templates screen still belongs to Configuración in the menu.
  await open(page, "configuracion/plantillas/mandamiento");
  await expect(
    menu(page).getByRole("link", { name: "Configuración" }),
  ).toHaveAttribute("aria-current", "page");
});

test("el municipio activo se ve en cada pantalla y su pastilla abre el selector @UAT-28", async ({
  page,
}) => {
  for (const view of VIEWS) {
    await open(page, view);
    // Seen without opening any menu, and never two selectors.
    await expect(municipalityPill(page)).toHaveCount(1);
    await expect(municipalityPill(page)).toBeInViewport();
  }

  await municipalityPill(page).click();
  const list = page.getByRole("menu", { name: "Municipios" });
  await expect(
    list.getByRole("menuitemradio", { name: MUNICIPALITY }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    list.getByRole("menuitem", { name: "Agregar municipio" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(municipalityPill(page)).toBeFocused();
});

test("el menú se recorre con teclado y el enlace de salto lleva al contenido @UAT-N/A", async ({
  page,
  isMobile,
}) => {
  await open(page, "cargas");

  // First stop of the page; it jumps to the content without changing the
  // address (the hash is the route).
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await expect(page).toHaveURL(viewUrl("cargas"));

  await skip.focus();
  await page.keyboard.press("Tab");
  await expect(menu(page).getByRole("link", { name: "Cartera" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(
    menu(page).getByRole("link", { name: "Liquidaciones" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(viewUrl("liquidaciones"));

  // On a phone, Escape closes the logo menu and gives the focus back.
  if (isMobile) {
    const logo = page.getByRole("button", { name: "Menú" });
    await logo.click();
    await expect(
      page.getByRole("menuitem", { name: "Cerrar sesión" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Menú" })).toBeHidden();
    await expect(logo).toBeFocused();
  }
});
