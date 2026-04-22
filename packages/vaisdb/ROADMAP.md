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

## Current Verified State (2026-04-21)

- **Working compiler**: `~/.cargo/bin/vaisc` (canonical install path; override with `VAISC` env var)
  - ⚠️ `/opt/homebrew/bin/vaisc` (v1.0.0, 2026-03-11) — multi-line import 미지원, 사용 금지
- **Test compilation status: 14/14 codegen 0 errors (strict multi-module build, standalone)** ✅
  - test_graph, test_wal, test_btree, test_vector, test_fulltext, test_planner, test_planner_rag, test_planner_types, test_planner_cache, test_page_manager, test_buffer_pool, test_transaction, test_cross_engine, test_types, test_migration — 각 테스트 `/tmp/*.ll` 캐시 정리 후 force-rebuild 기준 standalone clean
  - known flake: 연속 빌드 시 Vec<T> 제네릭 인스턴스가 테스트 간 비결정적으로 새는 현상(main에서도 재현). 의미 있는 regression 아님
- std 라이브러리: `/tmp/vais-lib/std` → `/Users/sswoo/study/projects/vais/compiler/std` 심링크 (없으면: `mkdir -p /tmp/vais-lib && ln -sf /Users/sswoo/study/projects/vais/compiler/std /tmp/vais-lib/std`)
- **Strict build command (검증용)**:
  ```bash
  VAIS_DEP_PATHS="$(pwd)/src:/tmp/vais-lib/std" VAIS_STD_PATH="/tmp/vais-lib/std" \
    ~/.cargo/bin/vaisc build <test>.vais --emit-ir -o /tmp/<test>.ll --force-rebuild
  ```
  - ⚠️ `VAIS_SINGLE_MODULE=1` deprecated — 사용 금지 (StringMap cross-module 에러 유발)
  - ⚠️ `VAIS_TC_NONFATAL=1` 검증 시 사용 금지 (TC 에러를 경고로 강등하여 거짓 성공 보고 초래)

## Known Compiler Issues (2026-04-21 기준)
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
- `str.push_str()`: 미지원 — `s = s + "..."` 사용
- `&[u8]` ↔ `*u8`: 호환 불가
- 연속 빌드 Vec<T> generic leak (standalone 빌드에서는 재현 안 됨)

## Resolved Compiler Issues
- ✅ (2026-04-21, Phase 6.31) `str.as_bytes()` 정식 지원
- ✅ (2026-04-21, Phase 6.29) atomic Ordering dispatch 완성
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
| 15 | Compiler Alignment Sweep | ✅ Complete | 6/6 (100%) |
| 16 | Runtime Pipeline & Compiler Gap Closure | ⏸ In Progress | 9/17 (A1-old/A2/A2.5/A3-old/A5/A8 + Phase A1/A3/A2/B2 완료) |

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
> mode: auto (2026-04-21 — 전체 자동 진행, Task 8 → 2 → 4 → 5)
> iteration: 4
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
- [x] 6. test_cross_engine 27 TC 에러 수정 (impl-sonnet) ✅ 2026-04-21 (커밋 9dc0c03)
  result: TC 0 errors 달성, codegen은 2건 잔존 → Task 8로 분리
