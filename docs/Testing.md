---
title: Testing
tags: [testing]
updated: 2026-09-22
---

# Testing

```bash
cd server && npm test
```

Zero dependencies. `server/tests/harness.js` wraps node's own `assert` with
pass/fail reporting; `run-all.js` runs each suite in its own process so one
suite's environment variables or module cache cannot influence the next.

## Coverage

| Suite | Tests | Covers |
|---|---|---|
| `standings.test.js` | 15 | Points, aggregation, ordering, BYE exclusion |
| `auth.test.js` | 25 | JWT, bearer parsing, sport ownership, middleware |
| `matchUpdates.test.js` | 22 | Conflicts, validation, propagation, batches |
| `notifications.test.js` | 11 | What is notifiable, message wording |
| `adminCommands.test.js` | 31 | Action schema, planning, preview signing |
| `llm.test.js` | 13 | Tool schema, context snapshot, prompt guardrails |

107 tests, all passing.

## Why these are unit tests and not integration tests

Decisions live in `services/`, away from Express and Mongoose, so they can be
exercised directly. A plain object stands in for a Tournament document because
the service only reads `matches` / `numCourts` and mutates match fields — the
identical code path runs either way.

There is no end-to-end suite because the only configured `MONGO_URI` points at
the live Atlas cluster, and a test run that registers users and rewrites
fixtures does not belong there. Adding `mongodb-memory-server` would close
that gap.

## Tests that exist because something went wrong

- *"unresolved knockout matches are not treated as sharing a team"*
- *"re-recording the same winner does not double-fill the next round"*
- *"slot 0 is reported as 0, not swallowed as a falsy value"* (×2 — the
  notification wording and the AI context snapshot both had this trap)
- *"an unscoped resource does NOT fall through to allow"*

See [[Design Principles]].
