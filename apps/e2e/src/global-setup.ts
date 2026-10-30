import {
  E2E_MUNICIPALITY_SLUG,
  E2E_SECOND_MUNICIPALITY_SLUG,
  adminCredentials,
  allowRemote,
  apiUrl,
  baseUrl,
} from "./env";
import { ensureFixtures } from "./fixtures";
import { assertSafeTarget } from "./guard";

interface Session {
  accessToken: string;
  mustChangePassword: boolean;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${apiUrl}${path}`, init);
  } catch {
    throw new Error(
      `No se pudo conectar con la API en ${apiUrl}. ¿Está levantado el backend? (ver apps/e2e/README.md)`,
    );
  }
}

// Runs before any test: checks the target, writes the test Excel files if
// they are missing, signs in through the API and makes sure the test
// municipality exists. Nothing is requested before the guard.
export default async function globalSetup(): Promise<void> {
  assertSafeTarget({ baseUrl, apiUrl }, allowRemote);
  ensureFixtures();
  const { email, password } = adminCredentials();

  const login = await request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    throw new Error(
      `El login del administrador de pruebas falló (${login.status}). Revisa E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD.`,
    );
  }
  const session = (await login.json()) as Session;
  if (session.mustChangePassword) {
    throw new Error(
      "El administrador de pruebas debe cambiar su contraseña (se creó con admin:create). Cámbiala una vez desde el panel y vuelve a correr la suite.",
    );
  }

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
  const list = await request("/municipalities", { headers });
  if (!list.ok) {
    throw new Error(`No se pudo listar los municipios (${list.status}).`);
  }
  const municipalities = (await list.json()) as { slug: string }[];
  const existing = new Set(municipalities.map((m) => m.slug));

  for (const municipality of [
    {
      name: "Municipio de prueba E2E",
      daneCode: "99999",
      slug: E2E_MUNICIPALITY_SLUG,
    },
    {
      name: "Segundo municipio de prueba E2E",
      daneCode: "99998",
      slug: E2E_SECOND_MUNICIPALITY_SLUG,
    },
  ]) {
    if (existing.has(municipality.slug)) continue;
    const created = await request("/municipalities", {
      method: "POST",
      headers,
      body: JSON.stringify({ state: "Prueba", ...municipality }),
    });
    if (!created.ok) {
      throw new Error(
        `No se pudo crear el municipio ${municipality.slug} (${created.status}). Si el código DANE ${municipality.daneCode} ya lo usa otro municipio, resuélvelo a mano.`,
      );
    }
  }
}
