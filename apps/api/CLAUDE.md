# API Conventions

NestJS 11 backend, secured by Auth0 JWTs (global `JwtAuthGuard`), documented via Swagger at `/docs`.

## DTO rules (mandatory)

- **Outgoing data**: every controller response must be a DTO class whose fields are annotated with `@ApiProperty()` so they appear in the OpenAPI docs. Declare the response type on the route with `@ApiOkResponse({ type: SomeDto })` (or the matching status decorator). Never return entities, raw objects, or untyped JSON.
- **Incoming data**: every request body/query/param object must be a DTO class validated with class-validator decorators (`@IsString()`, `@IsInt()`, etc.). The global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted`, and `transform` enabled, so unannotated fields are rejected — every accepted field needs a validator decorator.

DTOs live in a `dto/` folder next to the module that owns them (see `src/dto/message.dto.ts`).

## Database

- Postgres via Prisma 7 (`prisma-client` generator with the `@prisma/adapter-pg` driver adapter — Prisma 7 has no built-in engine).
- Schema lives in `prisma/schema.prisma`; the client is generated to `src/generated/prisma` (gitignored, CJS module format — do not edit or lint it).
- Inject the global `PrismaService` (`src/prisma/prisma.service.ts`) for all data access; never instantiate `PrismaClient` directly.
- After schema changes run `npm run prisma:migrate` (creates + applies a migration, regenerates the client). `prisma generate` also runs automatically before every build (`prebuild`).
- Local Postgres: `npm run db:up` from the repo root (compose.yaml, db `guendlkofen`, port 5432). Connection string comes from `DATABASE_URL`.

## Auth

- All routes require a valid Auth0 bearer token by default (`APP_GUARD` in `src/auth/auth.module.ts`).
- Use `@Public()` from `src/auth/public.decorator.ts` for routes that must be reachable without login.
- Auth0 config comes from `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` env vars (see `.env.example`).
