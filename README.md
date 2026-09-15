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
| `VITE_API_URL` | `apps/frontend/.env` | URL base del backend que consume el frontend |

Cada carpeta trae su propio `.env.example` como plantilla — nunca se sube el `.env` real.

## Flujo de trabajo

- Ramas: `main` (producción), `develop` (desarrollo), `SCRUM-XX-descripcion` (por tarea, sale de `develop`).
- Commits: [Conventional Commits](https://www.conventionalcommits.org/), con el número de tarea de Jira al final — `feat(auth): agregar login (SCRUM-32)`.
- Pull Requests: uno por tarea, siempre hacia `develop` (salvo la promoción a `main`), con la plantilla que se autocompleta al abrirlos.
- El CI (lint + build + test) corre en cada PR y debe pasar antes de mergear.

La documentación completa de arquitectura, reglas de negocio, convenciones y despliegue vive en la wiki del proyecto: **[SLOMP en Confluence](https://trabajodecampo.atlassian.net/wiki/spaces/SLO/overview)**.

## Gestión del proyecto

Backlog y seguimiento de sprints en Jira: proyecto **SCRUM** en `trabajodecampo.atlassian.net`.