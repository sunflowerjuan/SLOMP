import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { adminCredentials } from "./env";

// Signs in through the login screen and waits for the panel. Every test signs
// in on its own: the refresh token rotates, so a saved session can't be
// shared between tests.
export async function signIn(page: Page): Promise<void> {
  const { email, password } = adminCredentials();

  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill(email);
  // exact: the "Mostrar contraseña" toggle also matches a substring search.
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(
    page.getByRole("navigation", { name: "Panel Administrador" }),
  ).toBeVisible();
}
