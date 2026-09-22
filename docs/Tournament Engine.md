---
title: Tournament Engine
tags: [hub, project]
updated: 2026-09-22
---

# Tournament Engine

MERN tournament and fixture system. The scheduling core is two graph
algorithms; everything built on top of it exists to get those fixtures in
front of the right people and let admins change them safely.

## Start here

- [[Architecture]] — how the pieces fit, and the one rule that shapes all of it
- [[Design System]] — the visual language, and what the redesign pass fixed
- [[Design Principles]] — the constraints this build was held to
- [[Testing]] — how business logic is verified before it reaches the UI
- [[Deployment and Environment]] — env vars, hosting, what is optional

## Build phases

| Phase | Note | Status |
|---|---|---|
| Core algorithms | [[Scheduling Algorithms]] | Pre-existing |
| 0 | [[Phase 0 - Standings]] | Built |
| 1 | [[Phase 1 - Auth and RBAC]] | Built |
| 2 | [[Phase 2 - Multi-Sport Model]] | Built |
| 3 | [[Phase 3 - Notifications]] | Built |
| 4 | [[Phase 4 - AI Admin Commands]] | Built |

## Out of scope

Decided against, deliberately — see [[Design Principles]] for the reasoning:

- SMS notifications (cost not justified)
- Individual-event athletics results and leaderboards (needs a different data
  model entirely — time/distance/score rather than win/loss — and is not an
  extension of the Tournament/Match schema)
- A natural-language search bot for schedule lookups (a filter UI covers it
  more reliably with no hallucination risk)
- Message queues, websockets, Redis — nothing in the spec requires them
