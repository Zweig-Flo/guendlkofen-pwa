# Platform Vision & Architecture

A multi-tenant platform for sports clubs to organize their teams' game attendance.
A **club is a tenant**; below it sit **teams** (per sport, ranked), below those **events/games**.
The headline feature is the **Planner**: players get notified about upcoming games and vote
whether they can play.

## Apps

| Workspace     | What                                                                                  |
| ------------- | ------------------------------------------------------------------------------------- |
| `apps/web`    | Mobile-first **PWA** for players (no app stores). Teams, planner voting, team chat.   |
| `apps/portal` | Desktop-first **managing portal** (Mantine 8, TypeScript, port 5174; exists now). Clubs, teams, members, roles, imports. |
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
  Carries a `token` emailed to the invitee via **Resend**; redeeming the token links the
  logged-in user's memberships (club + any pre-assigned teams). There is **no email-match
  policy** — whoever holds the token can redeem it, regardless of which email they signed
  up with.
- **InvitationTeamAssignment** — join row on an Invitation pre-assigning the invitee to a
  specific team with a `TeamRole`; applied as TeamMemberships on redeem.
- **ChatMessage** — per-team chat. **Sent over REST, received over WebSocket**; bodies are
  **AES-256-GCM encrypted at rest** (`CHAT_ENCRYPTION_KEY`) + TLS in transit (deliberate
  decision: no end-to-end encryption). **No edits.** Deletes are **hard** — a member deletes
  their own, a team admin moderates any in the team. **Push-only** notifications (no email) go
  to members without an active socket, throttled to once per user+team per 5 minutes. Ephemeral
  **typing indicator** over the socket; no message retention limit.
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
- **Game reminder schedule** (hourly `@Cron`, idempotent via `ReminderLog`):
  - **7 days before** kickoff — vote nudge to members who have **not voted**.
  - **2 days before** kickoff — second vote nudge to members who **still have not voted**.
  - **1 day before** kickoff — info reminder to members who voted **YES**.
  - Members who voted **NO** are **never re-notified** for that game.
- **Push tap opens the event page** — notifications carry a deep-link `url`; the service
  worker focuses/opens it on click. There are **no vote buttons in the notification** in v1;
  voting happens on the event page.

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
| Chat encryption                | TLS + AES-256-GCM at-rest, **not** E2E    | E2E complexity not worth it for v1         |
| Chat transport                 | **REST send / WebSocket receive**         | Simple, reliable writes; live fan-out to sockets |
| Chat notifications             | **Push only, no email**; 5-min per user+team throttle, only to members without an active socket | Chat is high-volume/low-stakes; avoid email spam and notifying active viewers |
| Chat edit/delete               | **No edit; hard delete** (own message, or team-admin moderation) | Keep it simple; no edit-history complexity, real deletion |
| Vote options                   | Yes/No only                               | Force a decision                           |
| Rank & help scope              | Same club + same sport, lower rank only   | Matches real league substitution rules     |
| Notifications                  | Web Push + email fallback                 | Reach users without push permission        |
| Reminder schedule              | 7d + 2d vote nudges for non-voters, 1d info for YES-voters, never for NO-voters | Chase undecided members, confirm attendees, don't nag decliners |
| Notification tap               | Opens the event page; **no** vote buttons in the notification (v1) | Simpler SW; voting stays on one canonical surface |
| Offline scope                  | App shell + cached reads only (no queued offline mutations) | Read planner data offline; avoid stale/conflicting offline votes |
| Permissions                    | CASL                                      | Fine-grained, works on API + can share to UI |
| API client                     | Orval (OpenAPI → React Query hooks)       | Generated hooks, no hand-written fetchers  |
| Languages                      | de (primary), en; extensible              | German club, international later           |
| Portal UI framework            | Mantine 8 (portal now; PWA adopts it in milestone 3) | One component system shared across both apps |
| Transactional email            | Resend (console fallback in dev)          | Invites/help requests; logs link when no API key set |
