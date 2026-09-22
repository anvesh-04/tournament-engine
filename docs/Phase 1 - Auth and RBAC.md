---
title: Phase 1 - Auth and RBAC
tags: [phase, auth, security]
updated: 2026-09-22
---

# Phase 1 — Auth & RBAC

bcryptjs for hashing, JWT for sessions, three roles.

| Role | Scope |
|---|---|
| `super-admin` | Everything, across all sports |
| `sport-admin` | Exactly one sport |
| `player` | Read-only, own team |

## Decisions worth remembering

**The JWT is not trusted for authorisation.** `requireAuth` re-reads the user
from the database on every request. If role/sport claims were read from the
token, demoting an admin would not take effect until their token expired — up
to 7 days. The database read makes revocation immediate.

**No default `JWT_SECRET`.** The server refuses to boot without one. A
development fallback secret is a secret that ships, and every token it ever
signed is forgeable by anyone who reads the repo.

**Self-registration cannot mint an admin.** Otherwise the whole role system is
decorative. The one exception is bootstrapping: the first account on an empty
database becomes the super-admin, because there is no other way to create the
first privileged user.

**Login errors are deliberately vague.** "Invalid email or password" for both
failure modes — distinguishing them turns the form into an account-enumeration
oracle.

**An unscoped resource does not fall through to allow.** `canAccessSport`
returns `false` for a null `sportId` for anyone but a super-admin. This is the
case most likely to be got wrong, and it has a test.

**Role mismatch redirects home, not to login.** A player hitting an admin
route is authenticated, just not authorised; bouncing them to a login form
they already completed is confusing. The client guard is usability only —
every endpoint re-checks server-side.

## Files

- `server/models/User.js` — role/scope invariants in a `pre("validate")` hook
- `server/services/auth.js` — pure decision functions
- `server/middleware/auth.js` — `requireAuth`, `requireRole`, `requireSportAccess`
- `server/routes/auth.js`
- `client/src/auth.jsx` — `AuthProvider`, `useAuth`, `RequireAuth`
