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
| `JWT_SECRET` | `apps/backend/.env` | Secreto de firma de los tokens |
| `PORT` | `apps/backend/.env` | Puerto del backend |
| `ACCESS_TOKEN_TTL_MINUTES`, `SESSION_IDLE_TIMEOUT_MINUTES`, `SESSION_MAX_HOURS` | `apps/backend/.env` | Tiempos de la sesión del Administrador: vida del token de acceso, inactividad máxima y duración total (opcionales; default 15 min, 30 min y 8 h) |
| `REFRESH_COOKIE_SAMESITE`, `REFRESH_COOKIE_SECURE`, `REFRESH_COOKIE_PATH` | `apps/backend/.env` | Cookie del refresh token (opcionales; default `strict`, `true` y `/auth`). `none` solo si el frontend y la API están en sitios distintos; `false` solo si la API todavía se sirve por HTTP |
| `CORS_ORIGIN` | `apps/backend/.env` | Origen(es) del frontend permitidos por CORS, separados por coma (default `http://localhost:5173`) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | `packages/shared/.env` | Credenciales del Administrador que crea `db:seed` (opcional, con default de desarrollo) |
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

## Flujo de trabajo

- Ramas: `main` (producción), `develop` (desarrollo), `SCRUM-XX-descripcion` (por tarea, sale de `develop`).
- Commits: [Conventional Commits](https://www.conventionalcommits.org/), con el número de tarea de Jira al final — `feat(auth): agregar login (SCRUM-32)`.
- Pull Requests: uno por tarea, siempre hacia `develop` (salvo la promoción a `main`), con la plantilla que se autocompleta al abrirlos.
- El CI (lint + build + test) corre en cada PR y debe pasar antes de mergear.

La documentación completa de arquitectura, reglas de negocio, convenciones y despliegue vive en la wiki del proyecto: **[SLOMP en Confluence](https://trabajodecampo.atlassian.net/wiki/spaces/SLO/overview)**.

## Gestión del proyecto

Backlog y seguimiento de sprints en Jira: proyecto **SCRUM** en `trabajodecampo.atlassian.net`.