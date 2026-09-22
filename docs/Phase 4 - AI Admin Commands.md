---
title: Phase 4 - AI Admin Commands
tags: [phase, ai, security]
updated: 2026-09-22
---

# Phase 4 — AI Admin Commands

Plain English in, a validated schedule change out — with the admin in the
loop, always.

## The chain

```
admin types a sentence
  → Claude maps it to ONE fixed action   (strict tool use)
  → validateAction() re-checks it        (hand-written schema)
  → planAction() turns it into updates
  → executePlan() runs the REAL update logic on a loaded doc
  → nothing is saved — the diff is shown to the admin
  → admin confirms
  → re-validated, re-planned, re-executed, THEN saved
  → affected players notified
```

Five independent checks stand between the model's output and the database.

## The model cannot invent a capability

Three actions exist, declared once in `services/adminCommands.js` and rendered
into Anthropic tool definitions from that same source:

- `reschedule_match`
- `reschedule_bulk_by_sport`
- `swap_court`

They are declared as **strict** tools with `additionalProperties: false`, so
the API itself guarantees schema-valid arguments. A fourth tool,
`unsupported_command`, lets "I cannot express this" be a structured answer
rather than prose the server has to interpret. `tool_choice: {type: "any"}`
forces one of them.

The API's schema enforcement is treated as convenience, not as the security
boundary — `validateAction()` re-checks everything from scratch, and rejects
unknown fields rather than dropping them. A silently dropped field is a
command that did something other than what it said.

Model: `claude-opus-5`, effort `low`. The reasoning here is shallow mapping
work; the schema does the heavy lifting.

## Preview and confirm cannot diverge

Both endpoints build the plan through the same `buildPlan()`. The confirm
carries an HMAC signature over the canonical action, bound to the approving
admin's id and timestamped.

That gives three properties:
- altered arguments between preview and confirm are refused
- one admin cannot replay another's approved preview
- a preview older than 10 minutes is refused

The confirm **rebuilds the plan from the current schedule**, not from anything
cached — so a change someone else made in between is caught rather than
silently overwritten.

## The validation guarantee

`executePlan` calls `applyMatchUpdates` from `services/matchUpdates.js` — the
same module the human PATCH endpoint uses ([[Architecture]]). An AI-proposed
double-booking produces the same 409 a human edit would.

Bulk changes are all-or-nothing. A half-applied bulk reschedule leaves the
schedule in a state nobody asked for and nobody reviewed.

## Detail: swapping courts

A straight A↔B swap transiently puts A on B's occupied court and trips the
court-conflict check. Rather than granting the swap an exemption, the plan
parks A on a free court first, so every intermediate state is legal under the
normal rules. With no spare court, the command is refused with an explanation.

## Scope

Sport-admins can only issue commands for their own sport — the tournaments
loaded into scope are filtered by `sportId`, and a named `sportId` is checked
directly so an out-of-scope command is refused rather than returning a
confusing "no matches found".

Only match placement fields are sent to the model. No player names or emails.

## Files

`server/services/adminCommands.js`, `server/services/llm.js`,
`server/routes/adminCommand.js`, `client/src/pages/CommandConsolePage.jsx`
