---
title: Design Principles
tags: [principles]
updated: 2026-09-22
---

# Design Principles

The non-negotiables this build was held to, and where each one shows up.

## 1. No AI feature bypasses existing validation

Any AI-proposed schedule change goes through the same conflict-checking code
as a human edit. Implemented by extracting that logic into
`services/matchUpdates.js` — see [[Architecture]].

Proven by test: *"an AI reschedule that double-books a team is REJECTED by the
shared checker"* in `server/tests/adminCommands.test.js`.

## 2. Bulk or destructive AI changes require explicit confirmation

`POST /api/admin/command` only ever returns a preview. Applying requires a
second call carrying a server-signed action. The signature binds the action
to the approving admin and expires after 10 minutes, so the admin confirms
*exactly* what they were shown. See [[Phase 4 - AI Admin Commands]].

## 3. No infrastructure a feature does not require

No message queue, no websockets, no Redis. The unread-notification indicator
polls one endpoint every 60 seconds; a live connection for that would be
infrastructure in search of a justification. Email is best-effort and
awaited inline.

## 4. Business logic is tested before it is wired to the UI

Every phase added its test suite first. See [[Testing]]. This discipline
caught real bugs in this build, not just in the original one:

- Two unresolved knockout matches (`teamA === null === teamA`) registered as
  "sharing a team" and raised a phantom 409 no admin could clear.
- Re-recording a winner double-filled the next bracket round, showing a team
  playing itself.
- A court could be double-booked: the original check only looked at teams.

## 5. No fabricated metrics or capabilities

Nothing in the code comments, README or UI claims a capability that is not
implemented. Where something is best-effort (email delivery) or unavailable
(no `ANTHROPIC_API_KEY`), the UI says so plainly rather than failing quietly.

## Deviations worth knowing

- **`bcryptjs` rather than `bcrypt`.** Drop-in compatible, pure JavaScript,
  no native build step. `bcrypt` needs compilation toolchains that make
  Windows development and some Render builds fragile.
- **Reads stay public; writes require auth.** Fixtures are noticeboard
  information, and the already-deployed client reads them without a token.
  Every endpoint that *mutates* a tournament requires a scoped admin.
