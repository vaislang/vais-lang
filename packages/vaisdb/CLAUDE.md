# CLAUDE.md - VaisDB AI Assistant Guide

## Project Overview

VaisDB is a RAG-native hybrid database written in pure Vais. It combines vector, graph, relational, and full-text search engines into a single database with unified ACID transactions.

## Language

- **Implementation**: Pure Vais (.vais files) with C FFI for system calls
- **Compiler**: [vaislang/vais](https://github.com/vaislang/vais) v1.0.0+
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
Current phase: Test Compilation — Phase 158 strict type coercion 대응 중. 221 TC 에러 (6개 테스트). See ROADMAP.md "현재 작업 (2026-03-29 #4)" for details.

## Compiler Setup
- **Working compiler**: `~/.cargo/bin/vaisc` (canonical install path; override with `VAISC` env var)
  - ⚠️ `/opt/homebrew/bin/vaisc` (v1.0.0, 2026-03-11)는 multi-line import 미지원 — 사용 금지
  - `~/.cargo/bin/vaisc` 또는 `/Users/sswoo/study/projects/vais/target/debug/vaisc` 사용
- **std**: `/tmp/vais-lib/std` → symlink to `/Users/sswoo/study/projects/vais/std`
  - 심링크 없으면: `mkdir -p /tmp/vais-lib && ln -sf /Users/sswoo/study/projects/vais/std /tmp/vais-lib/std`
- **Build command**: `VAIS_DEP_PATHS="$(pwd)/src:/tmp/vais-lib/std" VAIS_STD_PATH="/tmp/vais-lib/std" VAIS_SINGLE_MODULE=1 VAIS_TC_NONFATAL=1 ~/.cargo/bin/vaisc build <test>.vais --emit-ir -o /tmp/<test>.ll --force-rebuild`

## Known Compiler Issues (2026-03-29)
- **Phase 158 strict type coercion**: implicit bool↔i64, int↔float, f32↔f64, str↔i64 금지 — 명시적 `as` 캐스트 필수
  - `true` → i64: `true as i64`
  - `x == y` → i64: `(x == y) as i64`
  - `42` → f64: `42 as f64` 또는 `42.0`
  - `3.14` → i64: `3.14 as i64`
  - integer widening (i8→i64 등)은 여전히 implicit 허용
  - 문자열 보간 `"{var}"`는 정상 작동 (TC에서 어떤 타입이든 허용)
  - match arm에서 void 함수 호출 (예: `buf.write_f64_le(x)`)은 Unit 타입으로 추론됨 (컴파일러 수정 완료)
  - `x & 1 == 1` 같은 bitwise AND 후 비교는 `(x & 1) == 1`로 괄호 필요 (C/Rust와 동일 우선순위)
- `!` operator returns `bool` (not bitwise NOT) — use `0xFF ^ val` for bitwise NOT
- Vec<struct> generic erasure: elements stored as i64 in codegen
- `R vec_variable` inside `I {}` block returns pointer, not value — use if-else instead of early return
- `L EnumName = ... | ...` enum syntax: TC accepts but parser rejects → use `E EnumName { ... }` brace syntax
- `str.as_bytes()`: not a valid method on str — use `s[i]` indexing + `__strlen(s)` for length
- `str.push_str()`: not a valid method on str — use `s = s + "..."` string concatenation
- `&[u8]` ↔ `*u8`: slice and pointer types not interchangeable in TC
- Vec<struct> field access via indexing: `v[i].field` fails — use `tmp := mut v[i]; tmp.field`
- Result Err() codegen: VaisError struct를 i64로 저장 (clang 에러 원인)

## Resolved Compiler Issues (2026-03-24)
- ✅ Pointer auto-deref: `*Mutex<T>.lock()` now works (calls.rs + collections.rs fix)
- ✅ Tuple→struct: no native tuple support — use named structs (DecodedTid, LsnAllocation, etc.)
- ✅ Move semantics: &T/&mut T parameters exempted from move checking
- ✅ Enum struct variant TC: expansion.rs enum_name preservation
- ✅ bool→i64, int↔float, str↔i64 implicit coercion

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