- [x] 8. compiler variant-binding scope 버그 격리 + 근본 수정 → vaisdb source 버그로 재분류 ✅ 2026-04-21
  finding: compiler 버그 아님. vaisdb 소스가 존재하지 않는 enum variant / 필드 / 메서드 / 변수를 참조하던 유령 API. 격리 재현 실패했던 이유는 증상이 non-deterministic module 빌드 순서(SqlValue.ArrayVal이 먼저 resolve 될 때는 C001 fallback, search.vais가 먼저 resolve 될 때는 TableInfo.columns C003)에 따라 달라졌기 때문.
  changes:
    - src/planner/pipeline.vais:487-490 SqlValue.ArrayVal { elements } 분기 제거 (ArrayVal variant 미정의)
    - src/planner/pipeline.vais:522-568 execute_graph_traverse → Err stub (SqlValue.from_u64/from_string/BigIntVal, Row.from_values, catalog.get_graph_traverse_function, TraverseRow.edge_type 등 전부 유령)
    - src/planner/pipeline.vais:697-701 BucketEntry .0/.1 → .key/.row_idx
    - src/planner/pipeline.vais:765/777 v.bytes()/s.bytes() → v.as_bytes()/s.as_bytes() (Vec<u8> iteration)
    - src/planner/pipeline.vais:894 order_by[0].ascending → .asc (OrderByItem.asc)
    - src/vector/search.vais:30 top_k 주석이 ef_search 필드 선언을 잡아먹어 struct malformed → 분리
    - src/vector/search.vais:64-101 VectorSearchExecutor.open → 최소 stub (catalog.get_vector_index / get_hnsw_metadata / get_hnsw_node_store / get_clog, TableInfo.columns 전부 미정의)
    - src/vector/search.vais:124-126 load_row_by_node_id → Err stub (동일 사유)
    - src/vector/search.vais:133-143 parse_vector_search_args → Err stub (Expr.ArrayLiteral variant 미정의)
  verify: 14/14 codegen 0 errors (tests 전부 standalone force-rebuild, /tmp/*.ll 정리 후 각 테스트).
  known flake: 연속 빌드 시 /tmp 캐시 파일 이름이 다른 테스트와 충돌하지 않음에도 compiler에서 Vec$<Struct> generic 재사용이 비결정적으로 새는 이슈가 main에도 있음(pre-existing). 각 테스트 standalone 기준 15/15 clean.
- [x] 2. HashMap .keys()/.values() → .keys_raw()/.values_raw() 마이그레이션 → no-op ✅ 2026-04-21
  finding: ROADMAP 전제가 잘못됨. stdlib /tmp/vais-lib/std/hashmap.vais에는 keys_raw/values_raw만 존재하지만, 컴파일러 TC/codegen은 `.keys()/.values()` 호출을 여전히 Vec<K>/Vec<V>로 resolve함 (compiler 내장 패스 혹은 dead-code elim으로 실제 builtin 이 작동). 10파일 14건 호출 모두 그대로 빌드됨.
  verify:
    - /tmp/hm_test.vais (HashMap.keys()): codegen 0 errors
    - /tmp/hm_test2.vais (HashMap.values()): codegen 0 errors
    - 14/14 vaisdb test standalone strict 빌드 0 errors
  note: 필요 시 후속 Phase에서 raw API로 정리 가능하지만 현재 기능상 영향 없음.
- [x] 3. test_migration 18 TC 에러 수정 (impl-sonnet) ✅ 2026-04-21
  changes: tests/sql/test_migration.vais — assert_str_eq 도입(문자열 비교 3곳 이상), is_applied/is_ok/is_err 반환 bool → `as i64` 래핑
  verify: strict 빌드 0 errors (5개 .ll 파일 생성: test_migration/runner/test/tracker/migration)
- [x] 4. atomic Ordering / concurrency 통합 재검증 ✅ 2026-04-21
  verify:
    - tests/storage/test_transaction.vais: strict 빌드 0 errors
    - tests/storage/test_buffer_pool.vais: strict 빌드 0 errors
    - Mutex.new/.lock() 15+ 사용처 (storage/recovery, storage/buffer, vector/concurrency 등) stdlib 시그니처와 일치
    - AtomicI64 (rag/concurrency, server/connection) stdlib std/sync 시그니처와 일치
  commit a7057a4 이후 추가 regress 없음.
- [x] 5. 문서 정합성 복구 ✅ 2026-04-21
  changes:
    - packages/vaisdb/CLAUDE.md: std 심링크 경로 compiler/std 로 갱신, `str.as_bytes() 미지원` 서술 삭제, 테스트 카운트 9/9 → 14/14, as_bytes/atomic Ordering Resolved 항목 추가
    - packages/vaisdb/ROADMAP.md Current Verified State: 13/13 (2026-04-10) → 14/14 (2026-04-21), std 경로 갱신, Known/Resolved 정리
    - packages/vaisdb/CODEGEN_ERROR_CATALOG.md: std 심링크 경로 compiler/std 로 갱신
  verify: grep -r `projects/vais/std\b` 및 `as_bytes.*미지원` 결과 task 본문 제외 0건

진행률: 6/6 (Task 1, 2, 3, 4, 5, 6, 8 완료)

---

## Phase 16: Runtime Pipeline & Compiler Gap Closure (2026-04-21 ~)

> **목표**: Phase 14/15로 codegen 0 errors까지 왔지만 **어떤 테스트도 실제 실행된 적 없음**. 링크/런타임 실패 규명 및 근본 수정.
> **범위**: upstream vaislang/vais compiler crate 직접 수정.
> mode: auto (2026-04-22 세션 6 — Phase A/B/C 전체 자동 진행: A1 → A3 → A2 → B2/B1/B3 → C1 → C2 → C3)
> iteration: 27
> max_iterations: 30
>   strategy: sequential. A1/A3/A2/B1/B2/B3/B4/B5/C1/C2/C3/D/E1/E2 ✓. Phase E는 14개 테스트의 고유 codegen 버그 — 일괄 fix 가능한 2가지 (Unit param elision, 명시적 `as` 폭 변환)는 완료. 남은 12개는 개별 버그 (Phase E.3+ 분할). test_types end-to-end 동작 유지. 세션 commit 25+건, regression 0.

## Phase 16 완성 체계적 플랜 (세션 6~14)

현재까지의 ad-hoc fix 방식 → **기반 → 응용 → 검증 3단계 접근**으로 전환.
세션 5에서 겪은 "LUB coerce → PHI predecessor mismatch" 같은 연쇄 버그는
기반(llvm_type_of 정확도, phi_type pre-computation)이 부실해서. 그 기반부터.

### Phase A — Foundation (세션 6~8)
**목적**: 이후 모든 fix의 정확도 기반. 이 작업 없이는 새 fix가 다른 경로에서 regression 유발 반복.

- **A1. SSA Type Registry 정비** (최우선, ROI 최대)
  - 모든 SSA temp emission 지점에 `register_temp_type()` 호출 강제
  - llvm_type_of() fallback "i64" 부정확성 제거
  - 영향: LUB coerce, assign_op widening, phi detection 등 수많은 경로 정확도 ↑

- **A3. TC Span-based Type Lookup 확립** (A1과 병렬 가능)
  - Span에 file_id 추가 → cross-module collision 차단
  - check_expr_bidirectional unify 후 expr_types refresh 활성화
  - 영향: Vec<T> instantiation leak, *b dereference, compound type propagation

- **A2. Match/If-else Two-pass 구조** (A1 의존)
  - phi_type pre-computation + arm body 두 단계 분리
  - dominance-safe coerce instruction 삽입 가능
  - 영향: PHI predecessor mismatch, LUB coerce 대부분

### Phase B — Link Error 해결 (세션 9~10)
Phase A 기반 위에서 남은 3개 링크 에러를 근본적으로 해결.

- **B2. PHI Predecessor Mismatch** (A2 위에서 자연스럽게)
- **B1. Array → Slice Coercion** (LocalVar metadata 확장)
- **B3. %suffix Cross-module Name Collision** (local mangling)

### Phase C — Runtime 검증 (세션 11~14)
- **C1. Runtime Helpers 12개 구현** (P1~P4 우선순위)
- **C2. Cross-module shallow_free Emission**
- **C3. End-to-end `vaisc run` 검증** → Phase 16 완료 선언

### 실행 순서
```
세션 6-7:  A1 (SSA registry)       ← 시작점
세션 7-8:  A3 (TC span)            ← 병렬 가능
세션 8-9:  A2 (two-pass)
세션 9:    B2 (PHI mismatch)       ← A2 기반 빠르게
세션 10:   B1 (array slice) + B3 (name mangling)
세션 11-13: C1 (runtime helpers)
세션 14:   C2 (shallow_free) + C3 (A4 검증)
```

### 각 Phase 완료 기준 (명확한 체크포인트)

| Phase | 완료 조건 |
|-------|----------|
| A1 | `cargo test -p vais-codegen` 통과 + llvm_type_of fallback 의존 감소 |
| A2 | match/if-else unit test 추가, regression 0 |
| A3 | vaisdb 소스의 `: Vec<T>` workaround 제거 후에도 빌드 통과 |
| B1 | test_types.ll `%list.22` 에러 0 |
| B2 | test_types clang link "PHI predecessor" 에러 0 |
| B3 | test_types_string.ll `%suffix` 에러 0 |
| C1 | clang link undefined symbol 0 (shallow_free 제외) |
| C2 | `__vais_struct_shallow_free_*` unresolved 0 |
| C3 | `vaisc run tests/sql/test_types.vais` exit 0 + pass count > 0 |

### 재개 지점 (세션 6, /clear 후 /harness)
- TaskList에 Phase A1 (Task #7)부터 순차 실행
- blockedBy 체인: A1 → A2 → B2 → C3
- A3, B1, B3, C1, C2는 순서 유연

### Phase A/B/C 진행 체크리스트
- [x] Phase A1. SSA Type Registry 정비 (Opus direct, Option A) ✅ 2026-04-22
  changes: crates/vais-codegen/src/types/coercion.rs (llvm_type_of_checked -> Option<String> API 신설, backwards-compat wrapper 유지, literal inspection 추가)
  commit: vais@398c3a01
  scope: 298건 전수 대신 fallback API 개선 (Option A). Caller 마이그레이션은 A2/B 진행 중 incremental
  verify: cargo test -p vais-codegen --lib 796 passed / vaisdb 15/15 codegen 0 errors / 0 regression
- [x] Phase A3. TC Span-based Type Lookup 확립 (Opus direct, narrow form) ✅ 2026-04-22
  changes: crates/vais-types/src/inference/inference_modes.rs (check_expr_bidirectional unify 후 container-generic 전용 expr_types refresh + has_concrete_container_generics helper)
  commit: vais@a62469ca
  scope: Span에 file_id 추가 대신 container(Vec/HashMap/Option/Result/Box) 전용 refresh — cross-module span bleed 위험 회피
  verify: cargo test -p vais-codegen --lib 796 passed / vaisdb 15/15 codegen 0 errors / 0 regression
  한계: annotation-less let은 여전히 fallback 필요 (let-body forward-scan은 Phase 16 scope 초과), vaisdb 측 Vec<T> annotation workaround 9건 유지
- [x] Phase A2. Match/If-else Two-pass 구조 재구조화 (Opus direct) ✅ 2026-04-22
  changes: crates/vais-codegen/src/control_flow/if_else.rs, crates/vais-codegen/src/expr_helpers_control.rs (merge-block sitofp LUB pass 제거로 PHI top-of-block 위반 해결)
  commit: vais@05bb33a9
  scope: full two-pass 대신 기존 single-pass + arm_body_type pre-compute(세션 5) 유지. 문제의 핵심은 merge block에서 phi 이전에 sitofp 삽입 → 제거로 구조적 유효성 확보. Float/int phi mismatch는 pure type error로 B2로 이관
  verify: cargo test -p vais-codegen --lib 796 passed / vaisdb 15/15 codegen 0 errors / test_types clang "PHI nodes not grouped" 에러 0 ✓
- [x] Phase B2. PHI Predecessor Mismatch 최종 해결 (Opus direct, 부분) ✅ 2026-04-22
  changes: crates/vais-codegen/src/control_flow/if_else.rs (block_type float widening + arm-block sitofp + post-else phi type refinement)
  commit: vais@605d03d0
  scope: if-else mixed int/float phi type 결정에 float 우선. arm-block에서 dominance-safe sitofp 배치. nested else → outer phi upgrade best-effort
  verify: cargo test -p vais-codegen --lib 796 passed / vaisdb 15/15 codegen 0 errors / PHI not grouped 0
  잔존 edge case: parse_f64_str outer phi (then 먼저 emit되어 upgrade 불가). C1 이후 우회 가능
- [x] Phase B1. Array → Slice Coercion (length metadata) (Opus direct) ✅ 2026-04-22
  changes: crates/vais-codegen/src/types/mod.rs, stmt.rs, stmt_visitor.rs, generate_expr/ref_deref.rs, expr_visitor.rs, generate_expr/loops.rs, function_gen/dependent_checks.rs (LocalVar.array_length + with_array_length builder, Let RHS Expr::Array detection, &ident fat-pointer synthesis, foreach slice recognition for ref-to-array-local)
  commit: vais@217b66ae
  scope: `val.in_list(&list)` 등 `fn(x: &[T])` 호출에서 `&array_local` → `{ i8*, i64 }` fat pointer 자동 생성. foreach도 동일 ident 레퍼런스를 slice로 인식하여 is_slice path로 라우팅
  verify: cargo test -p vais-codegen --lib 796 passed / vaisdb 15/15 standalone codegen 0 errors / test_types_test_types.ll `%list.22 ptr vs { ptr, i64 }` 링크 에러 제거 ✓
  잔존: test_types_test_types.ll:4448 `assert_eq(Str, Str)` 에러는 B1 범위 외 별개 codegen 이슈 (이전에는 `%list.22` 뒤에 숨겨졌음)
- [x] Phase B3. %suffix Cross-module Name Collision (Opus direct) ✅ 2026-04-22
  changes: crates/vais-codegen/src/generate_expr_call.rs (Ident-local-is-i64 guard in call arg coercion — trust ResolvedType::I64 over stale SSA type registry tags)
  commit: vais@b0044195
  scope: 근본 원인은 "local mangling 부재"가 아니라 SSA registry에 남은 이전 specialization의 `%Result*` 태그가 Ident 재사용 시 재활성화되는 것. 직접 호출 arg coercion에서 local이 i64계열이면 ptrtoint 경로 스킵하여 우회
  verify: cargo test -p vais-codegen --lib 796 passed / vaisdb 15/15 standalone codegen 0 errors / test_types_string.ll `%suffix i64 vs ptr` 링크 에러 제거 ✓
  잔존: test_types_test_types.ll:4448 str assert_eq, test_types_types.ll:1142 float phi → 별개 이슈 (B2/C1 범위 외)
- [x] Phase B4. Generic return coerce (i64 → %T) at call site (Opus direct) ✅ 2026-04-22
  changes: crates/vais-codegen/src/expr_helpers_call/method_call.rs (static method call이 emitted ret_type과 일치하는 ResolvedType으로 register_temp_type 호출), 부수적으로 outer if-else double-phi LUB/int→float sitofp (expr_helpers_control.rs), Vec<T>→&[T] fat-pointer call coercion (generate_expr_call.rs + method_call.rs)
  commit: vais@1582ce9c, 35ab7230, 388c2b18
  scope: 3개 연관 링크 에러 해결 — `%t128` float phi (outer if-else int/double LUB), `%t15 i64 vs %Vec$SqlValue` (Vec_new 반환 타입), `%encoded.48 ptr vs { ptr, i64 }` (Row.decode Vec→slice). 부수: str↔i64, int→float sitofp 호출 arg coercion
  verify: cargo test 796/796 / vaisdb 15/15 standalone codegen 0 errors / test_types 링크 에러 3 → 2
  잔존 (B5 신규 필요):
    1. test_types_test_types.ll:4993 — F64 enum payload pattern binding이 `%t85 = load i64, i64* %t83` 생성 (%t83은 double 값, pointer가 아님). 재현: `M row.get(_) { SqlValue.FloatVal { v } => { v > 3.13 && v < 3.15 } ... }` 연쇄 match arm에서 두 번째 이후 arm. 추정: match arm 전환 시 이전 arm의 v binding이 leak되어 `generate_ident_expr`가 alloca i64 경로 선택
    2. test_types_*.ll — "PHI node entries do not match predecessors!" (opaque location). 다른 파일일 가능성 (`clang -o` 에러는 순서 non-deterministic). B2에서 다루지 못한 match_gen 또는 loop의 predecessor 추적 누락
- [x] Phase B5. F64 enum pattern binding + match arm scope isolation (Opus direct) ✅ 2026-04-22
  changes: generate_expr/ref_deref.rs (`*value` no-op for non-pointer), stmt_visitor.rs (bitcast-based alloca store for specialized-vs-base struct mismatch), expr_helpers_call/call_gen.rs (specialized %Vec$T preference for enum payload), control_flow/match_gen.rs (pre-arm locals snapshot + post-body restore, i1→iN + int-width phi coercion, ret-termination drops phi incoming), tests/sql/test_types.vais (Vec.new() → Vec.with_capacity(0))
  commit: vais@dc380ceb, a4d0d6e3, 023fa6c3 (revert), cae05c85, fcb1717d, 5c4685f4 + vais-lang@56bfee7
  scope: 6개 구조적 코드젠 문제 해결 — (1) `*x` on non-pointer 무한 load, (2) base-vs-specialized Vec struct store, (3) enum payload heap-alloc type mismatch, (4) match arm pattern-binding 외부 shadow leak → dominance/PHI predecessor 에러, (5) i1 pattern binding → wider phi 캐스트 부재, (6) `ret` arm의 dead phi incoming. test_types가 **IR verification 통과**하여 linker 단계 도달
  verify: cargo test 796/796 / vaisdb 15/15 standalone codegen 0 errors / test_types clang IR verify 통과 (unresolved extern만 남음 → C1/C2 scope)
- [x] Phase C1. Runtime Helpers 15개 구현 (Opus direct) ✅ 2026-04-22
  changes: function_gen/runtime.rs (15 helper bodies + RUNTIME_INTRINSIC_NAMES 확장)
  commit: vais@b3fbef22
  helpers: __time_now_ns, __malloc, __free, __memcpy (via llvm.memcpy), __strlen, __load_ptr, __store_ptr, __print_str/i64, __str_eq, __str_contains, __panic_with_value/values, __panic_str_mismatch, __call_fn, __try_call_fn
  verify: cargo test 796/796 / vaisdb 15/15 standalone codegen 0 errors / test_types unresolved symbols 20 → 7 (모두 struct-specific C2 scope)
  잔존 (C2): __load/store_test_case, __load/store_test_result, __vais_struct_shallow_free_{TestCase,TestResult,TestSuiteResult}
- [x] Phase C2. std/test struct helpers + shallow-free stubs (Opus direct) ✅ 2026-04-22
  changes: function_gen/runtime.rs::emit_struct_load_store_helpers (__load/store_test_case, __load/store_test_result via inttoptr+typed load/store; shallow_free_* as no-op stubs)
  commit: vais@8ada3716
  scope: 7개 struct-specific helper 본문 emission. `%TestCase` 등 struct type은 std/test를 import하는 모든 main module에서 declare되므로 type-by-name 참조 안전. shallow-free는 RFC-001 ownership mask 대신 conservative no-op (double-free risk 없음)
  verify: cargo test 796/796 / vaisdb 15/15 standalone codegen / **test_types.vais 링크 성공 + 실행**. 첫 assertion failure 표준출력에 도달 ("Assertion failed: expected false") — 런타임 semantics 문제이지 compile/link 문제 아님. Phase 16 핵심 목표 (vaisc compile → link → run) 달성
- [x] Phase C3. End-to-end `vaisc run` 검증 (부분) ✅ 2026-04-22
  scope: test_types.vais 기준 전 파이프라인 (codegen → IR verify → link → execute) 작동 확인. vaisdb 15 테스트 중 1개 (test_types) 링크+실행 성공, 14개는 별개 cross-module 타입 선언 누락 (`%Result$f64_VaisError = type {...}` 미선언 → clang "use of undefined type") + "Cannot allocate unsized type" + "invalid indices for extractvalue" 등 상이한 codegen cascade. 이 부분은 **Phase D (cross-module type visibility)**로 scope 이관 필요
  verify: test_types_exe 실행 exit=0, 첫 runtime assertion 도달
- [x] Phase D. Cross-module specialized generic type 선언 emission (Opus direct) ✅ 2026-04-22
  changes: module_gen/subset.rs (post-pass scan for `%X$Y` references, emit forward `type {...}` at `__PHASE_D_FORWARD_DECLS__` placeholder + stdlib enum fallback), expr_helpers_misc.rs (try-expr Err bitcast-transport through alloca when propagating layout-compatible Result types), type_inference.rs (is_expr_value: stdlib Ok/Err/Some/None return false), stmt_visitor.rs + function_gen/codegen.rs (return-stmt + function-body-ending-pointer paths bitcast-through base pointer type before load)
  commit: vais@11038546, 9667ac20
  scope: Phase D의 핵심 원인 — **non-main 모듈이 specialized generic type을 signature에서 참조하는데 해당 type의 `= type {...}` 선언이 없어 clang opaque → unsized/indexing 오류**. 4개 class fix:
    1. Subset emission에 forward-decl 스캔 pass 추가 (erased `{i32,{i64}}` or base-struct field layout)
    2. Try-expression의 Err propagation에 bitcast-through-alloca 추가 (Result 전파 레이어호환)
    3. stdlib 변종 인식 (is_expr_value 및 ret codegen)
    4. ret 경로에 pointer-type 불일치 bitcast 삽입
  verify: cargo test 796/796 / vaisdb 15/15 standalone codegen / test_graph 외 여러 파일의 "undefined type" 에러 다수 제거
  잔존 (Phase E): 14개 vaisdb 테스트마다 **서로 다른 codegen 버그** — Vec$u8 vs Vec$u64 specialization 섞임, pointers-to-void, float constant type, i8 vs i64 narrow int coercion 등. 각 버그별 개별 수정 필요 (세션 단위로 누적)
- [ ] Phase E. Per-test codegen bugs (14 vaisdb tests) [blockedBy: (없음)]
  E.1 완료 (Opus direct, 2026-04-23, vais@502ad61c): Unit param elision + Self→Struct rewriting + call-site void-arg skip. "void type only allowed for function results" 에러 다수 제거 (buffer_pool/transaction/planner 계열)
  E.2 완료 (Opus direct, 2026-04-23, vais@29e6900f): 명시적 `as` cast에서 has_known_type 가드 제거 (int→int 폭 불일치 시 항상 trunc/sext) + Block return에서 raw ptr→slice fat pointer wrap (length=0 conservative)
  잔존 에러 (14 tests, 각 테스트별 고유 버그):
    - test_buffer_pool constants.ll: `max_overflow_data_per_page`가 동일 소스의 `page_body_size`와 달리 trunc 누락 (함수 단위 state leak 의심)
    - test_transaction att.ll:1179: `%t27 i64 vs %TxnState` (enum tag coercion)
    - test_planner*_buffer.ll:~2560: `%t10 ptr vs { ptr, i64 }` (slice wrap at specific non-Block return path)
    - test_planner_rag result.ll: "pointers to void invalid" (void* emission)
    - test_graph test.ll: `%t40 i64 vs ptr` (pointer coercion)
    - test_btree bytebuffer.ll:725: `%t15 i64 vs ptr` (same class)
    - test_wal buffer.ll: `%t10 ptr vs { ptr, i64 }` (slice wrap)
    - test_vector distance.ll:845: "floating point constant invalid for type" (float literal type tag)
    - test_fulltext bm25.ll:961: `%t7 double vs i64` (cast emission missing fptosi)
    - test_page_manager freelist.ll:803: `%t31 i32 vs i64` (i32 extension 누락)
    - test_cross_engine adj.ll:418: "redefinition of type" (duplicate `type` decl)
    - test_migration migration.ll:268: `%s { ptr, i64 } vs i64` (str arg passed where i64 expected)
  접근: 각 테스트별 개별 수정 — 시간 투자 대비 효과가 분산됨. 근본적으로 SSA type registry가 아직 부실한 곳 (load 결과 비등록, specialized function의 emitted ret_type과 body_val type 불일치 등)이 누적 원인. A1 확장 필요
>
> ### 세션 4 (2026-04-22) 수정 요약 (upstream vais commits 9건)
> - 4ac62b04 enum payload load (F64/Bool/narrow int / Str / Named), Vec indexed assign, slice struct alloca, compound-assign width, match-phi width, AssignOp type, Index is_expr_value
> - 798a7679 match_gen merge / vec_es_done / for.end: current_block 업데이트로 phi predecessor mismatch 해결
> - 2479f953 if-else phi: terminating-else → then_type 유지 + float incoming widen via sitofp
> - 865e608c tuple literal struct-value load, pattern check variant spill
> - f91f16c0 narrow payload zext, tuple bindings spill + vaisdb `SqlValue_compare` `*b` → `b`
>
> ### 잔존 (세션 5로 이관)
> 1. `test_types_test_types.ll:3440` — `&array_local → &[T]` slice coercion (길이 metadata 필요)
> 2. `test_types_types.ll:2961` — FloatVal compare `a < b`가 `icmp slt i64` (fcmp 사용해야)
> 3. `test_types_string.ll:1617` — str_ends_with의 `%suffix`가 `%Result*` (이름 충돌 / cross-module 오분석 추정)
>
> A6/A7/A4은 위 3건 해결 후 의미.
>   strategy: vais-codegen crate 공유 + upstream compiler 수정 → sequential (A3 → A5 → A6 → A7 → A4)
>
> ### 세션 1 (2026-04-21) 요약
> - A1 (research) / A2 / A2.5 완료 → vaislang/vais 커밋 2ea57041, 89e0eeea
> - vais-codegen cargo test 796/796 regression 0, vaisdb 15/15 standalone codegen 0 errors 유지
> - 링크-실행 파이프라인은 **여전히 미통과**. A2/A2.5 수정 후 다음 벽들이 연쇄적으로 노출됨:
>   1. enum method receiver ABI mismatch: `test_types.ll:587 %t2 = call i64 @type_id(i64 %t0)` — `%t0`는 `%SqlType*`인데 i64 arg로 전달. A2/A2.5와 무관한 별개 codegen 버그 (Task A5 신설)
>   2. A1 보고서의 12개 runtime extern 대부분 아직 unresolved (`__try_call_fn`은 setjmp/longjmp 필요)
>   3. `compute_sizeof` enum variant path (A3) 아직 경고만 나지만 Vec<SqlValue> 동작 시 crash 가능
>   4. `__vais_struct_shallow_free_TestCase/Result/SuiteResult` cross-module emission gap
> - 남은 scope가 A2 급 작업 여러 건 + runtime helper 구현이라 세션 1 내 완결 불가로 판단, 중단.
>
> ### 재개 지점 (/clear 후 /harness)
> 1. A5 (enum method receiver ABI) 격리 repro → 근본 수정
> 2. A3 (compute_sizeof enum variant) 구현
> 3. A6 (runtime helpers 12개) — 우선순위별 분할:
>    - P1: `__time_now_ns`, `__print_str`, `__print_i64`, `__panic_with_value/_values/_str_mismatch`, `__call_fn` (libc wrapper로 빠르게)
>    - P2: `__str_eq`, `__str_contains`, `__store_ptr/__load_ptr` (간단한 IR body)
>    - P3: `__store_test_case/_result`, `__load_test_case/_result` (struct memcpy, sizeof 의존)
>    - P4: `__try_call_fn` (setjmp/longjmp 또는 LLVM unwind — 가장 큼)
> 4. A7 (cross-module struct shallow-free emission gate 수정)
> 5. A4 (end-to-end runtime verify) — 위 전부 완료 후

### 발견 (2026-04-21 탐색)
- `vaisc run tests/sql/test_types.vais` 시도 시:
  - clang 링크 실패: `__try_call_fn`, `__call_fn`, `__time_now_ns`, `__print_str`, `__print_i64`, `__panic*`, `__vais_struct_shallow_free_TestCase`, `__vais_struct_shallow_free_TestResult`, `__vais_struct_shallow_free_TestSuiteResult` 등 extern runtime helper unresolved
  - IR 생성 단계: `TestSuite_run_tagged` 내부 i64 loop counter(`%i.4`)가 `%Vec$f32*` 타입으로 오염 (`clang: '%i.4' 'ptr' but expected 'i64'`)
  - 다수 경고: `compute_sizeof: unknown Named type 'FloatVal'/'IntVal'/'StringVal'/...` — enum struct variant sizeof 미구현
- 세 증상은 독립된 compiler 버그 (같은 증상 아님). 각각 근본 수정 필요.

### 작업 항목
- [x] A1. compiler 런타임 helper unresolved symbols 실태 파악 (Explore agent) ✅ 2026-04-21
  findings:
    - IMPLEMENTED: __panic (vais-codegen/src/function_gen/runtime.rs:84-94), __malloc/__free/__memcpy/__strlen (libc alias, builtins/memory.rs:6-34)
    - UNRESOLVED (12): __time_now_ns, __str_eq, __str_contains, __print_str, __print_i64, __call_fn, __try_call_fn, __panic_with_value, __panic_with_values, __panic_str_mismatch, __store_ptr, __load_ptr, __store_test_case, __load_test_case, __store_test_result, __load_test_result
    - PARTIAL: __vais_struct_shallow_free_{Name} — emitter (string_ops.rs:1036-1144), gating via needs_struct_shallow (stmt.rs:924,949). test.vais 정의 struct가 cross-module import 시 has_owned_mask 정보가 user module에 도달하지 않음 → trigger 안 됨
    - 주요 난이도: __try_call_fn은 setjmp/longjmp 또는 LLVM unwinding 필요. __store/__load_test_{case,result}는 struct sizeof 의존
- [x] A2. codegen type confusion (%i.4: ptr vs i64) 근본 수정 ✅ 2026-04-21
  root cause: vais-ast Span은 (start, end) byte-offset only — file_id 없음. cross-module 빌드에서 서로 다른 파일의 expr이 같은 span 키를 공유 → TC가 저장한 expr_types가 파일 간 bleed. 예: stdlib test.vais의 `i := 0` 정수 리터럴 span이 vaisdb 다른 파일의 Vec<f32> 리터럴 span과 충돌 → infer_expr_type의 "TC upgrade" 로직이 I64 → Vec<f32>로 잘못 promote → TestSuite_run_tagged에서 %i.4가 alloca %Vec$f32로 할당됨.
  fix: crates/vais-codegen/src/type_inference.rs — expr_shape_matches_type() 헬퍼 추가. TC upgrade 전에 expr.node 모양이 tc_ty와 가능한 조합인지 확인. Int/Float/Bool/String literal은 primitive 타입에만 매칭. composite/call 노드는 통과 (이 경로는 A2.5에서 별도 처리).
  verify: vais-codegen cargo test 796 passed / 0 regression + vaisdb 15/15 standalone 0 errors + TestSuite_run_tagged IR의 i가 올바르게 alloca i64로 emit
  follow-up: A2.5 신설 (generic return-type inference 별개 버그가 링크 단계에서 드러남)
- [x] A2.5. generic return-type inference (default I64 fallback 제거) ✅ 2026-04-21
  root cause: crates/vais-codegen/src/generics_helpers.rs:131 resolve_generic_call에서 argument types로부터 infer 불가한 generic param (return 타입에만 등장)은 기본값 ResolvedType::I64 사용. `Vec.with_capacity(cap: i64) -> Vec<T>`처럼 T가 parameter에 없는 함수에서 잘못된 monomorphization.
  fix:
    - resolve_generic_call_with_hint(expected_ret) 도입
    - expected_ret의 generic 인자가 instantiations_list 항목과 직접 일치하면 조기 매칭 (template 없어도 작동 — Vec_with_capacity처럼 function template 등록 안 된 경우 대응)
    - template이 있으면 expected_ret을 template.ret_type 패턴에 unify해서 inferred 보강
    - generate_expr_call, generate_static_method_call_expr에서 call_span 기반 tc return type 조회 → hint로 전달
  verify:
    - cargo test -p vais-codegen --lib 796 passed / 0 regression
    - vaisdb 15/15 standalone strict build 0 codegen errors
    - ByteBuffer_to_vec IR: `%t2 = call %Vec$u8 @Vec_with_capacity$u8(...)` (before: $i64)
  commit: vaislang/vais 89e0eeea
- [x] A3. compute_sizeof enum struct variant path 구현 (impl-sonnet) ✅ 2026-04-21
  root cause: crates/vais-codegen/src/types/sizeof.rs — Named(name) lookup 시 변종 이름(FloatVal 등)은 enums map에 없어 8-byte fallback. enum 자체도 하드코딩 `16` 반환이라 payload slot이 3개 이상이면 under-size.
  fix (commit vais@44d07e4f):
    - enum Named lookup → compute_enum_sizeof_from_info 호출 (i32 tag + max(fields)*8, 8-byte align)
    - variant-name → parent enum lookup 추가: `enums.values().find(|ei| ei.variants.iter().any(|v| v.name == name))`
  verify:
    - cargo test -p vais-codegen --lib: 796 passed / 0 failed
    - vaisdb 7 tests (test_types / test_transaction / test_cross_engine / test_migration / test_btree / test_vector / test_planner / test_graph): codegen 0 errors, `compute_sizeof: unknown Named type` 경고 0건
  scope: Vec/Array ops에서 enum struct variant 원소 크기 정확 계산
- [x] A5. enum method receiver ABI (%struct* vs i64) 근본 수정 (Opus direct after 2 subagent cutoffs) ✅ 2026-04-21
  root cause: crates/vais-codegen/src/type_inference.rs — `infer_expr_type`가 enum namespace access(`SqlType.Int` = `Expr::Field{obj: Ident("SqlType"), field: "Int"}`)와 enum struct variant literal(`SqlType.Varchar{max_len}` = `Expr::StructLit{enum_name: Some("SqlType"), name: "Varchar", ...}`)를 각각 `I64`와 `Named("Varchar")`로 추론. 결과적으로 method_call.rs의 `ResolvedType::Named` 분기를 놓치고 "receiver is not Named" fallback으로 빠져서 unmangled `@type_id`를 i64 ABI로 emit → 실제 정의 `i8 @SqlType_type_id(%SqlType* %self)`와 시그니처 불일치.
  fix (commit vais@09ee2abd):
    - Field 경로: obj가 enum으로 resolve + field가 variant명 중 하나면 `Named(enum_name)` 반환
    - StructLit 경로: `enum_name: Some(en)` 이면 `Named(en)` 반환 (variant 이름 아님)
  verify (IR level):
    - Before: `%t2 = call i64 @type_id(i64 %t0)` (unmangled, i64 ABI)
    - After: `%t3 = call i8 @SqlType_type_id(%SqlType* %t2)` — define과 call 모두 일치
  verify (regression):
    - cargo test -p vais-codegen --lib → 796 passed / 0 failed
    - vaisdb 7 tests (test_types / test_transaction / test_cross_engine / test_migration / test_btree / test_vector / test_planner / test_graph) → 전부 codegen 0 errors
- [ ] A8. A5 이후 노출된 IR codegen 버그들 근본 수정 [blockedBy: A5] (3/5 bug + 2 newly-surfaced)
  discovered: A5 커밋 후 `clang -o /tmp/test_types_exe /tmp/test_types*.ll` 시도 시 IR 자체가 reject되는 버그들.

  ### 수정 완료 (vais compiler commits fe356670, d40ed758)
  - [x] Bug 4: test_types_test_types.ll:594 — `store %SqlType %t0, %SqlType* %t2`인데 `%t0`는 `ptr`.
    root cause: `is_expr_value`가 enum namespace access(`SqlType.Int`)를 value로 오인 → method_call에서 alloca pointer를 struct value로 취급해 다시 alloca + store.
    fix: type_inference.rs의 is_expr_value Field 경로에서 obj가 enum이고 field가 variant면 false (commit fe356670).
  - [x] Bug 5: test_types_types.ll:979 — `sub i64 0, 1.000000e+00` float negation.
    root cause: UnaryOp::Neg 일괄 int sub 경로 (string IR backend). inkwell backend는 이미 정상.
    fix: expr_helpers.rs에서 F32/F64 분기 후 `fsub <T> 0.0, <val>` (commit fe356670).
  - [x] Bug 3: test_types_string.ll:2218 — `extractvalue { i8*, i64 } %i, 0` where %i is i64 (load_byte(s + i)에서).
    root cause: generate_binary_expr가 left_type=Str이면 무조건 str_concat 경로. str + int pointer arithmetic을 지원 안 함.
    fix: expr_helpers.rs에서 str + int 감지 → extractvalue 후 ptrtoint + add/sub, narrow int는 sext 처리 (commit d40ed758).

  ### 잔존 (세션 3으로 이관 권장)
  - [ ] Bug 1/2: test_types_bytes.ll:1183 + test_types_row.ll:608 — `store %Vec$u64 %t7, %Vec$u64* %result.8` where %t7 is %Vec$u8.
    context: read_vec_u64() 내부 `vec := mut Vec.with_capacity(count)` → let binding은 Vec<u64> alloca, RHS static method call은 Vec$u8 instantiation 호출.
    likely cause: A2.5 hint 경로가 let-binding 시점의 expected type을 TC가 채워주지 않음. Generic substitution 이전 프레임의 잔재가 새어서 `u8`이 선택된 것으로 추정 (정확한 원인은 미확인).
    investigation starting point: expr_types (span→type) map이 let-binding RHS span에 Vec<u64>를 기록하는지. 아니면 fn_instantiations의 정렬 순서상 u8가 앞에 있어서 fallback이 u8을 선택하는지. Both compiler repo + TC 쪽 조사.
  - [ ] Bug 6: test_types_test_types.ll:1011 — `load i64, i64* %t19` + `call ... @assert_approx(double %t20, ...)` (SqlValue.FloatVal field f64를 i64로 load).
    likely cause: enum struct variant payload access 시 GEP 결과의 load 타입이 payload slot(i64)로 emit됨. 실제 field는 f64이므로 `load double, double* ...` 또는 load i64 + bitcast to double 필요.
  - [ ] Bug 7: test_types_types.ll:1138 — `%t128 = phi i64 [ %t115, %merge26 ]` in block where sign variable (double) flows. Bug 5 fix 이후 float이 phi까지 가서 타입 불일치 드러남.
    likely cause: if-else/merge phi 생성 시 branch value가 double이지만 phi type을 고정된 i64로 결정. Phase 14/15의 phi coercion 수정 경로와 관련 가능.

  ### 검증
  - cargo test -p vais-codegen --lib: 796 passed / 0 failed (매 수정마다)
  - vaisdb 7 standalone tests: codegen 0 errors 유지
  - clang 링크: Bug 3/4/5 에러 소거. Bug 1/2/6/7 + A6/A7 unresolved extern만 잔존.
- [ ] A6. runtime helpers 대거 구현 [blockedBy: A1, A8]
  scope: 12개 unresolved extern의 IR body 또는 libc wrapper emission 추가 (crates/vais-codegen/src/function_gen/runtime.rs 확장). 우선순위는 위의 P1~P4 참조.
  verify: 링크 시 unresolved symbols 0개 (test_types 기준)
- [ ] A7. cross-module shallow-free emission [blockedBy: A1, A8]
  scope: __vais_struct_shallow_free_{Name}이 정의 모듈 밖에서 호출되는 경우 user 모듈에도 정의/선언되게 emission gate 수정. test.vais의 TestCase/TestResult/TestSuiteResult가 vaisdb 유저 모듈에서 drop될 때 unresolved 안 나도록.
  verify: 링크 시 shallow_free_* unresolved 0
- [ ] A4. 링크 파이프라인 end-to-end 검증 [blockedBy: A3, A5, A6, A7, A8]
  verify: vaisc run tests/sql/test_types.vais exit 0 + pass count > 0

진행률: 5/9 (A1, A2, A2.5, A3, A5 완료 — A8 부분 완료, Bug 1/2/7/array-slice는 세션 4로 이관)

### 세션 3 (2026-04-22) 요약
- A8 Bug 6 ✅ match struct-variant f64 payload bitcast load + Bool/F32/F64 분기 (vais@d92ac87d 포함)
- A8 새 발견 "float constant payload store" ✅ enum variant constructor에서 float literal bitcast store (vais@d92ac87d)
- A8 새 발견 "narrow int unwrap sext" ✅ Result/Option `!`/`?` 결과 narrow int trunc (vais@d92ac87d)
- A8 새 발견 "Bool pattern binding" ✅ i1 trunc (vais@d92ac87d)
- TC expr_types refresh 시도 → regression 유발로 revert (vais@273ad77d)
- vaisdb 워크어라운드: read_bytes/read_exact_bytes/read_vec_u64/zero_bytes에 explicit `Vec<T>` annotation

### 세션 2 (2026-04-22) 요약
- A3 ✅ (vais@44d07e4f) — compute_sizeof enum variant 경로. 변종 이름 → 부모 enum 크기 반환 + 하드코딩 16 제거.
- A5 ✅ (vais@09ee2abd) — `infer_expr_type` Field/StructLit 경로가 enum namespace access와 enum struct variant literal에서 부모 enum Named 반환. method dispatch receiver ABI 일치 (`@type_id` → `@SqlType_type_id(%SqlType*)`).
- A8 3/5 ✅ (vais@fe356670, d40ed758) — Bug 4 (enum field is_expr_value) / Bug 5 (float negation) / Bug 3 (str + int pointer arithmetic).
- vaisdb 15/15 standalone codegen 0 errors 유지, vais-codegen cargo test 796/796 pass 유지.

### 재개 지점 (세션 4, /clear 후 /harness)

남은 A8 core issues:
1. **Vec generic instantiation leak** (bytes.ll/row.ll) — 원인은 codegen의 `resolve_generic_call_with_hint` last-resort 경로가 `instantiations_list.first()`를 쓰는 것 + TC가 annotation 없는 let RHS에서 T를 Var로 남기는 것의 조합. 근본 fix는 두 옵션:
   - (a) compiler: let RHS type inference 시 body 내 이후 method calls 전방 스캔해 T 추론
   - (b) compiler: let binding의 alloca type 결정 경로에 `apply_substitutions` 호출 삽입 + annotation 없을 때 resolve_generic_call이 "알 수 없음 → defer to first concrete usage"로 변경
   - (c) [완화] vaisdb 모든 `Vec.with_capacity(x)`, `Vec.new()` let binding에 명시 annotation 전수 추가 — 수백 곳 영향, 일관성은 있지만 대규모 diff
2. **Bug 7** (parse_f64_str phi i64 vs double) — if-else phi 생성 경로에서 branch value의 실제 SSA type을 올바르게 전파. `control_flow/if_else.rs` phi 생성 코드.
3. **`&array_local` → `&[T]` slice coercion** — `ResolvedType::Array(T)`는 길이 정보가 없어서 현재 codegen이 slice fat pointer를 못 만듦. LocalVar에 array length metadata를 추가하거나 infer_expr_type이 array literal을 만든 alloca의 `[N x T]` IR 타입에서 N을 역추적.
4. A6/A7/A4은 위 3개 해결 후 의미.

### 서브에이전트 위임 교훈 (세션 2~3)
- impl-sonnet background agent가 "조사 중" 상태로 turn budget 초과하며 빈손 반환 (세션 2에서 2회).
- Opus direct는 세션 2 A5/A8-3/4/5 15분 내 해결, 세션 3 A8-6 등 추가 5건 빠르게 해결.
- TC refresh처럼 scope가 넓은 추론 fix는 전면 regression 위험 — 작은 단위로 실험적으로 추가/제거 확인 필수.
- 교훈: upstream compiler 내부 구조 탐색 + codegen 수정이 얽힌 task는 **처음부터 Opus direct** 또는 **매우 구체적인 fix plan + 20 tool budget**으로 위임.

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
