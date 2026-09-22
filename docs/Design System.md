---
title: Design System
tags: [design, frontend]
updated: 2026-09-22
---

# Design System

The interface was rebuilt against the Real Sports Bar & Grill reference build
(`rs-v2.webflow.io`). What was taken is the visual **system** — palette, type
treatment, structural devices. No logo, wordmark, photography or copy from
that site appears anywhere in this project.

Everything lives in `client/src/index.css`. There is no CSS framework.

## The four moves

1. **Near-black canvas, cream ink.** `#121212` and `#FFF9F4`. Never pure white
   on pure black — the cream is most of why it reads as designed rather than
   as a default dark mode.
2. **Hairlines carry the structure.** `#2B2B2B` and `#4B4B4B` rules, no
   shadows, no elevation. Sections and list rows are divided, not boxed. The
   old card-with-radius-and-border pattern is gone.
3. **Buttons are the only round thing.** Full pills against square everything
   else, including square inputs. That contrast is the signature.
4. **Mono for data, condensed caps for names.** Every label, status, slot and
   figure is IBM Plex Mono, uppercase, wide-tracked. Every team name, fixture
   and page title is the display face at a line-height below 1.

## Type

| Role | Face | Notes |
|---|---|---|
| Display | **Anton** | Stands in for the reference's Countach, which is a licensed Adobe font. Closest freely-licensed match: heavy, condensed, caps-first. Ships one weight. |
| Data & labels | **IBM Plex Mono** | The reference's own mono. 300/400/600. |
| Prose | **IBM Plex Sans** | Pairs natively with Plex Mono. |

All figures are `tabular-nums`, so standings columns align and a changing
score does not shift the layout under it.

## Colour

One accent: `--live` `#33B45A`. It marks live, complete and confirmed, and
nothing else competes with it — which is why a green pill in the fixture list
actually means something.

`--alert` `#D9553F` exists for failure states only. It is deliberately
desaturated so it never reads as a second brand colour.

Status pills are drawn in ink by default; only `COMPLETED` earns the accent.

## What changed beyond styling

The redesign pass also fixed things it surfaced:

- **Write controls are gated on role.** `RoundRobinView` and `BracketView`
  previously rendered Edit buttons and clickable team lines for everyone,
  including signed-out visitors, whose save would then 401. See
  [[Phase 1 - Auth and RBAC]].
- **The bracket is keyboard-operable.** Recording a winner was an `onClick` on
  a `div` — unreachable by Tab, unannounced to a screen reader. It is now a
  real `role="button"` with Enter/Space handling.
- **Landmarks and a skip link.** `header` / `nav` / `main`, plus a skip link,
  so keyboard users are not tabbing the navigation on every page.
- **Skeletons instead of a spinner** on the tournament list, shaped like the
  rows they stand in for so nothing jumps on load.
- **`prefers-reduced-motion`** is honoured throughout.

## Responsive

Two breakpoints, both driven by what actually broke rather than by device
sizes:

- **900px** — the top bar wraps to three rows and stands ~170px tall, so it
  stops being sticky. Pinning that would spend a quarter of a short viewport
  on chrome.
- **620px** — buttons and labels tighten, the role pill drops (the visible
  navigation already implies the role), and fixture rows restack. This took
  the header from ~480px to ~144px at 375px wide.

Verified at 375px: no horizontal overflow, zero elements past the viewport.
