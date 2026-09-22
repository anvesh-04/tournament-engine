---
title: Phase 2 - Multi-Sport Model
tags: [phase, data-model]
updated: 2026-09-22
---

# Phase 2 — Multi-Sport Data Model

```
Sport ──< Team ──< User (player)
  │
  └──< Tournament
```

- `Sport` — `{ name, adminUserId }`
- `Team` — `{ name, sportId, players[] }`, unique on `(sportId, name)` so a
  "Falcons" can exist in two sports
- `Tournament` — gained `sportId` and `createdBy`, both nullable so
  pre-multi-sport tournaments still load instead of failing validation on
  every save

See [[Architecture]] for why `Team` documents and `Tournament.teams[]` stay
separate.

## Sport-admin flow

Create teams under your own sport, then invite players. An invite creates the
account with a `crypto.randomBytes` temporary password, emails it
([[Phase 3 - Notifications]]), and sets `mustChangePassword` so the client
forces a reset on first login.

**A request body cannot change which sport it targets.** For a sport-admin the
`sportId` is taken from their user record and any value they send is ignored.
Otherwise the ownership check could be walked around by crafting a body.

**An existing account from another sport is not silently reassigned** — that
would pull someone off their current team with no one noticing. It returns 409
and asks for a super-admin.

**The temporary password is only returned in the API response when the email
failed.** Otherwise an admin reading the response is holding a working
credential for someone else's account for no reason.

**Removing a player from a roster does not delete the account** — that would
orphan their notifications and any history referring to them.

## Player dashboard

`GET /api/me/matches` — the player's own team's fixtures across their sport,
each annotated with `opponent` and `result` so the UI never re-derives them,
plus round-robin standings. Scoped by sport, so a same-named team elsewhere
can never leak fixtures in.

Read-only, with no edit controls rendered at all. The server rejects a
player's writes regardless, but offering a control that always fails is worse
than not offering it.

## Assigning who runs a sport

Super-admin only, on the Sports page (`client/src/pages/SportsPage.jsx`). Two
routes in: promote an existing account, or invite someone who has none yet
(`POST /api/sports/:id/admin`, mirroring the player invite).

**Replacing an admin demotes the outgoing one to `player` of that sport.**
Not to "sport-admin with no sport" — the User model rejects that shape, and
`findByIdAndUpdate` skips validators, so the original code persisted an
invalid record that only blew up on the user's next ordinary save. Worse, the
access check compares `user.sport` against the resource and never consults
`Sport.adminUserId`, so clearing the Sport's pointer alone would have left a
replaced admin holding every power they had. Covered by
`server/tests/sportAdmin.test.js`.

Promotion also clears `teamId`: an admin is not on a roster, and a stale team
reference would surface them in their own "my team" views.

## Files

`server/models/Sport.js`, `server/models/Team.js`, `server/routes/sports.js`,
`server/routes/teams.js`, `server/routes/me.js`,
`client/src/pages/TeamsPage.jsx`, `client/src/pages/PlayerDashboard.jsx`
