import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { adminCredentials } from "../src/env";
import { adminPath } from "../src/paths";
import { signIn } from "../src/session";

// Recorrido 1 del SL-166: login, contraseña incorrecta, cierre de sesión,
// inactividad y renovación. The two clock tests install Playwright's clock
// before the page loads (it only controls timers created after that) and
// then move it forward: nothing waits for real.

const IDLE_MINUTES = 30; // SESSION_IDLE_TIMEOUT_MINUTES default
const ACCESS_TOKEN_MINUTES = 15; // ACCESS_TOKEN_TTL_MINUTES default

function panelMenu(page: Page) {
  return page.getByRole("navigation", { name: "Panel Administrador" });
}

test("el administrador inicia sesión y llega al panel @UAT-01", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("una contraseña incorrecta muestra el mensaje en español y no entra @UAT-23", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill(adminCredentials().email);
  await page.getByLabel("Contraseña", { exact: true }).fill("no-es-la-clave");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(
    page.getByText("Correo o contraseña incorrectos."),
  ).toBeVisible();
  await expect(panelMenu(page)).toBeHidden();
});

test("cerrar sesión vuelve al login y el panel exige iniciar sesión otra vez @UAT-23", async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  // On a phone "Cerrar sesión" lives in the menu behind the "Menú" button.
  if (isMobile) await page.getByRole("button", { name: "Menú" }).click();
  await page
    .getByRole("button", { name: "Cerrar sesión" })
    .or(page.getByRole("menuitem", { name: "Cerrar sesión" }))
    .first()
    .click();
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();

  await page.goto(adminPath("liquidaciones"));
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await expect(panelMenu(page)).toBeHidden();
});

test("la sesión se cierra por inactividad y el login lo avisa @UAT-24", async ({
  page,
}) => {
  await page.clock.install({ time: new Date() });
  await signIn(page);

  // The check runs every 15 s; one minute past the limit is enough.
  await page.clock.fastForward(`${IDLE_MINUTES + 1}:00`);

  await expect(
    page.getByText("Cerramos tu sesión porque estuvo inactiva."),
  ).toBeVisible();
  await expect(panelMenu(page)).toBeHidden();
});

test("con actividad la sesión se renueva antes de vencer @UAT-24", async ({
  page,
}) => {
  await page.clock.install({ time: new Date() });
  await signIn(page);

  // Use the panel, then get near the access token's end (it is renewed one
  // minute before) without passing the idle limit.
  await page.mouse.click(5, 5);
  const refreshed = page.waitForRequest(
    (request) =>
      request.url().endsWith("/auth/refresh") && request.method() === "POST",
  );
  await page.clock.fastForward(`${ACCESS_TOKEN_MINUTES - 1}:00`);
  await page.clock.runFor(30_000);
  await refreshed;

  await expect(panelMenu(page)).toBeVisible();
});
