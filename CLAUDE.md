# Guendlkofen PWA

npm-workspaces monorepo:

- `apps/web` — React 19 + Vite PWA frontend
- `apps/api` — NestJS backend (Auth0 auth, Swagger at `/docs`) — see `apps/api/CLAUDE.md` for API conventions

## Commands (run from repo root)

- `npm run dev` — frontend dev server (port 5173)
- `npm run dev:api` — backend in watch mode (port 3000)
- `npm run build` — build all workspaces
- `npm run lint` / `npm run test` — across all workspaces
