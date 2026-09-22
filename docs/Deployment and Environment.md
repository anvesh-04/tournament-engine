---
title: Deployment and Environment
tags: [ops]
updated: 2026-09-22
---

# Deployment & Environment

Client on Vercel, server on Render, MongoDB Atlas. Template:
`server/.env.example`.

## Required

| Var | Note |
|---|---|
| `MONGO_URI` | Atlas connection string |
| `JWT_SECRET` | **The server refuses to boot without it.** `openssl rand -hex 32` |

## Optional — features degrade, nothing breaks

| Var | Without it |
|---|---|
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Email logs instead of sending; in-app notifications still recorded |
| `ANTHROPIC_API_KEY` | Command console says it is unavailable; every other endpoint unaffected |
| `CLIENT_URL` | Invite emails omit the login link |

Gmail needs `smtp.gmail.com`, port 465, and an **App Password** — Google
blocks account passwords for SMTP.

## First run on a fresh database

1. Register — the first account on an empty database becomes super-admin
   ([[Phase 1 - Auth and RBAC]])
2. Create a Sport, then Teams under it, then invite players
3. Create a tournament, generate fixtures, and it appears on the players'
   dashboards

## Deploying this change set

New server dependencies: `bcryptjs`, `jsonwebtoken`, `nodemailer`,
`@anthropic-ai/sdk`. **Set `JWT_SECRET` in Render before deploying** — the
process exits without it.

Existing tournaments keep working: `sportId` and `createdBy` are nullable, so
pre-existing documents load unchanged. They are reachable only by a
super-admin until a sport is assigned.

## Verifying

```bash
cd server && npm test     # 107 tests, no DB needed
cd client && npm run build
```
