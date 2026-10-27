# E2E (Playwright)

Pruebas de navegador del panel. Dos proyectos, ambos en Chromium: `desktop`
(1280 × 800) y `mobile` (390 × 844, táctil). Hoy hay la prueba de humo
(login → panel) y la de navegación del menú (`navigation.spec.ts`, SL-170:
grupos, pestañas de Configuración, direcciones antiguas, municipio activo y
teclado); los demás flujos críticos llegan con SL-166.

## Correr en local

1. Levanta el stack (desde la raíz del repo):

   ```bash
   docker compose up -d --build
   docker compose run --rm migrate pnpm --filter shared db:seed
   pnpm --filter frontend dev
   ```

   El seed crea el administrador local (`admin@paez-boyaca.gov.co` /
   `changeme123`, o los `SEED_ADMIN_*` que definas). **Borra los datos de la
   base local.**

2. Instala el navegador (una vez): `pnpm --filter e2e exec playwright install chromium`

3. Corre la suite con las credenciales del administrador de pruebas:

   ```bash
   E2E_ADMIN_EMAIL=admin@paez-boyaca.gov.co E2E_ADMIN_PASSWORD=changeme123 pnpm test:playwright
   ```

   Antes de las pruebas, la suite inicia sesión por API y crea el municipio
   `e2e-prueba` si no existe. El administrador no debe tener pendiente el
   cambio de contraseña (uno creado con `admin:create` sí lo tiene: cámbiala
   una vez desde el panel).

## Variables

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost:5173` | Frontend |
| `E2E_API_URL` | `http://localhost:3000` | Backend |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | — (obligatorias) | Administrador de pruebas |
| `E2E_ALLOW_REMOTE` | — | `1` permite servidores que no sean `localhost` |

## Contra un servidor remoto

La suite se niega a correr si `E2E_BASE_URL` o `E2E_API_URL` no son
`localhost`/`127.0.0.1`/`[::1]`, y se detiene antes de hacer ninguna petición.
Para forzarlo:

```bash
E2E_ALLOW_REMOTE=1 E2E_BASE_URL=https://... E2E_API_URL=https://... pnpm test:playwright
```

Aun así solo opera sobre el municipio `e2e-prueba`. Úsalo solo con un
ambiente donde crear ese municipio sea aceptable.

## Datos de prueba

Los Excel se generan con datos ficticios (nunca se usan datos del cliente):

```bash
pnpm --filter backend run e2e:fixtures   # escribe apps/e2e/fixtures/generated/ (no se versiona)
```

El script vive en el backend porque `exceljs` ya es dependencia de allí.

## Convenciones

- `data-testid` en kebab-case con la forma `<pantalla>-<elemento>` (por
  ejemplo `plantillas-subir`). Se agregan al frontend cuando una prueba de
  SL-166 los pide; mientras tanto se usan roles y etiquetas.
- Reportes: lista en consola y HTML en `playwright-report/` (`pnpm exec playwright show-report`
  desde `apps/e2e`). Captura y traza solo cuando una prueba falla; un reintento en CI.
- `pnpm --filter e2e test:unit` corre las pruebas de la guardia, sin servidores.

## CI

El job `e2e` de `.github/workflows/ci.yml` levanta el stack con Compose, corre
la suite y sube `playwright-report` como artefacto. Es no bloqueante
(`continue-on-error`); pasa a obligatorio cuando SL-166 acumule 3 corridas
verdes seguidas.
