# FixtureEngine — Algorithmic Tournament & Fixture Scheduler

A full-stack MERN application that automates multi-team sports scheduling using graph algorithms, replacing manual spreadsheet-based fixture planning.

## The problem

Manually scheduling a tournament — round-robin or knockout — across limited courts, without double-booking any team, is a constraint satisfaction problem. Spreadsheet-based scheduling doesn't scale past a handful of teams and is error-prone (double bookings, missed dependencies in knockout brackets).

## The algorithms

### Round-robin scheduling → Graph Coloring
Every match is modeled as an edge between two team-nodes. Two matches "conflict" (can't share a time slot) if they share a team. This project builds a conflict graph between matches and applies **greedy graph coloring** to assign time slots such that no team is ever double-booked — this is the same class of problem as classic edge-coloring / exam-timetabling problems.

See: `server/algorithms/graphColoring.js`

### Knockout bracket scheduling → Topological Sort (Kahn's Algorithm)
Knockout matches have real dependencies — a semifinal cannot be scheduled before its two feeding quarterfinals are decided. This project models the bracket as a Directed Acyclic Graph (DAG) and uses **Kahn's Algorithm** (in-degree counting + queue) to produce a valid round-by-round ordering. This also gives cycle detection for free, which guards against a malformed bracket.

See: `server/algorithms/topologicalSort.js`

### Real-time schedule editing with conflict prevention
The dashboard allows admins to manually move a match to a different time slot or court. Every edit is checked server-side against the same conflict rule used during generation — you cannot create a double-booking through manual editing either.

That checking lives in one module, `server/services/matchUpdates.js`, and **every** writer goes through it — the manual endpoint and the AI command feature alike. It enforces court range, team double-booking, court double-booking, winner validity, and knockout winner propagation.

See: `PATCH /api/tournaments/:id/matches/:matchRefId` in `server/routes/tournaments.js`

## Accounts, sports and roles

Tournaments are scoped to a **Sport**, and access is scoped with it. There are three roles:

- **super-admin** — everything, across every sport
- **sport-admin** — creates and edits teams, players and tournaments under one assigned sport only
- **player** — read-only view of their own team's fixtures and standings

Passwords are hashed with bcryptjs; sessions are JWTs. Authorisation is re-read from the database on every request rather than trusted from the token, so a role change takes effect immediately instead of whenever the token happens to expire.

Fixture *reads* stay public — they are noticeboard information, and the existing client reads them without a token. Everything that mutates a tournament requires a signed-in admin scoped to that sport.

See: `server/services/auth.js`, `server/middleware/auth.js`

## Standings

`GET /api/tournaments/:id/standings` — wins/losses/points per team, best first. **Win = 3, loss = 0; there are no draws**, because the Match schema carries a single `winner` field with no way to represent one.

Round-robin only. A knockout tournament returns 400 rather than an empty table — an empty table reads as "nobody has scored yet", when the real answer is that the bracket already shows who is still in.

See: `server/services/standings.js`, `client/src/pages/StandingsPage.jsx`

## Notifications

When a match changes time slot or court, every player on both teams is emailed (Nodemailer over SMTP) **and** given a stored in-app notification with an unread indicator. Email can bounce or go unread; the in-app record is the copy a player is guaranteed to see.

Email is best-effort — a validated, saved schedule change is never rolled back because SMTP was briefly unreachable. Without SMTP credentials configured, the app runs normally and logs what it would have sent.

Recording a *winner* does not notify. It changes nobody's plans, and mailing after every result would bury the mails that matter.

See: `server/services/notifications.js`, `server/services/mailer.js`

## AI admin commands

An admin can type a schedule change in plain English (`POST /api/admin/command`). Claude's only job is mapping that sentence onto **one of three fixed actions** — `reschedule_match`, `reschedule_bulk_by_sport`, `swap_court` — declared as strict tool schemas. It never generates or applies a database change.

Two properties are worth stating precisely, because they are the whole design:

1. **The command endpoint only ever returns a preview.** It shows the admin exactly which matches would change and how, and applies nothing. Applying requires a second, explicitly confirmed call carrying a server-signed action, so the admin confirms exactly what they were shown — altered arguments, another admin's preview, and previews older than ten minutes are all refused.

2. **The AI path cannot bypass validation.** Confirmed actions execute through `server/services/matchUpdates.js`, the same module the manual PATCH endpoint uses. An AI-proposed double-booking is rejected with the same 409 a manual edit would produce, and there is a test named for exactly that.

Whatever the model returns is re-validated from scratch against a hand-written schema before anything else happens — unknown actions and unknown fields are rejected rather than ignored.

Without `ANTHROPIC_API_KEY` the console reports that the feature is unavailable; every other endpoint is unaffected.

See: `server/services/adminCommands.js`, `server/services/llm.js`, `server/routes/adminCommand.js`

## Stack

- **MongoDB + Mongoose** — sports, teams, users, tournaments, matches, notifications
- **Express** — REST API, algorithm orchestration
- **React (Vite) + React Router** — dashboard, fixture list, bracket viewer, standings, admin console
- **Node.js** — runs the graph coloring and topological sort algorithms
- **bcryptjs + jsonwebtoken** — password hashing and session tokens
- **Nodemailer** — outbound schedule-change and invite email
- **@anthropic-ai/sdk** — maps admin instructions onto a fixed action set

## Running locally

### Backend
```
cd server
cp .env.example .env   # fill in MONGO_URI and JWT_SECRET (both required)
npm install
npm run dev
```

The server refuses to start without `JWT_SECRET` — a default signing secret is one that ships, and every token it ever signed would be forgeable by anyone who reads the repo. Generate one with `openssl rand -hex 32`.

SMTP and Anthropic credentials are optional; those features report themselves as unavailable rather than failing quietly.

### Frontend
```
cd client
npm install
npm run dev
```

The client dev server proxies `/api` requests to `http://localhost:5000`.

### First run on an empty database

The first account registered on an empty database becomes the super-admin — otherwise there would be no way to create the first privileged user. Self-registration can never otherwise create an admin.

## Tests

```
cd server && npm test
```

107 tests across 6 suites — standings, auth and RBAC, match-update conflict rules, notification logic, AI action validation, and the AI tool schema. Zero test dependencies, and no database required, because the business logic lives in `services/` rather than in route handlers.

## Project notes

The interface follows a single visual system documented in [Design System](docs/Design%20System.md) — near-black canvas, cream ink, hairline structure, pill buttons, monospace data and condensed display caps. It was adapted from the Real Sports Bar & Grill Webflow build; the system was taken, not the branding.

Longer-form design notes live in [`docs/`](docs/) as a set of linked markdown notes (readable as an Obsidian vault): [Architecture](docs/Architecture.md), [Design Principles](docs/Design%20Principles.md), [Testing](docs/Testing.md), and one note per build phase.

## Honest scope notes

This was built as a portfolio/resume project demonstrating applied graph theory in a real-world CRUD system. A few things worth being upfront about if asked in an interview:

- "Team fatigue" constraints and multi-court time-block optimization beyond the greedy coloring approach are **not** implemented — the current model handles court-and-time-slot conflict avoidance only.
- There is no message queue / background worker (e.g. Redis, BullMQ) — the algorithms run synchronously in the request/response cycle, which is appropriate at this data scale (tens of teams, not thousands) and keeps the system simple to reason about and defend.
- "Real-time" editing here means instant UI feedback after a REST call, not a WebSocket-based live-sync system across multiple simultaneous users. The unread-notification indicator polls once a minute rather than holding a live connection — nothing in this app justifies that infrastructure.
- Individual-event results (athletics, track — time/distance/score rather than win/loss) are **not** supported. That needs a genuinely different data model, not an extension of the Tournament/Match schema.
- SMS notifications are not implemented — email plus the in-app indicator covers this use case without the cost.
- The test suites are unit tests over the service layer. There is no end-to-end suite against a live database, because the only configured MongoDB URI is the production Atlas cluster; adding `mongodb-memory-server` would close that gap.
