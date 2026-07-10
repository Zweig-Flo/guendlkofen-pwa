# Milestone 3 — Planner v1 (Design)

Single source of truth for the multi-agent build of the Planner. Events belong to teams;
players vote **YES/NO** (no "maybe") on games; teammates see each other's votes. CSV import v1
is a plain upload of a fixed column format. Notifications are milestone 4 — this design leaves
a hook for vote-prompt notifications with **no** later schema change.

Conventions this doc assumes (from `apps/api/CLAUDE.md`, `docs/PLATFORM.md`, existing code):
tenant-nested routes under `/clubs/:clubId/...`; every response is a `@ApiProperty`-annotated
DTO; every input is a class-validator DTO (global `ValidationPipe` with `whitelist` +
`forbidNonWhitelisted` + `transform`); tenant isolation via `accessibleBy(ability, action)` in
the Prisma `where`; scope resolvers throw **404 out-of-scope**, **403 forbidden-in-scope**,
**409 conflict**; Prisma cuid ids; `createdAt/updatedAt` on mutable models.

---

## 1. Prisma schema additions

Two enums, two models. Add to `apps/api/prisma/schema.prisma`; run `npm run prisma:migrate`.

```prisma
enum EventStatus {
  SCHEDULED
  CANCELLED
}

enum EventSource {
  MANUAL
  IMPORT
}

enum HomeAway {
  HOME
  AWAY
  NEUTRAL
}

enum VoteChoice {
  YES
  NO
}

model Event {
  id       String  @id @default(cuid())
  teamId   String
  team     Team    @relation(fields: [teamId], references: [id], onDelete: Cascade)

  startsAt DateTime            // kickoff; drives ordering, "upcoming", vote-lock, reminders
  opponent String              // free text ("SV Musterhausen"); required — a game needs one
  location String?             // venue / address; optional
  homeAway HomeAway @default(HOME)
  notes    String?             // free-text meta (meeting time, kit colour, …)

  status   EventStatus @default(SCHEDULED)
  source   EventSource @default(MANUAL)

  // Dedupe key for idempotent re-import. Null for manual events. Unique per team.
  importKey String?

  votes    Vote[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([teamId, importKey])        // idempotent CSV re-run; nulls don't collide in Postgres
  @@index([teamId, startsAt])          // team planner list + my-upcoming aggregation
}

model Vote {
  id      String     @id @default(cuid())
  eventId String
  event   Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId  String
  user    User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  choice  VoteChoice

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt        // updated when a player flips YES↔NO

  @@unique([eventId, userId])          // one vote per user per event; also the upsert key
  @@index([eventId])                   // tally teammates' votes for one event
}
```

Add back-relations: `Team { events Event[] }`, `User { votes Vote[] }`.

**Field justification**

| Field | Why |
| --- | --- |
| `startsAt` | Everything keys off it: sort, "upcoming" filter, vote-lock cutoff, future reminder scheduling. Single `DateTime` (UTC) — no separate date/time columns. |
| `opponent` | Core of a game; required. |
| `location` / `notes` | Optional logistics; free text in v1. |
| `homeAway` | Enum not bool so a NEUTRAL venue is representable without a schema change. |
| `status` | Cancel without deleting → votes/history preserved; players see it's off. **Reschedule = update `startsAt`** on the same row (keeps votes). No `RESCHEDULED` status needed. |
| `source` | Distinguishes manual vs import rows for UI badges and import-overwrite rules. |
| `importKey` | Stable per-row identity from the CSV so a re-import upserts instead of duplicating (see §3). Null ⇒ manual, never collides. |
| `Vote.choice` | `YES`/`NO` only, per decision log. |
| `Vote.updatedAt` | Lets us show "voted / changed at" and lets milestone-4 reminders skip recently-answered players. |

**Cascades:** deleting a Team removes its Events (and their Votes); deleting an Event removes
its Votes; deleting a User removes their Votes. All `onDelete: Cascade`, matching existing models.

