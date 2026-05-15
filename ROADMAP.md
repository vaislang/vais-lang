# VAIS Lang Monorepo Roadmap

Last verified: 2026-05-10

This root roadmap is current-only. Old monitor plans, stale package failure
counts, and resolved "server/web reactivation blocked" claims were removed so
agents do not treat them as active work.

## Current Status

The active source of truth for cross-repository coordination is
`/Users/sswoo/study/projects/vais/ROADMAP.md`.

Current promoted package gates:

| Package | Current gate |
|---|---|
| `packages/vaisdb` | package codegen `261/261`, runtime smoke `34/34` |
| `packages/vais-server` | runtime smoke `15/15` |
| `packages/vais-web` | runtime smoke `61/77` with credential/network-gated cases skipped, unit `390/390`, ecosystem package tests `3272/3272`, full-build `24/24` |

## Scope

Use package-level roadmaps for package-local work:

| Area | Source of truth |
|---|---|
| vaisdb package work | `packages/vaisdb/ROADMAP.md` if present, otherwise root coordination roadmap |
| vais-server package work | `packages/vais-server/ROADMAP.md` if present, otherwise root coordination roadmap |
| vais-web package work | `packages/vais-web/ROADMAP.md` |
| compiler work | `/Users/sswoo/study/projects/vais/ROADMAP.md` and `/Users/sswoo/study/projects/vais/compiler/ROADMAP.md` |

This file only tracks cross-package work that does not naturally belong to a
single package.

## Current Cross-Package Work

No active cross-package task is open in `lang/` root.

Next cross-package work must be promoted from the root coordination roadmap and
must name the exact package contract it certifies.

## Do Not Resurface

The following are not active problems in this roadmap:

- Old monitor FFI plans from April 2026.
- Old claims that vais-server or vais-web reactivation is blocked behind Core.
- Old package failure counts predating the current promoted gates.
- Historical notes about cancelled app-level work outside `lang/packages/*`.
