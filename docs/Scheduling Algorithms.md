---
title: Scheduling Algorithms
tags: [algorithms, pre-existing]
updated: 2026-09-22
---

# Scheduling Algorithms

Pre-existing and deliberately untouched by this build. They take plain string
team ids and must keep doing so — see [[Architecture]].

## Round-robin — greedy graph coloring

`server/algorithms/graphColoring.js`

Matches are nodes in a *conflict graph*; two matches are adjacent when they
share a team. Greedily assign each match the lowest colour (time slot) not
used by a neighbour, then distribute same-colour matches across courts. This
is edge colouring on the tournament graph, applied to its line graph.

Greedy rather than optimal because minimum graph colouring is NP-hard, and a
valid colouring is what a schedule actually needs.

## Knockout — Kahn's topological sort

`server/algorithms/topologicalSort.js`

Matches form a DAG; an edge means "this match feeds the winner into that one".
Kahn's algorithm gives both a valid dependency order and, for free, the
round-by-round grouping the bracket UI needs — each in-degree-0 wave is one
round. It also detects cycles, which catches a malformed bracket.

**BYE handling:** BYEs are distributed so each pairs with a real team, which
auto-advances. Two BYEs facing each other would produce a match that can never
have a winner and would permanently break the chain above it.

## What this build added around them

Nothing inside these files changed. `services/matchUpdates.js` guards
*subsequent edits* to their output — the algorithms produce a valid schedule,
and that module is what keeps it valid afterwards.

One thing worth knowing: `assignCourts` gives every match a unique
`(timeSlot, court)` pair, so generated schedules already satisfy the
court-conflict rule that was added in this build.
