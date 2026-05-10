# CLAUDE.md - VaisDB AI Assistant Guide

## Project Overview

VaisDB is a RAG-native hybrid database written in pure Vais. It combines vector, graph, relational, and full-text search engines into a single database with unified ACID transactions.

## Language

- **Implementation**: Pure Vais (.vais files) with C FFI for system calls
- **Compiler**: [vaislang/vais](https://github.com/vaislang/vais) built from the
  current certified source baseline
- **Build**: `vaisc build`

## Project Structure

```
src/
├── storage/       # Page manager, WAL, buffer pool, B+Tree
├── sql/           # SQL parser, executor, optimizer
├── vector/        # HNSW index, quantization, vector storage
├── graph/         # Property graph, traversal, path finding
├── fulltext/      # Inverted index, BM25, tokenizer
├── planner/       # Hybrid query planner, cost model, score fusion
├── rag/           # Semantic chunking, context preservation, RAG_SEARCH
├── server/        # TCP server, wire protocol, connection pool
├── ops/           # Production operations: backup, metrics, VACUUM, REINDEX
├── security/      # Authentication, RBAC, RLS, encryption, TLS, audit
├── client/        # Client libraries
└── main.vais      # Entry point
```

## Key Design Decisions

1. **Single-file storage** (like SQLite) - one `.vaisdb` file per database
2. **WAL-based durability** - write-ahead log with fsync for ACID
3. **Page-based storage** - all engines share the same page manager
4. **Unified query planner** - cost-based optimizer across all engine types

## Dependencies

- Vais standard library:
  - `std/file.vais` - fsync, mmap, flock
  - `std/net.vais` - TCP server
  - `std/sync.vais` - Mutex, RwLock for concurrency
  - `std/hashmap.vais` - String-keyed HashMap

## Coding Conventions

- Follow Vais standard style (single-char keywords: `F`, `S`, `I`, `L`, `M`, etc.)
- Use `mut` for mutable bindings (e.g., `x := mut 0;`, `F method(mut self, ...)`, `&mut Type`)
- All public APIs must have doc comments
- Error handling: use `Result<T, E>` with `?` operator

## Testing

- Unit tests per module
- Integration tests for cross-engine queries
- Benchmark tests against reference implementations (SQLite for SQL, HNSW lib for vector)

## Roadmap Reference

See [ROADMAP.md](ROADMAP.md) for detailed phase breakdown.
Current promoted gate: package codegen `261/261`, runtime smoke `34/34`.

Historical Phase Ω notes and intermediate failure counts are not active work.
Do not treat old references to partial package counts, old phase names, or old
compiler issue lists as current blockers. Use the root coordination roadmap and
`compiler/scripts/check-integrity.sh` as the source of truth.

## Compiler Setup

- Canonical aggregate gate:
  `cd /Users/sswoo/study/projects/vais/compiler && bash scripts/check-integrity.sh`
- VaisDB runtime gate:
  `cd /Users/sswoo/study/projects/vais/compiler && cargo test -p vaisc --test e2e --release phase_vaisdb_runtime_smoke -- --nocapture --test-threads=1`
- Do not use `VAIS_SINGLE_MODULE=1` or `VAIS_TC_NONFATAL=1` for certification;
  they can hide real cross-module or type-checking failures.

## Current Non-Claims

The promoted smokes do not certify product-complete SQL, full-text execution,
long-running concurrency, external deployment, or a full crash matrix. Add a
dedicated runtime smoke before promoting any of those claims.

## VAIS Ecosystem

> 전체 생태계 맵: [../../VAIS-ECOSYSTEM.md](../../VAIS-ECOSYSTEM.md)
> 이 프로젝트는 `vaislang/vais-lang` 모노레포의 `packages/vaisdb/`에 위치합니다.

### Position in Ecosystem
```
vais (compiler + std) ← upstream (별도 repo: vaislang/vais)
    ↓
vaisdb ← this package
    ↓
vais-server (native query API 사용) ← 같은 모노레포: ../vais-server/
```

### Upstream Dependencies
| Source | Path | Interface |
|--------|------|-----------|
| vais compiler | (별도 repo) vaislang/vais | `vaisc build`, type system, codegen |
| vais std | (별도 repo) vaislang/vais/std/ | file.vais, net.vais, sync.vais, hashmap.vais |

### Downstream Dependencies
| Project | Path | 사용하는 인터페이스 |
|---------|------|-------------------|
| vais-server | `../vais-server/` | wire protocol, query API |

### 작업 전 체크리스트
- **새 기능 구현 전**: `../../VAIS-ECOSYSTEM.md` "Shared Components" 확인 — std에 이미 있는 기능 재구현 금지
- **컴파일러 이슈 발생 시**: vaislang/vais ROADMAP.md 확인하여 이미 수정 중인지 체크
- **wire protocol 변경 시**: `../vais-server/src/db/` 모듈에 영향 → `../vais-server/ROADMAP.md` 확인
- **query API 변경 시**: `../vais-server/src/db/query.vais`의 QueryBuilder와 호환성 확인
