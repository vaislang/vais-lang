# VaisDB Roadmap

Last verified: 2026-05-03

This file is intentionally current-only. Historical Phase Ω logs, intermediate
failure counts, and resolved "not implemented" notes were removed from the
active roadmap so agents do not treat solved package reactivation work as open
risk.

## Current Status

The active source of truth for cross-repository coordination is
`/Users/sswoo/study/projects/vais/ROADMAP.md`.

Current promoted VaisDB gate:

| Gate | Current status |
|---|---|
| Package codegen | `vaisdb=261/261` |
| Runtime smoke | `VAISDB RUNTIME smoke=28/28` |
| Aggregate check | `cd compiler && bash scripts/check-integrity.sh` |

There is no active `vaisdb/src/**/*.vais` codegen failure list in this roadmap.
Do not resurrect older partial package counts or partial smoke counts from
previous phase logs.

## Certified Surface

The promoted gate verifies bounded runtime behavior across:

- vector distance and vector storage byte round-trips;
- HNSW node, search, insert, delete, WAL, bulk, multi-layer recall, WAL-enabled
  bulk graph path, and vector storage WAL paths;
- SQL catalog schema, parser/planner, planner precision, and plan formatting;
- WAL segment discovery, checkpoint/recovery, and embedded durability;
- package-level codegen for all `261` VaisDB source files.

These gates prove the promoted surfaces. They do not imply full product
database completeness.

## Not Certified Yet

These are active non-claims, not current regressions:

- product-complete SQL coverage beyond the promoted parser/planner/runtime
  smokes;
- product-complete vector database quality/recall/scale guarantees beyond the
  promoted bounded fixtures;
- full-text execution through `FULLTEXT_MATCH` beyond planner recognition unless
  a later gate explicitly promotes it;
- external deployment, long-running concurrency, crash-matrix, and production
  operations coverage beyond the promoted durability smokes.

## Next VaisDB Work

No VaisDB package task is currently open here.

Start a new VaisDB task only when the root coordination roadmap promotes one
bounded downstream gate. The task must state whether it is product/API drift, a
compiler regression, or an unsupported non-Core feature before changing the
frozen Core compiler.

## Validation

Use these commands for VaisDB handoff and closeout:

```bash
cd /Users/sswoo/study/projects/vais/compiler
cargo test -p vaisc --test e2e --release phase_vaisdb_runtime_smoke -- --nocapture --test-threads=1
bash scripts/check-integrity.sh
git diff --check
git -C ../lang diff --check
```