**Notification hook (milestone 4, no schema change):** reminders read `Event.startsAt` +
`status = SCHEDULED` and the existing `Vote` rows (a missing Vote = not yet answered; `NO` =
stop reminding, per PLATFORM.md). No column needed now; a future `PushSubscription` /
notification-log model attaches by `eventId`/`userId` without touching Event or Vote.

---

## 2. API design

New Nest module `planner` (or `events`) under `apps/api/src/planner/`, following the
teams/team-members structure: an `EventsService` + `VotesService`, thin controllers,
`getEventInTeamForAbility()` scope resolver mirroring `getTeamInClubForAbility()`.

Base path: `/clubs/:clubId/teams/:teamId/events`. All routes require the Auth0 bearer
(global guard) and `PoliciesGuard`.

### Endpoints

| Method | Path | Purpose | Policy (CheckPolicies) | Body DTO | Response DTO | Codes |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/clubs/:clubId/teams/:teamId/events` | List team events (query: `from`, `to`, `includePast`, `status`) | read Event | `ListEventsQueryDto` | `EventDto[]` | 200 / 404 / 403 |
| POST | `/clubs/:clubId/teams/:teamId/events` | Create a game | create Event | `CreateEventDto` | `EventDto` | 201 / 404 / 403 |
| GET | `/clubs/:clubId/teams/:teamId/events/:eventId` | Event + vote summary | read Event | — | `EventDetailDto` | 200 / 404 / 403 |
| PATCH | `/clubs/:clubId/teams/:teamId/events/:eventId` | Edit / reschedule / cancel | update Event | `UpdateEventDto` | `EventDto` | 200 / 404 / 403 |
| DELETE | `/clubs/:clubId/teams/:teamId/events/:eventId` | Delete a game | delete Event | — | `EventDto` | 200 / 404 / 403 |
| PUT | `/clubs/:clubId/teams/:teamId/events/:eventId/vote` | Cast/change **my** vote (idempotent upsert) | vote Event (create Vote) | `CastVoteDto` | `VoteDto` | 200 / 404 / 403 / 409 |
| DELETE | `/clubs/:clubId/teams/:teamId/events/:eventId/vote` | Retract my vote | vote Event | — | `204` | 204 / 404 / 403 |
| GET | `/clubs/:clubId/teams/:teamId/events/:eventId/votes` | All teammates' votes for one event | read Vote (team member) | — | `EventVotesDto` | 200 / 404 / 403 |
| POST | `/clubs/:clubId/teams/:teamId/events/import` | CSV upload (multipart) | create Event (import) | `multipart file` | `ImportResultDto` | 200 / 400 / 404 / 403 / 413 |
| GET | `/me/upcoming-events` | Cross-team aggregation for PWA home | read Event (any of my teams) | `MyUpcomingQueryDto` | `MyUpcomingEventDto[]` | 200 |

Notes:
- **`PUT .../vote`** (not POST) because it is an idempotent upsert on `(eventId, userId)` — same
  request twice = same result. First cast returns 200 with the created/updated vote. The 409
  case: voting on a **cancelled** event or **after `startsAt`** (see vote rules below).
- **`/me/upcoming-events`** lives on a small `MeController` (or the planner module) at the root,
  outside the club nesting, because it spans all the caller's teams/clubs. It only returns events
  from teams the caller is a `TeamMembership` of, ordered by `startsAt asc`, default window
  `now … now+30d`, and embeds the caller's own vote so the home screen renders in one request.
- List/detail responses embed a **vote summary** (`yesCount`, `noCount`, `notVotedCount`, and the
  caller's `myVote`) so the planner list needs one request, not N.

### DTOs

Inputs (class-validator; `@ApiProperty`/`@ApiPropertyOptional`):

```
CreateEventDto {
  @IsDateString() startsAt: string        // ISO 8601, transformed to Date in service
  @IsString() @IsNotEmpty() opponent: string
  @IsOptional() @IsString() @IsNotEmpty() location?: string
  @IsOptional() @IsEnum(HomeAway) homeAway?: HomeAway   // default HOME
  @IsOptional() @IsString() notes?: string
}
UpdateEventDto  = PartialType(CreateEventDto) + @IsOptional() @IsEnum(EventStatus) status?
                  // status=CANCELLED to cancel; changing startsAt = reschedule
