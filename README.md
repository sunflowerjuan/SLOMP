# SLOMP — Sistema de Liquidaciones Oficiales y Mandamientos de Pago

Plataforma que automatiza, para la cartera del impuesto predial del Municipio de Páez (Boyacá), la generación, gestión y consulta de Liquidaciones Oficiales y Mandamientos de Pago.

## Stack

| Componente | Tecnología |
|---|---|
| Backend | NestJS (Node.js 24) |
| Frontend | React + Vite |
| Base de datos | PostgreSQL + Prisma |
| Gestor de paquetes | pnpm (workspaces) |
| Infraestructura | Azure (App Service, Functions, PostgreSQL Flexible Server) |

## Estructura del repositorio

```
slomp/
├── apps/
│   ├── backend/         # API REST, autenticación, reglas de negocio
│   ├── frontend/        # Panel Administrador + Consulta Pública
│   └── pdf-function/    # Generación de PDF (Azure Function, en desarrollo)
├── packages/
│   └── shared/          # prisma/ (schema, migrations, seed), Prisma client, domain types
├── .github/
│   ├── workflows/ci.yml
│   └── PULL_REQUEST_TEMPLATE.md
├── .husky/
│   └── pre-commit       # corre lint-staged antes de cada commit
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json          # config de lint-staged, scripts de la raíz
```

## Requisitos previos

