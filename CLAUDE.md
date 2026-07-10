# Guendlkofen PWA

Multi-tenant sports club platform (clubs → teams → games, planner voting, chat).
**Read `docs/PLATFORM.md` first** — it holds the domain model, roles, milestones, and decision log.

npm-workspaces monorepo:

- `apps/web` — React 19 + Vite PWA frontend (mobile-first, for players)
- `apps/api` — NestJS backend (Auth0 auth, Swagger at `/docs`) — see `apps/api/CLAUDE.md` for API conventions
- `apps/portal` — managing portal (planned, not created yet)

Conventions that span workspaces: API routes are club-scoped (`/clubs/:clubId/...`), permissions via CASL, frontend API clients generated from OpenAPI with Orval (React Query hooks), i18n everywhere (de primary, en).

## Commands (run from repo root)

- `npm run dev` — frontend dev server (port 5173)
- `npm run dev:api` — backend in watch mode (port 3000)
- `npm run db:up` / `npm run db:down` — local Postgres 17 via Docker compose (port 5432, Prisma ORM in the api)
- `npm run build` — build all workspaces
- `npm run lint` / `npm run test` — across all workspaces
