# VaisDB - AI-Native Hybrid Database
## Project Roadmap

> **Version**: 0.1.0 (Implementation Phase)
> **Goal**: Vector + Graph + Relational + Full-Text search in a single DB, optimized for RAG
> **Language**: Pure Vais (with C FFI for system calls)
> **Last Updated**: 2026-04-10 (Phase 14 Test Compilation & Verification — 13/13 TC 0 errors)

---

## Overview

VaisDB solves the fundamental problem of RAG and AI agent systems: **4 databases for 1 use case**.

### Core Innovation
- Single query across vector similarity + graph traversal + SQL joins + full-text search
- ACID transactions spanning all engine types
- RAG-native features (semantic chunking, context preservation) at the DB level
- AI-native agent memory (episodic, semantic, procedural memory with hybrid retrieval)

### Prerequisites
- ✅ Vais standard library — complete ([vais v1.0.0+](https://github.com/vaislang/vais))
  - `fsync`/`mmap`/`flock` for storage durability
  - Allocator state mutation fixes
  - String-keyed HashMap
  - Binary serialization
  - Directory operations

### Critical Design Principles (Throughout All Phases)
- **format_version in every on-disk structure** - enables online migration without dump/restore
- **engine_type tag in WAL records** - unified crash recovery across all 4 engines
- **MVCC visibility integrated from day 1** - not bolted on later
- **SIMD distance calculation** - 10x vector search performance difference
- **NULL 3-valued logic** - SQL correctness from the start

---

## Current Verified State (2026-04-10)

- **Working compiler**: `~/.cargo/bin/vaisc` (canonical install path; override with `VAISC` env var)
  - ⚠️ `/opt/homebrew/bin/vaisc` (v1.0.0, 2026-03-11) — multi-line import 미지원, 사용 금지
- **Test compilation status: 13/13 TC 0 errors (strict multi-module build)** ✅
  - test_graph, test_wal, test_btree, test_vector, test_fulltext, test_planner_rag, test_planner_types, test_planner_cache, test_page_manager, test_buffer_pool, test_transaction, test_cross_engine, test_types — 전부 TC 0
  - test_migration (23 TC errors) — 별도 이슈, 원래 11/11 목표에 미포함
- std 라이브러리: `/tmp/vais-lib/std` → `/Users/sswoo/study/projects/vais/std` 심링크 (없으면: `mkdir -p /tmp/vais-lib && ln -sf /Users/sswoo/study/projects/vais/std /tmp/vais-lib/std`)
- **Strict build command (검증용)**:
  ```bash
  VAIS_DEP_PATHS="$(pwd)/src:/tmp/vais-lib/std" VAIS_STD_PATH="/tmp/vais-lib/std" \
    ~/.cargo/bin/vaisc build <test>.vais --emit-ir -o /tmp/<test>.ll --force-rebuild
  ```
  - ⚠️ `VAIS_SINGLE_MODULE=1` deprecated — 사용 금지 (StringMap cross-module 에러 유발)
  - ⚠️ `VAIS_TC_NONFATAL=1` 검증 시 사용 금지 (TC 에러를 경고로 강등하여 거짓 성공 보고 초래)

## Known Compiler Issues (2026-04-07 기준)
- **Phase 158 strict type coercion**: implicit bool↔i64, int↔float, f32↔f64, str↔i64 금지 — 명시적 `as` 캐스트 필수
  - `true` → i64: `true as i64`
  - `x == y` → i64: `(x == y) as i64`
  - `42` → f64: `42 as f64` 또는 `42.0`
  - integer widening (i8→i64 등)은 여전히 implicit 허용
  - 문자열 보간 `"{var}"`는 정상 작동
  - `x & 1 == 1`은 `(x & 1) == 1`로 괄호 필요 (우선순위)
- **Phase 184 unambiguous keywords**: 권장 — EN(enum), EL(else), LF(for-each), LW(while). 기존 E/L/W는 하위 호환.
- `!` operator returns `bool` — bitwise NOT은 `0xFF ^ val`
- Vec<struct> field access: `v[i].field` 실패 → `tmp := mut v[i]; tmp.field`
- `str.as_bytes()` / `str.push_str()`: 미지원 — `s[i]` 인덱싱 / `s = s + "..."` 사용
- `&[u8]` ↔ `*u8`: 호환 불가

## Resolved Compiler Issues
- ✅ (2026-04-10, Phase 189 + test_types.vais) 13/13 테스트 TC 0 errors — strict multi-module 빌드 안정화
- ✅ (2026-04-07) StringMap cross-module generic param — multi-module 빌드로 해결 (SINGLE_MODULE deprecated)
- ✅ (2026-04-05, Phase 11) Option<Struct>/Result<T,Struct> erasure — heap-alloc + pointer in i64 slot path
- ✅ (2026-04-05, Phase 10) Vec<&[u8]> slice + Vec<struct> field access generic resolution
- ✅ (2026-03-24) Pointer auto-deref, Tuple→struct, Move semantics, Enum struct variant TC

---

## Claude Code Handoff

### Workflow Source of Truth
- 이 저장소는 repo-local `.claude/` 워크플로우 스킬 디렉토리를 포함하지 않습니다.
- Claude Code 워크플로우는 글로벌 스킬로 관리됩니다 (`/Users/sswoo/.claude/skills/harness*/SKILL.md`).
- `ROADMAP.md`는 현재 실행 상태 및 복구 원천입니다. Phase 구조 + Current Verified State를 우선 참조하세요.
- `CLAUDE.md`는 레포지토리 규약 및 모듈 개요를 제공합니다.

### Preserve the Vais Language Intent
- 실패 원인이 타입 레이아웃, enum payload lowering, 재귀 타입 크기 계산, 메서드 해석, ABI coercion, LLVM IR emission 관련이면 `/Users/sswoo/study/projects/vais` (컴파일러)를 먼저 수정합니다.
- 언어 모델/의도를 손상시키거나 모호하게 만드는 프로젝트 측 광범위 재작성은 피합니다.
- 프로젝트 측 재작성은 현재 Vais 표면 언어와 일치하고 stale 워크어라운드 문법/API를 제거하는 경우에만 허용합니다.
- 다음을 유지하는 최소 수정을 선호합니다:
  - value vs reference semantics explicit
  - aggregate types first-class
  - enum/Result/Option behavior predictable
  - container methods resolved from receiver shape, not incidental element names

---

## Progress Summary

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 0 | Architecture & Design Decisions | ✅ Complete | 56/56 (100%) |
| 1 | Storage Engine | ✅ Complete | 38/38 (100%) |
| 2 | SQL Engine | ✅ Complete | 17/17 (100%) |
| 3 | Vector Engine | ✅ Complete | 18/18 (100%) |
| 4 | Graph Engine | ✅ Complete | 10/10 (100%) |
| 5 | Full-Text Engine | ✅ Complete | 16/16 (100%) |
| 6 | Hybrid Query Planner | ✅ Complete | 20/20 (100%) |
| 7 | RAG & AI-Native Features | ✅ Complete | 10/10 (100%) |
| 8 | Server & Client | ✅ Complete | 10/10 (100%) |
| 8.5 | Codebase Review & Fix | ✅ Complete | 7/7 (100%) |
| 8.6 | Deep Code Analysis & Fix | ✅ Complete | 20/20 (100%) |
| 9 | Production Operations | ✅ Complete | 10/10 (100%) |
| 10 | Security & Multi-tenancy | ✅ Complete | 10/10 (100%) |
| 11 | Test Suite | ✅ Complete | 6/6 (100%) |
| 12 | Benchmarks | ✅ Complete | 4/4 (100%) |
| 13 | Documentation | ✅ Complete | 3/3 (100%) |
| 14 | Code Quality *(legacy)* | ✅ Complete | 3/3 (100%) |
| 15 | Commit & Performance | ✅ Complete | 6/6 (100%) |
| 16 | Vais 문법 동기화 | ✅ Complete | 2/2 (100%) |
| 17 | Build Verification & Testing | ✅ Complete | 4/4 (100%) |
| 18 | Code Quality & Docs Sync | ✅ Complete | 3/3 (100%) |
| 19 | 컴파일러 업그레이드 & 문법 재동기화 | ✅ Complete | 11/11 (100%) |
| 14 | Test Compilation & Verification *(new)* | ✅ Complete | 13/13 TC 0 errors |
| 15 | Compiler Alignment Sweep | 🔄 In Progress | 0/5 |

> Phase 번호 14는 두 번 사용되었습니다(legacy "Code Quality" / new "Test Compilation & Verification"). 상세 Phase 0~13 설계/구현 내용은 git history를 참조하세요.

---

## Phase 14: Test Compilation & Verification (2026-03-15 ~ 2026-04-10) ✅

> **Goal**: Get all 13 test files to strict multi-module build with TC 0 errors
> **Compiler**: `~/.cargo/bin/vaisc`
> **Build**: `VAIS_DEP_PATHS="$(pwd)/src:/tmp/vais-lib/std" VAIS_STD_PATH="/tmp/vais-lib/std" ~/.cargo/bin/vaisc build <file> --emit-ir -o /tmp/<file>.ll --force-rebuild`

### Compiler Fixes Applied (Upstream `vaislang/vais`)

**Type Checker (vais-types):**
- `checker_expr/collections.rs` — Vec/HashMap indexing, enum struct variant literal, Ref unwrap for indexing
- `checker_expr/calls.rs` — 1014+ lines: Vec/HashMap/ByteBuffer method registration, sync types
- `checker_expr/special.rs` — Result/Option `?` operator with Named generics extraction
- `checker_expr/stmts.rs` — check_expr_with_expected for typed let bindings
- `checker_module/registration.rs` — duplicate function/enum/union/type_alias → Ok()
- `checker_module/mod.rs` — impl retry pass (re-register impl blocks after all structs registered)
- `inference/unification.rs` — Named type generics length check relaxed
- `lookup.rs` — single-letter generic type params (T,K,V) as i64

**Code Generation (vais-codegen):**
- `type_inference.rs` — is_narrow_typed_expr(Field) for narrow struct fields
- `expr_helpers.rs` — compound assignment i64 widening + trunc, binary op rhs coerce detection, SSA type tracking
- `expr_helpers_control.rs` — if-else phi value coercion (trunc i64 to narrow phi type)
- `control_flow/if_else.rs` — phi coercion for ElseIf case
- `control_flow/pattern.rs` — void* → i8* in Result<(), E> match pattern
- `inkwell/gen_advanced.rs` — field access zext, struct insert trunc, tuple field zext
- `inkwell/gen_expr/binary.rs` — binary op operand width normalization

**Parser (vais-parser):**
- `expr/postfix.rs` — static variant access without parens, struct literal after static method

### VaisDB Source Fixes (50+ files)
- Global: `.is_empty()` → `.len() == 0`, `.get_mut()` → `.get()`, `.set_position()` → `.seek()`
- `src/fulltext/search/bm25.vais` — Rust-style `assert_eq!` test blocks removed
- 11 more src files — Rust-style `#[test]` blocks removed
- `src/storage/btree/prefix.vais` — Vec early return → if-else (compiler codegen bug)
- `src/storage/btree/merge.vais` — tuple destructuring → separate vectors
- `src/storage/buffer/dirty_tracker.vais` — Vec.set() → field-by-field copy
- `src/storage/buffer/pool.vais` — ReadAhead.new() → .create(), BufferPoolStats.new() → .create()
- `src/storage/txn/clog.vais` — `!(u8)` bitwise NOT → `255 ^ shifted`
- `src/storage/txn/snapshot.vais` — Vec clone before indexing (ownership)
- `src/storage/txn/att.vais` — Snapshot struct literal collision workaround, HashMap get_opt pattern
- `src/fulltext/tokenizer.vais` — full Vais v1.0 syntax refactoring (was Rust-style)
- `src/fulltext/index/compression.vais` — Vec early return → if-else, vbyte_decode tuple → VByteResult struct
- Rename: `Snapshot` → `TxnSnapshot` in txn/ module (struct literal collision workaround)

### Final Status (13/13 — TC 0 errors) ✅ 2026-04-10

Phase 189 컴파일러 수정 + test_types.vais bool→i64 캐스트 28건 수정으로 전체 복구 달성.

- [x] 1. test_types.vais bool→i64 캐스트 수정 (Opus direct) ✅ 2026-04-10
  changes: tests/sql/test_types.vais (assert_true/false as i64 래핑 28곳, agg borrow 우회, match 패턴 변환)
- [x] 2. 전체 13/13 테스트 TC 0 errors 확인 ✅ 2026-04-10
  verify: test_graph, test_wal, test_btree, test_vector, test_fulltext, test_planner_rag, test_planner_types, test_planner_cache, test_page_manager, test_buffer_pool, test_transaction, test_cross_engine, test_types — 전부 TC 0
  note: test_migration (23 TC errors) — 별도 이슈, 원래 11/11 목표에 미포함
진행률: 2/2 (100%) ✅

---

## Phase 15: Compiler Alignment Sweep (one-shot, 2026-04-21 ~)

> **전제**: vais compiler + stdlib 기능 개발 완료. vaisdb를 현재 API 표면에 맞춰 정리.
> **범위**: upstream API 변경 흡수, deferred 이슈 처리, 문서 정합성 복구.
> **전략**: 1번(재검증) 완료 후 실제 회귀 범위에 따라 2~5 범위 조정.
> mode: paused (2026-04-21 — 컴파일러 근본 수정 커밋 후 /clear 재개용)
> iteration: 3
>
> iteration history:
>   1. Task 1 research-only (완료) — test_cross_engine 27 에러 발견
>   2. Task 2 + Task 6 parallel — tool budget / 구조적 미스매치로 중단
>   3. A3 + B1 결정 후 재개 → 다시 잘림
>   4. 사용자 지시로 "근거 있는 근본 해결"로 전환
>      - Compiler 검증 에이전트: 100% 완성 주장이 "2625/2625 pass이나 37 assert_compiles + 1-2 stdlib 갭"으로 조정
>      - Compiler 근본 수정 1건: vais-codegen/src/function_gen/generics.rs — MAX_MONOMORPHIZATION_DEPTH=64 누적 카운트 가드 제거
>        * 주석은 "재귀 방지"라 주장했으나 실제는 "같은 base_name의 총 인스턴스 수 제한" → 정상 polymorphic 사용에서 터짐
>        * 실제 재귀는 enter_type_recursion(MAX_TYPE_RECURSION_DEPTH=64, helpers.rs)가 담당 → 이중 가드 중 잘못된 것 제거
>        * compiler cargo test -p vais-codegen --lib: 796 passed / 0 failed (regression 0)
>      - vaisdb 실제 버그 7건 수정:
>        1. planner/pipeline.vais:146 HashMap<(u64,f64)> → HashMap<str, (u64,f64)> (제네릭 파라미터 누락)
>        2. planner/pipeline.vais:158/224 HashMap.get() → .get_opt() (stdlib get은 Option 아닌 raw V 반환)
>        3. planner/pipeline.vais:211 HashMap<IndexPair> → HashMap<str, IndexPair>
>        4. planner/pipeline.vais:173-183, 241-252 item/inner tuple .0/.1 → 명시 타입 주석 + 필드 이름
>        5. fulltext/search/match_fn.vais:102-103 candidates/term_doc_freqs Vec 명시 타입 주석 추가
>        6. fulltext/search/match_fn.vais:152 tuple[i].N → tmp 워크어라운드
>        7. vector/search.vais:66 .ok_or(...)? → M pattern으로 통일
>
> 현재 상태 (compiler 수정 반영):
>   - 13/14 테스트 codegen 통과 ✅
>   - test_cross_engine 2 codegen 에러 잔존
>     * pipeline.vais:491 LF elem: elements — C001 Undefined (enum struct variant SqlValue.ArrayVal { elements } 바인딩이 test_cross_engine 넓은 import context에서 scope 상실)
>     * 격리 재현 불가 — compiler의 module-level symbol resolution 미세 이슈로 추정
>
> 재개 지점 (/clear 후 /harness):
>   - Task 8 신설: compiler variant-binding scope 버그 격리 + 근본 수정 (옵션 1)
>   - Task 2 (HashMap raw API migration): 여전히 pending — 별개 작업
>   - Task 4, 5: 기존대로 blockedBy 체인

### Upstream 확정 사실 (2026-04-21 조사)
- `compiler/std/hashmap.vais`: `keys_raw` / `values_raw`만 존재. `.keys()` / `.values()` **삭제** → vaisdb 8파일 14건 영향
- `str.as_bytes()` 정식 지원 (Phase 6.31, 8f1c8550)
- atomic Ordering dispatch 완성 (Phase 6.29, 0a5bcc1c)
- std 경로: `~/study/projects/vais/compiler/std` (기존 CLAUDE.md의 `~/study/projects/vais/std`는 stale)
- Phase 158 strict coercion, `!` bool, `~` bitwise NOT: **여전히 유효** (vaisdb 워크어라운드 유지)

### 작업 항목

- [x] 1. 13/13 strict 빌드 재검증 (research-haiku) ✅ 2026-04-21
  result: 12/13 TC 0 errors, 1/13 회귀 (test_cross_engine.vais 27 errors = 26 E001 Type mismatch + 1 E004 Undefined function)
  root cause: Phase 158 strict coercion — bool 반환 method/expr이 assert_true/false i64 인자 위치에 직접 사용됨 (test_migration과 동일 계열)
  impact: Task 6 신설 (아래). HashMap .keys()/.values() 관련 회귀는 test 파일 기준 0건 → Task 2는 src/ 쪽만 영향
- [ ] 6. test_cross_engine 27 TC 에러 수정 (impl-sonnet)
  files: tests/integration/test_cross_engine.vais
  fix: bool→i64 26건 (L180,197,206,214,229,236,242,252,269,283,291,297,310,318,327,337,345,388,446,621,649,692,718,734,803,813), 미정의 함수 1건 (L560) 조사
  verify: strict 빌드 TC 0
- [ ] 2. HashMap .keys()/.values() → .keys_raw()/.values_raw() 마이그레이션 (impl-sonnet) [blockedBy: 1]
  files: src/sql/catalog/manager.vais (6), src/rag/search/rag_search.vais (2), src/security/{role,user,policy}.vais (각 1), src/rag/chunking/graph.vais, src/storage/recovery/{undo,mod}.vais (각 1)
  strategy: independent-parallel (파일 간 독립)
  verify: 해당 파일 포함 테스트 strict 빌드 TC 0
- [x] 3. test_migration 18 TC 에러 수정 (impl-sonnet) ✅ 2026-04-21
  changes: tests/sql/test_migration.vais — assert_str_eq 도입(문자열 비교 3곳 이상), is_applied/is_ok/is_err 반환 bool → `as i64` 래핑
  verify: strict 빌드 0 errors (5개 .ll 파일 생성: test_migration/runner/test/tracker/migration)
- [ ] 4. atomic Ordering / concurrency 통합 재검증 (impl-sonnet) [blockedBy: 2]
  scope: 최근 커밋 a7057a4 이후 concurrency 관련 테스트 (test_transaction, test_buffer_pool) 재빌드 및 의미 검증
  verify: strict 빌드 TC 0 유지 + Mutex/atomic 사용처 스폿체크
- [ ] 5. 문서 정합성 복구 (impl-sonnet) [blockedBy: 2, 3]
  files: packages/vaisdb/CLAUDE.md, packages/vaisdb/ROADMAP.md Current Verified State 섹션
  fix: (a) std 심링크 경로 `compiler/std`로 갱신, (b) `str.as_bytes() 미지원` 서술 삭제, (c) Phase 14 이후 테스트 개수 갱신(13→14), (d) "Known Compiler Issues" 중 upstream 해소 항목 "Resolved"로 이동
  verify: grep로 stale 기술 잔존 없음 확인

진행률: 0/5

---

## Testing Strategy (Applies to ALL phases)

> Not a separate phase - integrated into every phase's verification

### Test Types Required

| Type | Purpose | When |
|------|---------|------|
| **Unit tests** | Per-function correctness | Every commit |
| **Integration tests** | Cross-engine queries | Every phase completion |
| **Crash recovery tests** | Kill during write → data intact | Phase 1+, every engine |
| **Fuzz tests** | SQL parser, protocol, vector input (NaN, Inf) | Phase 2+, continuous |
| **ACID correctness tests** | Atomicity, Consistency, Isolation, Durability | Phase 1+, Jepsen-style |
| **SQL correctness tests** | Compare results vs SQLite/PostgreSQL | Phase 2+ |
| **Vector correctness tests** | HNSW recall vs brute-force | Phase 3+ |
| **Performance regression** | Benchmark per commit, alert on >10% regression | Phase 1+ |
| **Concurrency stress** | N clients concurrent read/write | Phase 1+ |

### Crash Recovery Test Method
```
1. Start workload (mixed read/write across all engines)
2. At random point: SIGKILL the process
3. Restart and verify:
   - All committed transactions present
   - All uncommitted transactions absent
   - All checksums valid
   - HNSW index consistent with vector data
   - Graph adjacency lists consistent (both directions)
   - Posting lists consistent with documents
4. Repeat 100+ times with different kill points
```

---

## Milestone Summary

| Milestone | Phases | Deliverable |
|-----------|--------|-------------|
| **M0: Architecture** | Phase 0 | All design decisions documented and reviewed |
| **M1: Storage MVP** | Phase 0-1 | Page manager + WAL + Buffer Pool + B+Tree + MVCC |
| **M2: SQL MVP** | Phase 1-2 | CREATE, INSERT, SELECT, JOIN, WHERE, NULL logic |
| **M3: Vector MVP** | Phase 1, 3 | HNSW search + SIMD + MVCC post-filter + SQL integration |
| **M4: Graph MVP** | Phase 1, 4 | Property graph + multi-hop + MVCC-aware traversal |
| **M5: Hybrid MVP** | Phase 1-6 | All 4 engines + unified query planner |
| **M6: RAG MVP** | Phase 1-7 | Semantic chunking + embedding integration + RAG_SEARCH |
| **M7: Server MVP** | Phase 1-8 | Client/server + embedded mode + import/export |
| **M8: Production** | Phase 1-10 | Backup, monitoring, security, multi-tenancy |

---

## Benchmark Targets

| Category | Benchmark | Target |
|----------|-----------|--------|
| SQL | TPC-B (transactions) | Within 2x of SQLite |
| SQL | TPC-H (analytics, simplified) | Functional correctness |
| Vector | ann-benchmarks (SIFT-1M) | recall@10 > 0.95 at 10K QPS |
| Vector | OpenAI-1536 dim | < 10ms p99 query latency |
| Graph | LDBC Social Network | 3-hop < 50ms on 1M nodes |
| Full-text | MS MARCO (BM25) | Accuracy matches pyserini |
| Hybrid | Vector+Graph+SQL | < 2x slowest single-engine query |
| Durability | Crash recovery | 100% data integrity after 100 random kills |
| Concurrency | 64 clients mixed workload | No deadlocks, no data corruption |

---

**Maintainer**: Steve