- [Node.js 24](https://nodejs.org/)
- [pnpm](https://pnpm.io/) 
- [Docker](https://www.docker.com/)

## Puesta en marcha

```bash
git clone git@github.com:<tu-organizacion>/slomp.git
cd slomp

corepack enable
pnpm install

cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
cp packages/shared/.env.example packages/shared/.env

docker-compose up -d

pnpm --filter shared run db:migrate
pnpm --filter shared run db:seed

pnpm --filter backend run start:dev
pnpm --filter frontend run dev
```

El backend queda disponible en `http://localhost:3000` y el frontend en `http://localhost:5173`.

## Local database

The Prisma schema lives at `packages/shared/prisma/schema.prisma`. With the PostgreSQL container running (`docker-compose up -d`):

| Command | What it does |
|---|---|
| `pnpm --filter shared run db:migrate` | Applies pending migrations (creates the DB the first time) |
| `pnpm --filter shared run db:seed` | Loads realistic test data (municipality, properties, owners, settlements, payment orders) |
| `pnpm --filter shared run db:reset` | Resets the DB from scratch (deletes data), reapplies migrations and reseeds |
| `pnpm --filter shared run db:generate` | Regenerates the Prisma client after schema changes |

Run `db:migrate` and then `db:seed` (in that order) whenever the database is set up from scratch.

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `pnpm -r run lint` | Lint en todos los paquetes |
| `pnpm -r run build` | Build en todos los paquetes |
| `pnpm -r run test` | Pruebas en todos los paquetes |
| `pnpm --filter backend run start:dev` | Backend en modo desarrollo |
| `pnpm --filter frontend run dev` | Frontend en modo desarrollo |

## Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `DATABASE_URL` | `apps/backend/.env`, `packages/shared/.env` | PostgreSQL connection string |
| `JWT_SECRET` | `apps/backend/.env` | Secreto de firma de los tokens. Fuera de local debe ser propio del ambiente y de al menos 32 bytes (ver "Secretos y administradores fuera de local") |
| `PORT` | `apps/backend/.env` | Puerto del backend |
| `ACCESS_TOKEN_TTL_MINUTES`, `SESSION_IDLE_TIMEOUT_MINUTES`, `SESSION_MAX_HOURS` | `apps/backend/.env` | Tiempos de la sesión del Administrador: vida del token de acceso, inactividad máxima y duración total (opcionales; default 15 min, 30 min y 8 h) |
| `REFRESH_COOKIE_SAMESITE`, `REFRESH_COOKIE_SECURE`, `REFRESH_COOKIE_PATH` | `apps/backend/.env` | Cookie del refresh token (opcionales; default `strict`, `true` y `/auth`). `none` solo si el frontend y la API están en sitios distintos; `false` solo si la API todavía se sirve por HTTP |
| `CORS_ORIGIN` | `apps/backend/.env` | Origen(es) del frontend permitidos por CORS, separados por coma (default `http://localhost:5173`) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | `packages/shared/.env` | Credenciales del Administrador que crea `db:seed`, solo en local (opcionales, con default de desarrollo). Fuera de local el seed no crea administrador |
| `ADMIN_PASSWORD` | variable de la terminal | Contraseña para `admin:create` y `admin:rotate-password` del backend (opcional; si falta se genera una aleatoria) |
| `ALLOW_DEV_CREDENTIALS` | `docker-compose.yml` | Marca el stack de compose como local, porque su base es `db` y no `localhost`. Nunca en un ambiente desplegado |
| `VITE_API_URL` | `apps/frontend/.env` | URL base del backend que consume el frontend |

Cada carpeta trae su propio `.env.example` como plantilla — nunca se sube el `.env` real.

## Sesión del Administrador

El login entrega un token de acceso de 15 minutos, que el frontend guarda solo en memoria, y un refresh token en una cookie `HttpOnly; Secure; SameSite=Strict; Path=/auth`. El frontend renueva el token solo (`POST /auth/refresh`, que rota la cookie), cierra la sesión tras 30 minutos sin uso y `POST /auth/logout` la revoca en el servidor. Una sesión dura como máximo 8 horas. Sigue la sección 2 de la Política de seguridad (Confluence).

### Antes de desplegar

La cookie por defecto solo funciona si el navegador llega al frontend y a la API **por HTTPS y bajo el mismo sitio** (mismo dominio registrable, por ejemplo `app.<dominio>` y `app.<dominio>/api`). Si no se cumple, el navegador descarta la cookie: el login funciona, pero la sesión no se renueva y el Administrador vuelve al login a los 15 minutos o al recargar la página.

| Situación del despliegue | Qué configurar en el backend |
|---|---|
| Frontend y API bajo un mismo dominio, con HTTPS (objetivo) | Nada: valen los valores por defecto |
| La API se publica bajo un prefijo (por ejemplo `/api`) | `REFRESH_COOKIE_PATH=/api/auth` (la ruta que ve el navegador) |
| Frontend y API en sitios distintos (por ejemplo `*.web.core.windows.net` y `*.azurewebsites.net`, o Vercel y otro proveedor) | `REFRESH_COOKIE_SAMESITE=none`. Requiere HTTPS en la API. Es menos seguro: la única protección contra CSRF es la comprobación de `Origin` |
| La API todavía se sirve por HTTP (Gateway sin TLS, hallazgo SEC-01) | `REFRESH_COOKIE_SECURE=false`, solo como medida temporal y nunca con datos reales |

En todos los casos:

- `CORS_ORIGIN` debe listar el origen exacto del frontend (esquema, dominio y puerto, sin comodines). También se usa para rechazar un refresh o logout que venga de otro origen.
- Un proxy o Gateway delante de la API debe dejar pasar las cabeceras `Cookie`, `Set-Cookie` y `Origin` en `/auth/*`.
- Hay que aplicar la migración `add_refresh_tokens` (`pnpm --filter shared run db:migrate:deploy`).
- Al desplegar esta versión, las sesiones abiertas con el token anterior de 8 horas dejan de ser válidas y cada Administrador debe iniciar sesión de nuevo.
- Los tiempos (`ACCESS_TOKEN_TTL_MINUTES`, `SESSION_IDLE_TIMEOUT_MINUTES`, `SESSION_MAX_HOURS`) están pendientes de aprobación del equipo; los valores por defecto son los propuestos en la política.

## Secretos y administradores fuera de local

Sigue la Política de seguridad (Confluence, secciones 2 y 4.3, hallazgo SEC-09). Un ambiente es **local** cuando su `DATABASE_URL` apunta a `localhost` o cuando es el stack de `docker-compose.yml`, que lo declara con `ALLOW_DEV_CREDENTIALS=true`. Cualquier otro (Azure, demo, producción) no acepta credenciales de desarrollo. La regla no depende de `NODE_ENV`.

### Qué se valida

- **`JWT_SECRET` y `PDF_SERVICE_KEY`** (esta última solo si está definida): el backend no arranca con un valor publicado en el repositorio (`.env.example`, `docker-compose.yml`, CI, pruebas) ni con menos de 32 bytes. `PDF_SERVICE_KEY` debe ser la misma en el backend y en el servicio de PDF.
- **`db:seed`:** borra los datos y carga datos de prueba, así que solo sirve para ambientes de desarrollo o demo. Fuera de local no crea ningún administrador ni borra los que ya existen: el primero se crea con `admin:create` (ver abajo), antes o después del seed.
- **Política de contraseñas del Administrador:** mínimo 12 caracteres, sin reglas de composición, y que no sea una contraseña común ni una palabra común rellenada con números o símbolos (`Password2026!`, `admin1234567`). La aplica el backend: el endpoint de cambio de contraseña y los comandos `admin:create` y `admin:rotate-password`.

### Dónde viven los secretos

Cada ambiente guarda los suyos en su Key Vault (servicio fijo de ADR-11). El App Service ya lee `JWT-SECRET` y `DATABASE-URL` como Key Vault references (`infra/compute.bicep`), pero ningún módulo Bicep crea los valores: se cargan a mano al levantar el ambiente. La decisión de hosting (ADR-13, SL-111) sigue abierta; si cambia, los secretos siguen en Key Vault y solo cambia cómo los recibe la aplicación.

```bash
SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
az keyvault secret set --vault-name <key-vault-del-ambiente> --name JWT-SECRET --value "$SECRET"
```

### Rotar `JWT_SECRET`

Se guarda un valor nuevo con el mismo comando. App Service toma la versión nueva en un máximo de 24 horas; cualquier cambio de configuración de la app la reinicia y la toma de inmediato. Los tokens de acceso firmados con el secreto anterior dejan de valer, pero las sesiones siguen: el frontend recibe un 401, renueva con la cookie de refresh y obtiene un token firmado con el secreto nuevo.

### Primer administrador y rotación de contraseñas

```bash
# Crear un administrador sin pasar por el seed
pnpm --filter backend run admin:create --email persona@dominio.gov.co --name "Nombre"

# Rotar la contraseña de un administrador (por ejemplo, el sembrado)
pnpm --filter backend run admin:rotate-password --email persona@dominio.gov.co
```

Se corren con el `DATABASE_URL` del ambiente (en `apps/backend/.env` o en la terminal); con docker compose: `docker compose run --rm migrate pnpm --filter backend admin:create --email ...`. Generan una contraseña aleatoria y la muestran una sola vez; para fijar una propia se pasa en la variable `ADMIN_PASSWORD`, nunca como argumento, para que no quede en el historial de la terminal. Rotar una contraseña también cierra todas las sesiones abiertas de ese administrador.

### Cambio obligatorio de la contraseña inicial

Una contraseña que eligió otra persona (`admin:create` o `admin:rotate-password`) deja al administrador con `mustChangePassword`. Al iniciar sesión, el panel le muestra la pantalla "Cambia tu contraseña" en lugar del panel, y el backend responde `403 AUTH_PASSWORD_CHANGE_REQUIRED` en cualquier otra ruta hasta que la cambie con `POST /auth/password`. Ese endpoint pide la contraseña actual (los fallos cuentan para el bloqueo del login), aplica la política, rechaza repetir la misma y cierra las demás sesiones de la cuenta. El administrador que crea el seed en local no tiene la marca, para no estorbar el desarrollo ni los e2e.

## Flujo de trabajo

- Ramas: `main` (producción), `develop` (desarrollo), `SCRUM-XX-descripcion` (por tarea, sale de `develop`).
- Commits: [Conventional Commits](https://www.conventionalcommits.org/), con el número de tarea de Jira al final — `feat(auth): agregar login (SCRUM-32)`.
- Pull Requests: uno por tarea, siempre hacia `develop` (salvo la promoción a `main`), con la plantilla que se autocompleta al abrirlos.
- El CI (lint + build + test) corre en cada PR y debe pasar antes de mergear.

La documentación completa de arquitectura, reglas de negocio, convenciones y despliegue vive en la wiki del proyecto: **[SLOMP en Confluence](https://trabajodecampo.atlassian.net/wiki/spaces/SLO/overview)**.

## Gestión del proyecto

Backlog y seguimiento de sprints en Jira: proyecto **SCRUM** en `trabajodecampo.atlassian.net`.