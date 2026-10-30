function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end -= 1;
  return url.slice(0, end);
}

export const baseUrl = stripTrailingSlashes(
  process.env.E2E_BASE_URL || "http://localhost:5173",
);
export const apiUrl = stripTrailingSlashes(
  process.env.E2E_API_URL || "http://localhost:3000",
);
export const allowRemote = process.env.E2E_ALLOW_REMOTE === "1";

// The municipalities the suite reads or writes: the main one and a second one
// for the tests of isolation between municipalities.
export const E2E_MUNICIPALITY_SLUG = "e2e-prueba";
export const E2E_SECOND_MUNICIPALITY_SLUG = "e2e-segundo";

export function adminCredentials(): { email: string; password: string } {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Faltan E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD: son las credenciales del administrador de pruebas (ver apps/e2e/README.md).",
    );
  }
  return { email, password };
}
