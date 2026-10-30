import { expect, test } from "@playwright/test";
import { adminPath } from "../src/paths";
import { signIn } from "../src/session";

test("el administrador inicia sesión y llega al panel @UAT-01", async ({
  page,
}) => {
  await signIn(page);

  await page.goto(adminPath("cargas"));
  await expect(page).toHaveURL(/#\/e2e-prueba\/cargas$/);
});
