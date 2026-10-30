# E2E (Playwright)

Pruebas de navegador del panel. Dos proyectos, ambos en Chromium: `desktop`
(1280 × 800) y `mobile` (390 × 844, táctil). Cada prueba lleva en su título la
etiqueta del caso del plan de aceptación que cubre (`@UAT-05`); las que son
solo de interfaz y no tienen caso llevan `@UAT-N/A`. Con esas etiquetas se
arma la matriz de trazabilidad (SL-167) y se filtra una corrida:
`pnpm --filter e2e exec playwright test --grep @UAT-05`.

| Área | Archivo | Proyectos |
| --- | --- | --- |
| Autenticación | `auth.spec.ts` (más `smoke.spec.ts`) | ambos |
| Cartera | `tax-roll.spec.ts` | ambos |
| Liquidaciones | `settlements.spec.ts` | ambos |
| Mandamientos | `payment-orders.spec.ts` (Cargar y Revisar, SL-173), `payment-orders-generate.spec.ts` (generar) | ambos |
| Plantillas | `templates.spec.ts` (marcado guiado SL-160, plantilla inválida, versión siguiente, historial, ver la plantilla guardada SL-174) | ambos |
| Municipios | `municipalities.spec.ts` | ambos |
| Consulta pública | `public-consultation.spec.ts` | solo `desktop` (no depende del ancho; el límite de consultas se cuenta por minuto) |
| Navegación | `navigation.spec.ts` (SL-170) | ambos |

Falta Slompsim (SL-156): no está en `develop`, así que su recorrido queda
fuera de esta entrega, como lo prevé el ticket.

Todos los archivos comparten el municipio `e2e-prueba`, así que la suite corre
con un solo worker y en orden de nombre de archivo, sin reintentos. Cada prueba
prepara sus datos al empezar (`src/db.ts` deja el municipio sin cartera y
`src/fixtures.ts` carga lo que necesita); ninguna depende del orden.

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

   Las pruebas de plantillas guardan borradores, vistas previas y versiones
   en Storage: el `.env` de la raíz debe tener `AZURE_STORAGE_CONNECTION_STRING`
   apuntando al contenedor de Azurite (ver `.env.example`). Sin ella, el
   backend responde 503 al subir una plantilla. En CI la define el workflow.

2. Instala el navegador (una vez): `pnpm --filter e2e exec playwright install chromium`

3. Corre la suite con las credenciales del administrador de pruebas:

   ```bash
   E2E_ADMIN_EMAIL=admin@paez-boyaca.gov.co E2E_ADMIN_PASSWORD=changeme123 pnpm test:playwright
   ```

   Algunas pruebas preparan o limpian datos con SQL en el contenedor `db` de
   Compose (`src/db.ts`): no existe API para borrar una cartera ni para
   envejecer 60 días una resolución. Por eso necesitan Docker Compose y el
   directorio del repositorio; contra un servidor remoto no corren.

   Antes de las pruebas, la suite escribe los Excel de prueba si faltan
   (ver [Datos de prueba](#datos-de-prueba)), inicia sesión por API y crea el
   municipio `e2e-prueba` si no existe. El administrador no debe tener pendiente el
   cambio de contraseña (uno creado con `admin:create` sí lo tiene: cámbiala
   una vez desde el panel).

## Variables

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost:5173` | Frontend |
| `E2E_API_URL` | `http://localhost:3000` | Backend |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | — (obligatorias) | Administrador de pruebas |
| `E2E_ALLOW_REMOTE` | — | `1` permite servidores que no sean `localhost` |
| `E2E_DOCKER_BIN` | rutas habituales de Docker | Ruta completa de `docker`, si está en otro lado (no se busca en `PATH`) |

## Contra un servidor remoto

La suite se niega a correr si `E2E_BASE_URL` o `E2E_API_URL` no son
`localhost`/`127.0.0.1`/`[::1]`, y se detiene antes de hacer ninguna petición.
Para forzarlo:

```bash
E2E_ALLOW_REMOTE=1 E2E_BASE_URL=https://... E2E_API_URL=https://... pnpm test:playwright
```

Aun así solo opera sobre los municipios `e2e-prueba` y `e2e-segundo`. Úsalo
solo con un ambiente donde crearlos sea aceptable. Las pruebas que usan SQL
(cartera, liquidaciones, mandamientos, municipios y consulta pública) necesitan
Docker Compose local, así que ahí no sirven.

## Datos de prueba

Los Excel se generan con datos ficticios (nunca se usan datos del cliente):

```bash
pnpm --filter backend run e2e:fixtures   # escribe apps/e2e/fixtures/generated/ (no se versiona)
```

El script vive en el backend porque `exceljs` ya es dependencia de allí. La
suite lo corre sola antes de empezar si falta alguno de los archivos
(`src/fixtures.ts`), así que en CI no hace falta un paso aparte; si cambias el
script, borra `fixtures/generated/` para que se vuelvan a escribir.

| Archivo | Para qué |
| --- | --- |
| `cartera-valida.xlsx` | 3 predios con los periodos 2024 y 2025 |
| `cartera-invalida.xlsx` | Le falta la última columna (`TAX_ROLL_HEADERS_MISMATCH`) |
| `cartera-fila-invalida.xlsx` | Las mismas filas y una con el periodo 1979 (fuera de rango) |
| `plantilla-liquidacion-sin-marcadores.docx` | Liquidación con valores de ejemplo y tabla de vigencias, sin `{marcadores}` |
| `plantilla-mandamiento-sin-marcadores.docx` | Mandamiento con valores de ejemplo, sin `{marcadores}` |

La prueba de Mandamientos carga primero `cartera-valida.xlsx` en `e2e-prueba`
por API. Sus liquidaciones no tienen resolución, así que ninguna es elegible
y el flujo llega hasta Revisar; generar un mandamiento exige liquidaciones en
firme (60 días después de la resolución) y queda fuera de esta suite.

## Convenciones

- `data-testid` en kebab-case con la forma `<pantalla>-<elemento>` (por
  ejemplo `plantillas-subir`). La suite de SL-166 no necesitó ninguno: todo se
  alcanza por rol y etiqueta accesible.
- Reportes: lista en consola y HTML en `playwright-report/` (`pnpm exec playwright show-report`
  desde `apps/e2e`). Captura y traza solo cuando una prueba falla; sin reintentos.
- `pnpm --filter e2e test:unit` corre las pruebas de la guardia, sin servidores.

## CI

El job `e2e` de `.github/workflows/ci.yml` levanta el stack con Compose, corre
la suite y sube `playwright-report` como artefacto. Es no bloqueante
(`continue-on-error`); pasa a obligatorio cuando SL-166 acumule 3 corridas
verdes seguidas.
