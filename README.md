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

See: `PATCH /api/tournaments/:id/matches/:matchRefId` in `server/routes/tournaments.js`

## Stack

- **MongoDB + Mongoose** — tournament, team, and match data
- **Express** — REST API, algorithm orchestration
- **React (Vite) + React Router** — dashboard, fixture list, bracket viewer
- **Node.js** — runs the graph coloring and topological sort algorithms

## Running locally

### Backend
```
cd server
cp .env.example .env   # fill in your MongoDB URI
npm install
npm run dev
```

### Frontend
```
cd client
npm install
npm run dev
```

The client dev server proxies `/api` requests to `http://localhost:5000`.

## Honest scope notes

This was built as a portfolio/resume project demonstrating applied graph theory in a real-world CRUD system. A few things worth being upfront about if asked in an interview:

- "Team fatigue" constraints and multi-court time-block optimization beyond the greedy coloring approach are **not** implemented — the current model handles court-and-time-slot conflict avoidance only.
- There is no message queue / background worker (e.g. Redis, BullMQ) — the algorithms run synchronously in the request/response cycle, which is appropriate at this data scale (tens of teams, not thousands) and keeps the system simple to reason about and defend.
- "Real-time" editing here means instant UI feedback after a REST call, not a WebSocket-based live-sync system across multiple simultaneous users.
