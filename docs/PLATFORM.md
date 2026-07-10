# Platform Vision & Architecture

A multi-tenant platform for sports clubs to organize their teams' game attendance.
A **club is a tenant**; below it sit **teams** (per sport, ranked), below those **events/games**.
The headline feature is the **Planner**: players get notified about upcoming games and vote
whether they can play.

## Apps

| Workspace     | What                                                                                  |
| ------------- | ------------------------------------------------------------------------------------- |
| `apps/web`    | Mobile-first **PWA** for players (no app stores). Teams, planner voting, team chat.   |
| `apps/portal` | Desktop-first **managing portal** (to be created). Clubs, teams, members, roles, imports. |
| `apps/api`    | NestJS backend. Auth0, Prisma/Postgres, CASL, Swagger-generated clients.              |

## Domain model

- **User** — local profile linked to Auth0 (`auth0Id`), locale, `isSuperAdmin` flag.
- **Club** — the tenant. Holds the name.
- **Team** — belongs to a club. Has `sport`, `league`, and `rank` (ordering among the
  club's teams of the same sport; rank 1 is highest, e.g. Herren 1 → Herren 2).
- **ClubMembership** — user ↔ club with role `CLUB_ADMIN | MEMBER`.
- **TeamMembership** — user ↔ team with role `TEAM_ADMIN | PLAYER`.
- **Event (Game)** — belongs to a team: date/time, opponent, location, meta. Created
  manually or via CSV import.
- **Vote** — user × event → `YES | NO` (deliberately no "maybe"). Unique per user+event.
- **Invitation** — email invite into a club, optionally pre-assigned to teams/roles.
  Accepting links the Auth0 signup to the memberships.
- **ChatMessage** — per-team chat. Encrypted **at rest** + TLS in transit (deliberate
  decision: no end-to-end encryption).
- **HelpRequest** — a team admin asks a **lower-ranked team of the same sport in the same
  club** for players for a specific event. Targets get push/email and respond.
- **PushSubscription** — Web Push endpoints per user/device.
- **ImportMapping** — (later) saved per-club CSV column mappings for the fancy import.

## Roles & permissions

Enforced with **CASL** (`@casl/ability`, `@casl/prisma`) on the API; abilities derived from
memberships:

- **Super admin** (e.g. Florian) — everything, incl. creating clubs.
- **Club admin** — full power over their club; can promote members to club admin.
- **Team admin** — full power over their team (events, imports, help requests, promoting
  team admins).
- **Player/member** — sees club's teams, own teams' events + votes, chats in own teams.

Rule of thumb: a role can grant its own level to others within its scope.

## API conventions

- Routes are nested under the tenant: `GET /clubs/:clubId/teams`,
  `/clubs/:clubId/teams/:teamId/events`, etc. Cross-tenant access is a CASL concern,
  but the URL always carries the club context.
- OpenAPI (`/docs`) is the source of truth; the frontend API client + **TanStack Query
  hooks are generated with Orval** into a shared package — no hand-written fetch code.
- DTO/validation rules: see `apps/api/CLAUDE.md`.

## Notifications

- **Web Push first, email fallback** (users without push permission; heavyweight events
  like invites and help requests always also get email).
- Planner flow: upcoming game → notification with vote actions; voted "no" → no further
  reminders for that game.

## i18n

- App and portal are internationalized from the start: **German is the primary language**,
  English second, more languages may follow. Emails and notifications localized too
  (user locale on the User record).

## Feature milestones

1. **Foundation** — Prisma schema (users, clubs, teams, memberships), Auth0 user
   provisioning, CASL setup, club-scoped route skeleton, Orval client pipeline, i18n setup.
2. **Portal core** — club/team CRUD, email invitations, member & role management.
3. **Planner v1** — events, simple CSV import, vote UI in the PWA, teammates' votes visible.
4. **Notifications** — Web Push + email, game reminders with vote actions.
5. **Team chat** — realtime (WebSocket gateway), encrypted at rest, push on new messages.
6. **Help requests** — rank-based ask-for-help flow with responses.
7. **Import v2** — upload CSV/Excel → map columns in the UI → save mapping per club → reuse.

## Decision log

| Decision                       | Choice                                    | Why                                        |
| ------------------------------ | ----------------------------------------- | ------------------------------------------ |
| Distribution                   | PWA                                       | No app-store fees                          |
| Chat encryption                | TLS + at-rest, **not** E2E                | E2E complexity not worth it for v1         |
| Vote options                   | Yes/No only                               | Force a decision                           |
| Rank & help scope              | Same club + same sport, lower rank only   | Matches real league substitution rules     |
| Notifications                  | Web Push + email fallback                 | Reach users without push permission        |
| Permissions                    | CASL                                      | Fine-grained, works on API + can share to UI |
| API client                     | Orval (OpenAPI → React Query hooks)       | Generated hooks, no hand-written fetchers  |
| Languages                      | de (primary), en; extensible              | German club, international later           |