CastVoteDto     { @IsEnum(VoteChoice) choice: VoteChoice }
ListEventsQueryDto {
  @IsOptional() @IsDateString() from?; to?
  @IsOptional() @Type(()=>Boolean) @IsBoolean() includePast?   // default false
  @IsOptional() @IsEnum(EventStatus) status?
}
MyUpcomingQueryDto { @IsOptional() @IsInt() @Min(1) @Max(90) days?  // default 30 }
```

Outputs (every field `@ApiProperty`, `fromEntity` static like `TeamDto.fromTeam`):

```
EventDto        { id, teamId, startsAt, opponent, location|null, homeAway, notes|null,
                  status, source, summary: VoteSummaryDto }
VoteSummaryDto  { yesCount, noCount, notVotedCount, myVote: VoteChoice|null }
EventDetailDto  = EventDto + votes: VoteDto[]        // when caller may read teammates' votes
VoteDto         { id, eventId, userId, choice, updatedAt }
EventVotesDto   { eventId, votes: TeammateVoteDto[], summary: VoteSummaryDto }
TeammateVoteDto { userId, userName, choice }         // name for avatars/initials in UI
MyUpcomingEventDto = EventDto + team: { id, name, sport } + clubId  // enough for home cards
ImportResultDto { see §3 }
```

`notVotedCount` = team member count − (yes+no); computed in the service from the team's
`TeamMembership` count.

### Service / tenant-isolation pattern

Reuse the established chain: controller → `EventsService.getEventInTeamForAbility(ability,
clubId, teamId, eventId, action)` which first calls `teamsService.getTeamInClubForAbility(...,
'read')` (gives 404 for out-of-club team), then `prisma.event.findFirst({ where: { id, teamId }})`
(404 if not in team), then `ability.cannot(action, toSubject('Event', event))` → 403. List/read
queries always `AND` the URL scope with `accessibleBy(ability, action).ofType('Event')`.

### CASL extensions (`casl-ability.factory.ts` + `app-ability.ts`)

Add `Event` and `Vote` to `AppSubjects`. New action **`vote`** on `Event` (extend the `Action`
union with `'vote'`).

| Who | Ability |
| --- | --- |
| Super admin | `manage all` (already). |
| Club admin (`adminClubIds`) | `manage Event` where `team.is.clubId in adminClubIds`; `read Vote` where `event.team.clubId in adminClubIds`. |
| Team admin (`adminTeamIds`) | `manage Event` where `teamId in adminTeamIds`; `read Vote` where `event.teamId in adminTeamIds`. |
| Team member (any `teamMemberships`, i.e. also players) | `read Event` where `teamId in memberTeamIds`; `vote Event` where `teamId in memberTeamIds`; `read Vote` where `event.teamId in memberTeamIds`; `manage Vote` where `userId = user.id` (own vote only). |
| Club member (not on the team) | **no** Event/Vote access — planner is team-scoped, stricter than the club-wide read for teams/memberships. |

So: **create/edit/delete events = TEAM_ADMIN + CLUB_ADMIN** (+ super admin); **voting = team
members on their own team's events**; **seeing teammates' votes = team members** (transparency is
the point of the feature).

**Vote rules (decisions):**
- **One vote per user per event** — enforced by `@@unique([eventId, userId])`; the endpoint is an
  upsert so a player cannot create a second row.
- **Changeable until `startsAt`.** Rationale: availability genuinely changes up to game day, and
  YES/NO exists to reflect current reality; locking earlier just produces stale data. After
  `startsAt` the vote freezes (historical record). Cast/change/retract after `startsAt` → **409
  Conflict** (`"Voting has closed for this event"`).
- **No voting on a `CANCELLED` event** → **409 Conflict**. Existing votes are kept but read-only.
- Retract (DELETE) allowed under the same open/closed rule; a retracted vote returns the player to
  `notVoted`.

---

## 3. CSV import v1

**Endpoint:** `POST /clubs/:clubId/teams/:teamId/events/import`, `multipart/form-data`, field
name **`file`**. Uses `FileInterceptor('file')` from `@nestjs/platform-express` (already a dep;
add `@types/multer` dev-dep). Policy: `create Event` (TEAM_ADMIN / CLUB_ADMIN). Swagger:
`@ApiConsumes('multipart/form-data')` + `@ApiBody` schema with a binary `file` property.

**Limits / guards:**
- Max size **1 MB** (`limits: { fileSize: 1_000_000 }`) → **413** on exceed.
- MIME/extension must be `text/csv` / `.csv` (also accept `application/vnd.ms-excel` which browsers
  sometimes send for CSV) → **400** otherwise.
- Max **500 data rows** → 400 if exceeded (v1 sanity cap).

**Parsing library: `papaparse`** (add to `apps/api` deps + `@types/papaparse`). Chosen over
`csv-parse` for forgiving header handling, built-in `header:true` row objects, and delimiter
auto-detection — helpful for German exports that use `;`. Parse with
`{ header: true, skipEmptyLines: true, transformHeader: normalize }`.

**Fixed column format (v1).** Header row required. Case-insensitive, trimmed, de/en aliases:

| Canonical | Required | de aliases | en aliases | Format |
| --- | --- | --- | --- | --- |
| `date` | yes | `datum` | `date` | `YYYY-MM-DD` or `DD.MM.YYYY` |
| `time` | yes | `zeit`, `uhrzeit` | `time` | `HH:mm` (24h) |
| `opponent` | yes | `gegner` | `opponent` | free text |
| `location` | no | `ort`, `spielort` | `location`, `venue` | free text |
| `homeAway` | no | `heim/auswärts`, `heimauswaerts`, `h/a` | `home/away`, `homeaway`, `h/a` | `H`/`Heim`/`Home` → HOME; `A`/`Auswärts`/`Away` → AWAY; `N`/`Neutral` → NEUTRAL; blank → HOME |
| `notes` | no | `notizen`, `hinweis` | `notes`, `comment` | free text |

`date`+`time` are combined into `startsAt` (interpret in **Europe/Berlin**, store UTC).

**Dedupe / upsert (`importKey`).** For each row compute
`importKey = sha1(dateISO + '|' + opponent.trim().toLowerCase())` — **date only, no time** —
then `prisma.event.upsert({ where: { teamId_importKey: { teamId, importKey } }, create: {...,
source: IMPORT}, update: {...} })`. Re-importing the same file is a **no-op**; re-importing a
corrected file updates matched rows in place (keeping their votes) and inserts new ones. Because
the key ignores the time component, the common league case — same match, corrected start time —
**updates the existing event in place and keeps its votes** instead of duplicating it. Two
different games against the same opponent on the same day would collide; accepted as rare in v1.
Import **never** deletes events and **never** touches `source: MANUAL` rows (different/`null`
importKey).

**Validation & error reporting (row-level, no partial-abort by default).** Parse all rows,
validate each, insert the valid ones in one transaction, and return a report:

```
ImportResultDto {
  totalRows: number
  imported: number         // newly created
  updated: number          // matched existing importKey and changed
  skipped: number          // duplicates / unchanged
  errorCount: number
  errors: ImportRowErrorDto[]
}
ImportRowErrorDto { row: number; field?: string; message: string; raw: string }
```

Rows with errors are reported and **not** imported; valid rows still import (partial success,
HTTP **200** with a populated `errors` array). If the header is missing required columns or the
file is unparseable → **400** with a single top-level error. `messages` should be i18n keys or
plain English strings the PWA/portal maps (`import.error.badDate`, `import.error.missingOpponent`,
…) — pick i18n keys so both frontends localize.

**Sample CSV** (`;`-delimited, German headers):

```csv
Datum;Zeit;Gegner;Ort;Heim/Auswärts;Notizen
2026-09-12;15:00;SV Musterhausen;Sportplatz Gündlkofen;Heim;Treffen 14:15
19.09.2026;11:00;TSV Beispieldorf;Auswärtsplatz;A;
2026-09-26;15:00;FC Nachbarort;;Heim;Trikot rot
```

---

## 4. PWA planner UI (`apps/web`)

### Mantine adoption plan (tight scope)

Adopt **Mantine 8** now, matching the portal's stack. **In scope this milestone:**
- Add deps: `@mantine/core`, `@mantine/hooks`, `@mantine/notifications`, plus
  `postcss`, `postcss-preset-mantine`, `postcss-simple-vars` + a `postcss.config.cjs` (copy the
  portal's).
- Wrap the tree in `<MantineProvider>` (+ `<Notifications/>`) in `main.jsx`, inside the existing
  Auth0 → QueryClient → ApiProvider chain. Add a mobile-first theme (base font, primary color).
- Build the **planner screens** (below) in Mantine.
- Add `react-router-dom` (portal already uses v7) for the screen routes.

**Out of scope (leave as-is, restyle later):** `AuthBar.jsx`, the Vite landing content in
`App.jsx` (replace `App.jsx`'s body with the router/shell but don't restyle AuthBar internals),
`App.css`/`index.css` demo styles. Keep plain **JSX** (no TS) — matches `apps/web` today.

### Screen inventory

| Route | Screen | Contents |
| --- | --- | --- |
| `/` | **Home / My games** | `MyUpcomingEventDto[]` from `/me/upcoming-events`, grouped by day; each card shows team name, opponent, home/away, date/time, my vote state + inline YES/NO buttons. Empty state if none. |
| `/teams` | **Team list** | The caller's teams (from existing teams/memberships hooks), each linking to its planner. |
| `/clubs/:clubId/teams/:teamId` | **Team planner** | Upcoming games list (default) with a past toggle. Each row: opponent, date/time, location, home/away badge, **vote buttons**, and a **tally** (`3 ✓ / 1 ✗ / 2 –`) with small **avatar/initials group** of who voted yes. Cancelled events shown struck/greyed, buttons disabled. |
| `/clubs/:clubId/teams/:teamId/events/:eventId` | **Event detail** | Full meta + notes + full teammate vote list (grouped YES / NO / not voted). Team admins get edit/cancel/delete actions and the CSV import entry (button → upload modal). |

Team-admin create/edit event = a Mantine `Modal` + `@mantine/form` form (DatePicker/TimeInput or
plain inputs in v1). CSV import = a `FileButton` + upload modal that renders `ImportResultDto`
(counts + per-row error table).

### Vote interaction states

Use the generated Orval mutation hook for `PUT .../vote` with **optimistic update** via TanStack
Query `onMutate`:
1. Tap YES/NO → immediately flip `myVote` and adjust the local tally (optimistic).
2. On error → roll back + Mantine `notifications.show` error toast; re-enable buttons.
3. On settle → `invalidateQueries` for the event/list so counts reconcile with the server.
4. While in flight: buttons show a `loading` state; the tapped button is `disabled`.
5. Closed voting (past `startsAt` / cancelled): buttons rendered `disabled` with a tooltip
   (`planner.vote.closed`); the 409 is a safety net, not the primary UX.

**Empty states:** no upcoming games (`planner.empty.upcoming`), team has no games yet
(`planner.empty.team`), not a member of any team (`planner.empty.noTeams`).
**Error states:** query error → retry card (`common.error.loadFailed` + retry button);
403 on a team → "no access" message (shouldn't happen via normal nav).

### i18n keys (add to `apps/web/src/i18n/de.json` + `en.json`)

```
planner.title, planner.upcoming, planner.past, planner.showPast
planner.myGames.title
planner.event.homeAway.HOME|AWAY|NEUTRAL
planner.event.cancelled, planner.event.location, planner.event.notes
planner.vote.yes, planner.vote.no, planner.vote.retract, planner.vote.closed
planner.vote.myVote, planner.tally.yes, planner.tally.no, planner.tally.notVoted
planner.votes.title, planner.votes.notVotedGroup
planner.admin.create, planner.admin.edit, planner.admin.cancel, planner.admin.delete
planner.import.title, planner.import.upload, planner.import.result,
  planner.import.imported, planner.import.updated, planner.import.skipped, planner.import.errors
planner.import.error.<code>   // mirror ImportRowErrorDto message keys
planner.empty.upcoming, planner.empty.team, planner.empty.noTeams
common.error.loadFailed, common.retry, common.save, common.cancel
```

**Mobile-first layout:** single-column stack, full-width `Card`s, large tap targets (vote buttons
≥44px), sticky/bottom nav between Home and Teams, date group headers as sticky subheaders. Use
Mantine responsive props; no desktop multi-column in v1.

---

## 5. Test plan

**Unit (Jest, `*.spec.ts`, mocked `PrismaService` + hand-built abilities like
`invitations.service.spec.ts`):**
- `VotesService`: upsert creates then updates (one row); rejects vote after `startsAt` (409);
  rejects vote on CANCELLED (409); retract removes; `notVotedCount` math against team size.
- CASL: player can `vote`/`read Event` on own team but not another team; club-member-not-on-team
  has no Event access; team admin can `manage Event`; player cannot edit/delete events.
- Import parser (pure function, no DB): header alias resolution (de/en, `;` delimiter), date
  formats (`YYYY-MM-DD` + `DD.MM.YYYY`), homeAway mapping, `startsAt` build in Europe/Berlin;
  row-level error collection; `importKey` stability (same row → same key).
- Import dedupe: re-run over identical rows ⇒ all skipped; changed row ⇒ updated; new row ⇒
  imported; MANUAL rows untouched.

**E2E (`apps/api/test/*.e2e-spec.ts`, extend `tenancy.e2e-spec.ts` style):**
- Vote permissions across tenants: user A (club X team 1) gets **404** hitting club Y's event,
  **403** on a sibling team in the same club they're not on, **200** on their own team's event.
- Full vote lifecycle: create event → player votes YES → `GET /votes` shows it → change to NO →
  tally updates → cancel event → further vote returns 409.
- `/me/upcoming-events` returns only the caller's teams' future events, sorted, with `myVote`.
- Import happy path: upload sample CSV → `imported` count matches, events queryable; re-upload →
  all `skipped`.
- Import malformed: file with a bad date row + a missing-opponent row → 200 with 2 `errors`,
  valid rows still imported; oversized file → 413; missing required header → 400.

**Verify gate should check:** `npm run build` (all workspaces incl. Prisma generate + Orval types
compile), `npm run lint`, `npm run test` (api unit specs green), api e2e suite green, and that
`packages/api-client` regenerates cleanly from the new OpenAPI (`npm run api-client:generate`
produces the Event/Vote/import hooks with no diff-on-rerun). Manual smoke: log in on the PWA, vote
on a game, see the tally update optimistically and persist after refresh.

---

## 6. Open questions (each with a recommended default)

1. **Vote-lock timing** — lock exactly at `startsAt`? *Default:* yes, freeze at `startsAt`; no
   grace period. Easy to extend later.
2. **Who counts toward `notVotedCount`** — all `PLAYER`+`TEAM_ADMIN` members, or players only?
   *Default:* all team members (admins play too). Revisit if admins are often non-playing staff.
3. **CSV reschedule** — DECIDED (orchestrator, 2026-07-10): `importKey` is keyed on
   `date+opponent` (time-insensitive), so a corrected start time on re-import updates the
   existing event in place and keeps its votes. Trade-off: two games vs. the same opponent on
   one day would collide (rare; revisit in milestone 7's mapping import). §3 reflects this.
4. **Import overwrite scope** — should re-import update `location`/`notes`/`homeAway` on matched
   rows, or only fill blanks? *Default:* full overwrite of import-sourced rows (CSV is the source
   of truth); never touch MANUAL rows.
5. **Retract vote** — allow explicit "no answer" via DELETE, or force YES/NO only? *Default:*
   allow retract (returns to notVoted) — mirrors real "I don't know yet" without a maybe option.
6. **`/me/upcoming-events` window** — default 30 days, max 90. *Default:* as stated; make it a
   query param so the home screen can tune it.
7. **Timezone** — assume all clubs Europe/Berlin for CSV `date+time`? *Default:* yes for v1
   (single-region product); store UTC. Revisit if clubs span timezones.
