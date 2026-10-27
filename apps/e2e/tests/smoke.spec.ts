import { expect, test } from "@playwright/test";
import { adminCredentials } from "../src/env";
import { adminPath } from "../src/paths";

test("el administrador inicia sesión y llega al panel", async ({ page }) => {
  const { email, password } = adminCredentials();

  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill(email);
  // exact: the "Mostrar contraseña" toggle also matches a substring search.
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(
    page.getByRole("navigation", { name: "Panel Administrador" }),
  ).toBeVisible();

  await page.goto(adminPath("cargas"));
  await expect(page).toHaveURL(/#\/e2e-prueba\/cargas$/);
});
