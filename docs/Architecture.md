---
title: Architecture
tags: [architecture]
updated: 2026-09-22
---

# Architecture

```
client/  React (Vite) — Vercel
server/  Express + Mongoose — Render
         MongoDB Atlas
```

## The rule that shapes everything

**There is exactly one code path that writes to a match.**

`server/services/matchUpdates.js` owns every scheduling rule: court range,
time-slot validity, team double-booking, court double-booking, winner
validation, and knockout winner propagation.

Two callers use it, and nothing else may write to a match:

1. `PATCH /api/tournaments/:id/matches/:matchRefId` — a human admin editing
   the schedule by hand.
2. `POST /api/admin/command/confirm` — the AI command feature applying a
   confirmed action ([[Phase 4 - AI Admin Commands]]).

This was an extraction, not a rewrite: the logic previously lived inline in
`routes/tournaments.js` and was lifted out verbatim, then covered with tests
and extended. The reason for extracting it is that the AI path must not be
able to produce a schedule the manual path would have rejected. If the check
existed in two places it would be one copy-paste away from drifting.

`applyMatchUpdate` mutates the in-memory document and reports what changed;
it never saves. That is what lets the AI preview run the *real* operation
against a freshly-loaded document and then discard it.

## Layers

| Layer | Holds | Testable without |
|---|---|---|
| `algorithms/` | Graph coloring, Kahn's sort | DB, network |
| `services/` | All business logic and decisions | DB, network |
| `middleware/` | Express adapters over `services/auth` | DB |
| `routes/` | HTTP translation only | — |
| `models/` | Mongoose schemas + invariants | — |

Decisions live in `services/`, not in route handlers. That is why the test
suites can cover conflict detection, RBAC, standings, notification wording
and AI action validation without a database connection.

## Ownership model

`Sport` is the boundary everything hangs off. `Team`, `Tournament` and
sport-admin `User`s all carry a `sportId`, and the access check
(`services/auth.js` → `canAccessSport`) is a comparison against it.
See [[Phase 1 - Auth and RBAC]] and [[Phase 2 - Multi-Sport Model]].

## Two notions of "team"

Deliberately separate, and worth not collapsing:

- `Tournament.teams[]` — plain names the [[Scheduling Algorithms]] operate on.
  A snapshot taken at fixture-generation time.
- `Team` documents — a roster of player `User`s, scoped to a sport.

Renaming a `Team` must not silently rewrite an already-generated fixture list,
and the algorithms must keep taking plain strings.
