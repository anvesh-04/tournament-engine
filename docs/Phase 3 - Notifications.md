---
title: Phase 3 - Notifications
tags: [phase, notifications, email]
updated: 2026-09-22
---

# Phase 3 — Notifications

Nodemailer over SMTP, plus a stored `Notification` record per user.

## Both, not either

Email can bounce, be filtered, or simply not be read before a player turns up
at the wrong court. The in-app record is the copy they are actually guaranteed
to see. `Notification.emailSent` records which happened, so an admin can tell
"the player was never told" from "the player was told and ignored it".

## Email never fails a request

The mailer returns `{ sent, reason }` and never throws into the request path.
A validated, saved schedule change must not be rolled back because an SMTP
server was briefly unreachable.

Without `SMTP_HOST` the mailer runs in log-only mode — it reports what it
would have sent. Local development and the test suite need no credentials, and
a misconfigured deployment is visible in the logs rather than silent.

## Only timetable changes notify

A `timeSlot` or `court` change sends someone to a different place or time. A
recorded winner does not change anyone's plans, and emailing after every
result would train players to ignore the mails that matter.

Messages always state **both** the old and new value — "your match moved to
slot 5" is useless to someone who wrote down slot 2.

## Where it fires

- `PATCH /api/tournaments/:id/matches/:matchRefId`
- `POST /api/admin/command/confirm` ([[Phase 4 - AI Admin Commands]])
- Player invites ([[Phase 2 - Multi-Sport Model]]) — this one *does* report
  delivery failure to the admin, because an undelivered invite leaves an
  account nobody can get into

## No websockets

The unread indicator polls `GET /api/me/notifications` every 60 seconds.
Nothing else in the app needs a live connection — see [[Design Principles]].

## Files

`server/models/Notification.js`, `server/services/mailer.js`,
`server/services/notifications.js`, `client/src/components/NotificationBell.jsx`
