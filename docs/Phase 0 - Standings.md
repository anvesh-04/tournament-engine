---
title: Phase 0 - Standings
tags: [phase, standings]
updated: 2026-09-22
---

# Phase 0 — Standings

Round-robin leaderboard. **Win = 3, loss = 0. No draws.**

## Why no draws

Confirmed with the project owner before building. The Match schema carries a
single `winner` field with no way to express a drawn result, so a draw is not
representable and is therefore not scored.

The tempting shortcut — treating a `COMPLETED` match with a null winner as a
draw — is wrong, because that is also exactly what a data-entry mistake looks
like. Adding draws means adding an explicit outcome field to the Match schema
first.

## Round-robin only

`GET /api/tournaments/:id/standings` returns **400** for a knockout
tournament rather than an empty table. An empty table reads as "nobody has
scored yet"; the real answer is "standings do not apply — read the bracket".

## What counts

A match scores only when it is `COMPLETED`, has a winner, has two real teams,
and the winner is one of them. That last check matters: a corrupt record
would otherwise invent points for a team that never played.

BYE matches never score. The knockout builder marks them `COMPLETED` with a
winner, so without the `teamB !== null` guard an auto-advance would be worth
3 points.

## Ordering

Points desc → wins desc → **fewest games played** → name. The name tiebreak
is there so the table never reshuffles between two identical reads.

## Files

- `server/services/standings.js`
- `server/tests/standings.test.js`
- `client/src/pages/StandingsPage.jsx`

Also surfaced inside the player's own view — see
[[Phase 2 - Multi-Sport Model]].
