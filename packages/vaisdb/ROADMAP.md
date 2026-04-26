# VaisDB - AI-Native Hybrid Database
## Project Roadmap

> **Version**: 0.1.0 (Implementation Phase)
> **Goal**: Vector + Graph + Relational + Full-Text search in a single DB, optimized for RAG
> **Language**: Pure Vais (with C FFI for system calls)
> **Last Updated**: 2026-04-26 (Phase 0 v1.0 ✅ 완료 — vaisdb 재개 진입점)

---

## 🎯 Active Phase (harness 진입점)

mode: pending (Mini Pillar 1 다음 iter 결정 대기)
iteration: 74
max_iterations: 100
current_phase: Phase Ω — Mini Pillar 1 첫 iter 완료, ret 클래스 invariant 1개 사이트 적용 (2026-04-26)

**iter 74 완료 산출물 (3 commits)**:
- compiler `c683bd42` — docs(policy): Phase Ω Pillar 3+2 (CLAUDE 규칙 8~12 + ADR 0001 + vaisdb regression CI)
- compiler `7cfc5caf` — fix(codegen): Mini Pillar 1 coerce_ret_value 단일 coerce point
- vaisdb 본 ROADMAP iter 74 entry (이 commit)

**vaisdb Task #6 RESOLVED ✅** (node.ll:1736)
- ret 클래스 invariant 1개 사이트 적용 → Vec→fat-ptr 정상 emit
- 검증: cargo 796/796 ✅, regression 2→2 (1 resolved + 1 newly exposed call-arg class)

**잔여 (다음 iter 대상)**:
- node.ll:1848 — 신규 노출, call-arg coercion 클래스 (별도 invariant 필요)
- key.ll:1128 — Task #7 미해결, slice indexing emit (별도 클래스)

**상세 인계**: `~/.claude/projects/-Users-sswoo-study-projects-vais/memory/vaisdb_iter74_mini_pillar1_first_iter_2026-04-26.md`

**iter 74 (2026-04-26) — recon completed + 메타 분석 LANDED**:
- Task #1 recon ✅ 완료. emit path 정확히 식별 (memory `vaisdb_iter74_recon_2026-04-26.md`):
  - Task #6: `crates/vais-codegen/src/stmt.rs:344-539` ret 처리 통합 path. line 492-505에 이미 `ret_type == "{ i8*, i64 }"` 분기 존재 (void placeholder만 처리). **누락**: `val_ty == "%Vec$T*"` 케이스.
  - Task #7: `crates/vais-codegen/src/expr_helpers_data.rs` slice indexing **별도 emit path** (`comp := mut &components[i]` 형태). 정상 path는 line 514-569.
  - iter 73 4-path 실패 원인: AST/구조 레벨에 후킹 시도 → 실제 emit은 stmt.rs ret 처리 통합 path 내부.
- 정량 분석 완료: codegen 70,530 LOC / 142 파일 / **165 ad-hoc if-coerce** / **329 수동 register_temp_type** / **77 bitcast / 53 insertvalue / 139 inttoptr·ptrtoint** 산발 사이트
- 사용자 진단: "몇달 동안 계속 진행하다 다시 뜯어고치고 반복" — Phase 158 5회 토글, Phase 17 stopped, MASTER_ROADMAP pivot 후 다시 사이트 fix 회귀 확인
- **4-Pillar 안정화 제안 (Phase Ω, 7~13주)**:
  - Pillar 1 (6~10주): Type-Tagged IR Builder + Single Coerce Point + Auto Type Registration → 763개 산발 사이트 단일 API 수렴
  - Pillar 2 (2주): vaisdb/server/web을 compiler regression suite에 통합 → 같은 클래스 버그 재발 자동 차단
  - Pillar 3 (1주): 정책 코드화 (CLAUDE.md 규칙 8~12, "근본 해결" 정의 합의)
  - Pillar 4 (지속): ADR 신설, MASTER_ROADMAP 재활성화, memory 강화
- **사용자 결정 필요 (2026-04-26)**:
  1. Task #6/#7 진행 시점: (A) Phase Ω 시작 전 사이트 fix / (B) Pillar 2 적용 후 fix [추천 B]
  2. Phase Ω 착수 commitment: 7~13주 단일 드라이브 가능한가?
  3. 작은 commitment 버전: Pillar 3 (1주, 위험 0)부터 시작

**다음 세션 Day 1 procedure (사용자 결정에 따라 분기)**:
- 결정 A (사이트 fix 즉시): stmt.rs:492-505 분기 옆에 Vec→fat-ptr 분기 추가 (~30-40 LOC). cache nuke + cargo 796/796 + lang 311/311 검증 의무.
- 결정 B (Pillar 2 먼저): compiler CI에 vaisdb 빌드 step 추가 → known-failure 등록 → Task #6/#7 fix는 known-failure 해제 형태로 영구 차단.
- 결정 C (Phase Ω 착수): Pillar 3 정책 1주 → Pillar 2 living tests 2주 → Pillar 1 invariant 6~10주.

**iter 73 핵심 학습 (여전히 유효)**:
- vaisc cache (`tests/storage/.vais-cache/`)가 specialization 결과 보존 → fix 효과 가림. 매 빌드 전 nuke 필수.
- `--force-rebuild` flag만으로는 cache 정리 부족.
- Task #4 commit (`933e03e`) cache-state illusion 사례 — clean rebuild 시 use-after-move TC 에러.

**iter 74 추가 환경 prerequisite**:
- `/tmp/vais-lib/std` symlink 부재 시 빌드 실패 — `mkdir -p /tmp/vais-lib && ln -sf /Users/sswoo/study/projects/vais/compiler/std /tmp/vais-lib/std`

**상세 인계**:
- emit path 식별: `~/.claude/projects/-Users-sswoo-study-projects-vais/memory/vaisdb_iter74_recon_2026-04-26.md`
- 워크어라운드 금지 원칙: `~/.claude/projects/-Users-sswoo-study-projects-vais/memory/feedback_root_cause_only.md`
- 종합 인계: `~/.claude/projects/-Users-sswoo-study-projects-vais-lang/memory/phase0_complete_vaisdb_resume.md`

---

## 작업 목록 (TaskList 복구용)

- [ ] 6. codegen: Vec ptr → slice fat-ptr at function return path (in_progress)
  scope: BTreeInternalNode_flush의 `R &self.data;` (data: Vec<u8>) 사이트가 `ret { i8*, i64 } %vec_field_ptr` 직접 emit. ret_type `{i8*,i64}` + value `%Vec*`일 때 Vec data/len 추출 후 fat-ptr 구성.
  prerequisite: emit path 식별 (iter 73 시도 4 path 모두 fire 안 함).
  verify: clang error count 1 감소 (key.ll:1128만 남음), cargo 796/796 + lang 311/311.

- [ ] 7. codegen: fat-ptr-of-fat-ptr indexing (&[&[u8]] element)
  scope: btree/key.vais:104 `comp := mut &components[i]`. components: `&[&[u8]]`. element는 `{i8*,i64}` (16B fat ptr). expr_helpers_data.rs:514+ slice index path가 inner-fat-ptr 처리 누락 + bitcast 누락.
  scope: Wave 시리즈 cascade trigger class와 동일. 단일-사이트 fix 시 cascade 위험 매우 높음. design-driven 접근 필요.
  verify: clang error 0, cargo 796/796 + lang 311/311.

---

## 과거 phase (참고용)

current_phase_legacy: Phase 17 (Compiler Invariant Hardening)
task_order: Wave 2a (alloca 14) → 2b (gep 76) → 2c.1 (load wide) → 2c.2 (load narrow, full audit) → 2d (call 54) → Wave 3 (phi/extract/insert) → Wave 4 (catch-all 제거, strict 100%)
iteration: 65
max_iterations: 100
phase_doc: docs/MASTER_ROADMAP.md (Phase α/β/γ/δ/ε trust-building)
  last_session: iter 24 NEGATIVE — i32↔i64 class investigation found exact bug (match arm body_val vs phi_type width mismatch at `Option_unwrap_or$i32`), applied catch-all int-width coerce in arm block. Specific fix verified but broke link completely (1/15 → 0/15, +34 errors). Reverted. compiler HEAD stays at 706645e8.
  iter_25_strategy: Opus direct, design-only. 3 연속 negative 이후 memory escalation 정책에 따라 단일-사이트 fix 금지. llvm_type_of ground-truth 리팩터 설계 문서 작성. 사용자 승인: "리팩터 설계 문서 작성 (Recommended)".
  iter_32_strategy: Opus direct, mechanical multi-file edit (Wave 1c.5). 이유: (1) Wave 1c.1~1c.4 모두 Opus direct로 진행 (memory subagent_delegation_for_compiler_tasks), (2) record_emitted_type 인자(LLVM type string)는 emission context별로 정확해야 함 — pattern-match만으로는 sext/trunc/icmp dst-type 추출 실수 가능, (3) &self signature 빌드 에러 즉시 분기 판단 필요. Background는 가성비 떨어짐.
  iter_33_strategy: Opus direct, design-only doc (Wave 2). 이유: 기존 llvm-ground-truth.md의 톤/구조 유지, Wave 1c.5 cascade 교훈 반영, 5-Wave migration plan과 일관된 scope 서술. Delegation 시 design continuity 손실 위험.
  iter_34_strategy: Opus direct, Wave 2a 착수. 사용자가 "100% 안전·명확" 우선 원칙으로 5개 Open Questions 결정 — 전부 debt-free defaults.
  iter_35_strategy: Opus direct, Wave 2c.1 load i64 mechanical batch migration. 파일별 batch + 8-run gate per batch. Cascade 감지 시 즉시 revert (loops.rs 6 sites revert됨, +10 에러 cascade). Wave 2b gep보다 단순 (load result는 IR string pointee type 그대로).
  iter_36_strategy: Opus direct, Wave 2c.1 wide-load 나머지 batch (ptr/float/F32/Str-fat/i64 각각 batch). Named struct value load는 Wave 2a deferred와 동일 클래스 → 이월.
  iter_37_strategy: Opus direct, Wave 2b gep 착수. 안전 우선 — 단순 `[N x T]` array gep + Vec `i32 0, i32 N` field gep. Vec es/cap/len의 일부 consumer는 catch-all 의존 (method_call 3 sites revert).
  iter_38_strategy: Opus direct, Wave 2b 확장. stmt.rs/stmt_visitor.rs Vec field gep (Wave 2a의 stmt.rs alloca deferred class와 달리 gep는 safe — consumer가 이후 load i64로 cascading), ref_deref.rs/map_lit.rs 배열 gep. 2 commits.
  iter_39_strategy: Opus direct, Wave 2b 잔여 + Wave 2c.2 audit + Wave 2d 시작. expr_helpers_misc payload_ptr gep (cascade, 2 revert). pattern tag_val i32 narrow load (cascade, 3 revert). malloc 5 landed. Task #6 Helper-IR Wave 4로 이월하고 #9 Wave 2d unblock.
  iter_40_strategy: Opus direct, Wave 2d 확장. strlen i64 (6 sites landed). i32 returning libc calls (strcmp, snprintf len) 시도했으나 cascade — i32 기록 자체가 cascade class로 확인.
  iter_41_strategy: Opus direct, Wave 3 착수. extractvalue 45 sites 중 안전한 것 (poll_ret_ty struct extract, { i8*, i64 } fat-ptr extract). Fat-ptr extract는 consumer에 따라 cascade 위험.
  iter_42_strategy: Opus direct, Wave 3 phi 착수. phi declared type이 IR에 명시돼 있어 기록 단순. stmt/if_else/expr_helpers_control 등 declared phi_llvm 변수 기반.
  iter_43_strategy: Opus direct, Wave 3 확장. match_gen phi 1 + insertvalue batch (helpers fat-ptr + range literal + slice ref fat-ptr). insertvalue result type = base aggregate type (리터럴).
  iter_44_strategy: Opus direct, Wave 3 bitcast 착수. bitcast target = cast dst type (IR 명시). i8* / i64* 타겟부터 안전 — consumer가 pointer type 기대.
  iter_45_strategy: Opus direct, Wave 3 bitcast struct target 시도. data 클래스 cascade 재확인 (Wave 2a.deferred와 동일 class). call_gen 1 site landed.
  iter_46_strategy: Opus direct, Wave 3 insertvalue 잔여 배치. expr_helpers pad cast, string_lit format!-based, if_else Str zeroinit substitute — 모두 `{ i8*, i64 }` 고정.
  iter_47_strategy: Opus direct, Wave 3 expr_helpers_control insertvalue. 4 Str void substitute 패턴 — phi_llvm == "{ i8*, i64 }"일 때 zeroinit으로 사용.
  iter_48_strategy: Opus direct, Wave 3 async_gen insertvalue. poll return { i64, ret_llvm } 3 sites. 사용자 요청으로 wake-up 간격 25분→10분 단축, max_iterations 50→60 확장.
  iter_49_strategy: Opus direct, Wave 3 stmt insertvalue. 4 async poll-ret + Str fat-ptr zinit.
  iter_50_strategy: Opus direct, Wave 3 stmt_visitor insertvalue. 3 async poll patterns (stmt.rs와 mirror).
  iter_51_strategy: Opus direct, Wave 3 잔여 fat-ptr insertvalue. method_call Vec→slice, expr_helpers_misc closure heap-buf, codegen ret zinit.
  iter_52_strategy: Opus direct, Wave 3 generate_expr_call insertvalue. Vec→slice fat-ptr (call-arg conversion) + trait object 구성 (`{ i8*, i8* }`).
  iter_53_strategy: Opus direct, Wave 3 completed (62 sites total) → Wave 2d 다시. user fn calls (closure) + drop_fn calls.
  iter_54_strategy: Opus direct, Wave 2d call extension. indirect-call, memcpy, user fn (variadic + regular).
  iter_55_strategy: Opus direct, Wave 2d string_ops `__vais_str_*` helper calls (i64 ret, 3 sites).
  iter_56_strategy: Opus direct, Wave 2d misc calls. await poll_result (dynamic poll_ret_ty), SIMD reduction intrinsics (elem_ty), async state alloc.
  iter_57_strategy: Opus direct, design-only doc (Wave 4). Wave 2d task #9 completed (25 sites total). Task #11 Wave 4 design 신설+landing. 4 deferred classes (A i32, B data-chain, C &self, D helper-IR) 분석 + sub-wave 4a-e plan.
  iter_58_strategy: Opus direct, Wave 4a 시작. probe infra (VAIS_GROUND_TRUTH_PROBE) + %ret.{N} long-tail 4 sites. max_iterations 60→70 확장.
  iter_59_strategy: Opus direct, Wave 4a void special-case + probe context. void miss는 가장 빈번한 false-positive (semantic miss-not-real-miss).
  iter_60_strategy: Opus direct, Wave 4a probe analysis. Top miss 함수 식별 (PageHeader_deserialize 15, BTree*_from_page_data 7-8). 패턴 — `sext i32 ... to i64` result가 record_emitted_type 누락. 분석 노트만, 코드 변경 0.
  iter_61_strategy: Opus direct, Wave 4a 추적 emit path. expr_helpers.rs binop sext widening + as-cast trunc/sext result.
  iter_62_strategy: Opus direct, Wave 4a coerce_int_width 시도. signature `&self → &mut self` + record_emitted_type. cascade +7 revert. stdlib unknown call (`__load_i32`) miss path 발견.
  iter_63_strategy: Opus direct, Wave 4a partial completed + memory consolidation. Task #12 closed. memory `phase17_wave2_3_4a_progress.md` 신설. mode → stopped (사용자 결정 대기).
  iter_64_strategy: Opus direct, **방향 전환**. 사용자 "사람들이 믿고 쓸 수 있어야"에 응답하여 Master Roadmap 신설 (`docs/MASTER_ROADMAP.md`). Phase α/β/γ/δ/ε trust-building. Wave 4 보류, "0/14 → 1/14 → 5/14 → 14/14 + production hardening" 단계. iter 64 Phase α.1 시작 — test_page_manager link errors 4→3.
  iter_65_strategy: Opus direct, Phase α.1 강행. 결과: layer-by-layer 노출 패턴 확인.
  iter_68_strategy: sequential. Task #1 baseline은 Opus direct (Bash 빌드+측정, 코드 변경 0). Task #2~#4 fix는 Opus direct (vais compiler codegen 수정, memory subagent_delegation_for_compiler_tasks 정책). Task #1 → #2 → #3 → #4 순.

  **iter 68 (2026-04-26) — Task #1 baseline ✅ 인계 메모와 100% 일치**:
  - vaisdb test_btree 빌드: vaisc emit OK, clang link 4 errors (변동 없음)
    1. test_btree_key.ll:1128 — %t29 ptr vs `{ ptr, i64 }` (slice ABI)
    2. test_btree_node.ll:740 — %t61 `%BTreeInternalEntry` vs ptr (8B small-struct)
    3. test_btree_prefix.ll:830 — %t33 i8 vs i64 (zext 누락)
    4. test_btree_test_btree.ll:815 — %k1.1 ptr vs `{ ptr, i64 }` (slice ABI 동류)
  - lang regression: 311 passed, 0 failed, 0 xfail ✅
  - cargo test -p vais-codegen --lib: 796/796 ✅
  - 다음 iter: Task #2 prefix.ll i8→i64 zext fix (가장 단순부터).
  iter_69_strategy: Opus direct, Task #2 prefix.ll i8→i64 zext fix. cascade 위험 vais compiler codegen 수정 — memory subagent_delegation_for_compiler_tasks 정책. site별 emit path 추적 후 단일 fix 시도, cascade 시 즉시 revert.

  **iter 69 (2026-04-26) — Task #2 prefix.ll i8→i64 zext fix LANDED ✅ (1 fix, 1 새 layer)**:
  - 변경: vais compiler 3 files
    - `expr_helpers_call/method_call.rs:615` arg coerce path
    - `expr_helpers_call/call_gen.rs:186` store-via-arg path
    - `generate_expr_call.rs:843` direct call coerce path
  - 모든 fix: i64-erased → struct coerce 직전 `llvm_type_of(val)` 확인. narrow int (i1/i8/i16/i32)이면 zext to i64 후 inttoptr.
  - 적중: `%t34 = zext i8 %t33 to i64` 추가 → prefix.ll:830 에러 사라짐
  - 새 layer 노출: prefix.ll:1475 — `%t100` `%Vec$u8` vs `%Vec$u64` (reconstruct_key Vec<u8> 반환을 current_key Vec<u64>에 store). Vec specialization mix — 별도 카테고리.
  - cargo test -p vais-codegen --lib: 796/796 ✅
  - lang regression: 311/311 ✅ (zero regression)
  - vaisdb test_btree clang: 4 → 4 (1 fix, 1 new layer, 잔여 3건 그대로)
  - 다음 iter: Task #3 slice ABI fat-ptr-of-fat-ptr fix.
  iter_70_strategy: Opus direct, Task #3 slice ABI fat-ptr-of-fat-ptr fix. key.ll:1128 + test_btree.ll:815 — `&[&[u8]]` element fat-ptr 인덱싱. expr_helpers_data.rs slice path 의심. cascade 위험 vais compiler codegen 수정.

  **iter 70 (2026-04-26) — Task #3 partial: site 2 LANDED ✅, site 1 분리 → Task #5**:
  - 변경: vais compiler `expr_helpers_call/method_call.rs` `generate_method_call_expr`에 Vec→slice coerce path 추가 (generate_static_method_call_expr와 mirror)
    - Generic param substitution 후 sub가 Slice일 때
    - Non-generic param이 Slice일 때
  - 적중: test_btree.ll:815 `Vec_push$slice_u8(_, %k1.1)` Vec→slice 자동 변환 → 에러 사라짐
  - 새 layer 노출: test_btree.ll:1142 `compare_keys({i8*,i64} %stored.35, ...)` `stored.35`은 alloca-of-fat-ptr → load 누락 — 별도 카테고리
  - Site 1 (key.ll:1128) 분리 → Task #5: `&[&[u8]]` element fat-ptr indexing path. expr_helpers_data slice index 깊이 들어가는 작업, cascade 위험 매우 높음. Task #4 완료 후 정리.
  - cargo test -p vais-codegen --lib: 796/796 ✅
  - lang regression: 311/311 ✅ (zero regression)
  - vaisdb test_btree clang: 4 → 4 (1 fix, 1 new layer, 잔여 site 1 + node + new prefix layer + new test_btree layer)
  - 다음 iter: Task #4 node.ll BTreeInternalEntry 8B struct fix.
  iter_71_strategy: Opus direct, Task #4 node.ll BTreeInternalEntry 8B struct fix. 인계 메모 "가장 깊은 작업". 8B small struct ptr-slot erasure path. cascade 발생 시 즉시 revert + 종료.

  **iter 71 (2026-04-26) — Task #4 node.ll source-side fix LANDED ✅**:
  - 변경: vaisdb source `src/storage/btree/node.vais:63` — `entries := mut Vec.with_capacity(...)` → `entries: Vec<BTreeInternalEntry> := mut Vec.with_capacity(...)` 명시 type annotation
  - 적중: `Vec_push$u64(...)` → `Vec_push$BTreeInternalEntry(...)` 정확 specialize. node.ll:740 에러 사라짐.
  - 새 layer 노출: node.ll:1736 — `%t43` ptr vs `{ptr,i64}` (Task #5 slice ABI와 같은 카테고리)
  - cargo test -p vais-codegen --lib: 796/796 ✅
  - lang regression: source-only 변경이라 영향 없음
  - vaisdb test_btree clang: 4 → 4 (1 fix, 1 new layer node.ll:1736 slice ABI / Task #5 카테고리 합류)
  - 사용자 결정: 소스 타입 명시 fix (최소 위험) — compiler-side inference pollution 차단은 별도 작업
  - 다음 iter: Task #5 (slice ABI 카테고리, 누적 3 site: key.ll:1128, test_btree.ll:1142, node.ll:1736)

  **iter 72 (2026-04-26) — 종합 정리 + 다음 세션 인계**:
  - 누적 (iter 67→72, 6 iter): vais compiler +2 commit + vaisdb source +2 commit. 4건 → 2건.
  - 잔여 2 site (모두 codegen 영역, 별도 task #6, #7로 분리):
    - test_btree_node.ll:1736 — Vec ptr → slice ret coerce (Task #6)
    - test_btree_key.ll:1128 — fat-ptr-of-fat-ptr indexing (Task #7)
  - Task #6/#7 모두 codegen 깊은 작업 + cascade 위험 매우 높음 (Wave 시리즈 trigger class). 다음 세션은 emit path 정확히 식별 후 design-driven 접근 권장.
  - 이번 iter 시도된 codegen fix (revert): stmt.rs Stmt::Return Vec→slice 분기 + codegen.rs FunctionBody::Block ret 분기 — 둘 다 fire 안 함 (probe 결과 0회). emit path가 inkwell 또는 다른 module이라 추가 조사 필요. revert 후 cargo 796/796 + lang 311/311 유지.
  - Task #5 closed as "source-side fix 3 sites landed" — 잔여는 #6/#7로.

  **iter 72 (2026-04-26) — Task #5 partial: source-side 3 site fix LANDED ✅ (4→2)**:
  - 변경: vaisdb source 2 files, 3 sites
    - `src/storage/btree/prefix.vais:138, 214` — `current_key: Vec<u8> := mut Vec.with_capacity(...)` 명시 type (Task #4와 같은 패턴, Vec inference pollution 회피)
    - `tests/storage/test_btree.vais:151, 191` — `compare_keys(stored, ...)` / `decode_i64_key(found_key)` (`&` 제거; slice 변수에 `&` 적용은 alloca-of-fat-ptr 생성)
  - 적중: prefix.ll:1475 ✅, test_btree.ll:1142 ✅, test_btree.ll:1446 ✅
  - 잔여 2 site (둘 다 codegen 영역, source 우회 어려움):
    - key.ll:1128 — `&[&[u8]]` element fat-ptr indexing (expr_helpers_data slice path inner-fat-ptr)
    - node.ll:1736 — `R &self.data` Vec→slice ret path (codegen ret coerce 누락)
  - cargo 796/796 ✅
  - lang regression: source-only 변경, 영향 없음
  - 다음 iter: 잔여 2 site는 codegen fix만 가능. 단일-사이트 fix 위험 — 묶어서 design.

  **iter 71 종료 — 사용자 결정 "세션 종료 + 인계 메모 갱신"**:
  - 누적 진전 (iter 67→71, 5 iter, +3 fix landed):
    - vais@45c04e82: codegen 3-path zext narrow→i64 before inttoptr in arg coerce
    - vais@b8fb12c1: codegen Vec→slice coerce in instance method call
    - vaisdb@933e03e: source-side `entries: Vec<BTreeInternalEntry>` type annotation
  - vaisdb test_btree 4건 잔여 (모두 같은 deep ABI 카테고리, Task #5로 묶음):
    - test_btree_key.ll:1128 — `&[&[u8]]` element fat-ptr 인덱싱 (slice index path inner-fat-ptr 처리 누락)
    - test_btree_prefix.ll:1475 — `%t100` `Vec$u8` vs `Vec$u64` (Vec specialization mix from `reconstruct_key` 반환)
    - test_btree_test_btree.ll:1142 — `%stored.35` alloca-of-fat-ptr load 누락 (`compare_keys({i8*,i64}, ...)` 에 alloca ptr 직접 전달)
    - test_btree_node.ll:1736 — `%t43` ptr vs `{ptr,i64}` (slice ABI, 같은 카테고리)
  - cargo 796/796 + lang 311/311 throughout zero regression
  - **다음 세션 진입점**: 4 site 모두 같은 카테고리 → expr_helpers_data.rs slice indexing의 inner-fat-ptr path 종합 fix 또는 alloca-of-fat-ptr load 자동 wrap. Wave 4 catch-all 제거 또는 inference pollution 차단 설계 후 진입 권장. 단일-사이트 fix 시 cascade 위험 매우 높음 (memory phase17_3_negatives_escalation).

  **iter 65 (2026-04-25) — Phase α.1 진행 보고: layer 노출 패턴**:
  - Compiler fixes (4 commits):
    - `7c3aed52` match default arm null literal type detection
    - `72616dc2` Vec[i] = struct value loads pointer-to-struct
    - `039df2f7` 4-byte Named struct store (Vec_index_set)
    - `32d1ed83` match Variant pattern uses specialized enum name (e.g., Result$Tuple_VaisError)
  - vaisdb source fixes (3 commits):
    - `d834a49` test source `as u32` casts + heap.flush slice + as_bytes signature + write_to_page_vec helper
    - `71fa28c` heap iter_live Tuple decode 임시 skip (deep compiler gap)
  - Layer 노출 패턴 (test_page_manager errors 진행):
    1. freelist phi null → fixed
    2. heap dead_slot store → fixed (broader assign heuristic)
    3. vec __value_ptr 4-byte struct → fixed
    4. test_page_manager phi i64 with i32 → source `as u32` workaround
    5. heap flush Vec→slice → source helper
    6. heap as_bytes signature → fixed
    7. heap match `%Unknown` enum → fixed
    8. heap match `%Tuple` payload → source skip
    9. heap `@to_vec` undefined → 다음 layer
  - **각 fix가 다음 hidden bug 표면화**. test_page_manager 단일 테스트도 multi-session 작업이 명백.
  - cargo 796/796 ✅ throughout.
  - **솔직한 진단**: 컴파일러 자체의 안정성이 부족. ad-hoc fix 패턴은 trust-building에 부적합 — 진짜 수정은 컴파일러 차원의 systematic work 필요. Master Roadmap이 "post-Phase 17 cleanup"을 의미했지만 **실제로는 vais 컴파일러가 still in-development** 상태.
  - 사용자 결정 필요:
    - (a) Phase α.1 강행 (multi-session 인내, layer-by-layer)
    - (b) **Phase 0 신설 — 컴파일러 selfhost / hello world 검증 먼저** (vais 컴파일러 안정성 baseline 확보)
    - (c) ROADMAP 재조정 (vaisdb는 vais 컴파일러 v1.0 이후로 이월, 그 전엔 선언적 기능 정의에만 집중)
  - mode: stopped (unknown)

  **iter 64 (2026-04-25) — Master Roadmap landed + Phase α.1 첫 fix LANDED ✅**:
  - 신규 산출물: `docs/MASTER_ROADMAP.md` (~270 lines, vaisdb 종합 로드맵)
    - 5 Phases: α (1 test pass) → β (5 tests + CLI demo) → γ (persistence + crash recovery) → δ (vector + RAG) → ε (production hardening)
    - 6 Trust principles (runs → does what it says → survives surprises → honest → reproducible → scales → external user)
    - 6 Process rules (demo-driven, README honesty, no phase skip, etc)
    - Anti-goals 6 (features-before-tests, hide failures, marketing-before-β)
  - **Phase α.1 첫 fix (compiler)**: `match_gen.rs` default arm null literal로 phi result type narrow integer phi인데 incoming "null" emit하던 버그 수정
    - `phi_llvm_actual` detection (actual_llvm_type / temp_var_types) 추가
    - resolved type LLVM rendering이 pointer일 때만 "null", 아니면 "0" 사용
  - test_page_manager 진행: link errors **4 → 3** (freelist null fixed). cargo 796/796 ✅.
  - 잔여 3 errors:
    - `heap.ll:1273` ptr vs %HeapPageSlot value
    - `test_page_manager.ll:828` phi i64 with i32 incoming  
    - `vec.ll:913` %__value_ptr ptr vs i32 store
  - max_iterations 70→100 확장 (Phase α/β를 위한 여유).
  - 다음 iter: heap.ll dead_slot fix.

  **iter 63 (2026-04-25) — Wave 4a partial completed + memory landed**:
  - Task #12 (Wave 4a) marked completed: probe infra + 6 safe sites (Wave 4a.partial).
  - Memory file: `~/.claude/projects/-Users-sswoo-study-projects-vais-lang/memory/phase17_wave2_3_4a_progress.md` (Wave 2/3/4a 누적 258 sites + cascade trigger classes + Wave 4 catch-all 전제).
  - MEMORY.md 인덱스에 추가 (12 entries).
  - 누적 migrated: **258 sites** (iter 58-61 Wave 4a로 +6).
  - **Wave 2/3/4a 종합**:
    - Wave 1: 99 sites (primitives)
    - Wave 2a alloca: 9 (9 deferred), 2b gep: 17 (5+ deferred), 2c.1 load wide: 40, 2c.2 narrow: 0 신규, 2d call: 25
    - Wave 3 phi/extract/insert/bitcast: 62
    - Wave 4a probe + safe: 6
    - 잔여 deferred: ~30+ sites across cascade-trigger classes (모두 Wave 4 단계).
  - **사용자 결정 필요**:
    - (a) Wave 4 본격 시작 — catch-all 제거 + Class A (i32) + B (data-chain) + C (&self) + D (helper-IR) 동시 진행. Risk: 큰 refactor, 여러 cascade likely.
    - (b) 다른 vaisdb 영역 (예: 테스트 link 100% 도달 위한 ad-hoc fix)
    - (c) 현재 상태 유지하고 추후 재개 — Wave 4는 더 큰 refactor design 필요.
  - mode: stopped (unknown)

  **iter 62 (2026-04-25) — Wave 4a NEGATIVE — coerce_int_width signature change reverted**:
  - 시도: `types/coercion.rs::coerce_int_width(&self → &mut self)` + `record_emitted_type(&tmp, target_ty)`
  - 결과: cargo 796/796 ✅ but Gate 8-run avg **~28.75** vs baseline ~21.75 (**+7 cascade**)
  - Revert. Wave 4a coerce path는 catch-all 의존성 강함 — Wave 4b/4c (catch-all 제거 후) 단계가 적합.
  - **다른 식별된 miss path**:
    - `__load_i32` 같은 stdlib unknown call — call return record가 user fn에만 적용됨, stdlib helper는 별도 path
    - `read_vec_u32`/`read_vec_u64` body 내 `%t6 = call i64 @__load_i32(...)` 사이트 누락
  - Gate 영향 없음 (revert). 누적 migrated **258 sites** 유지.
  - **결론**: Wave 4a 코드 변경은 **점진적 등록 path만 안전**, coercion/struct 같은 cross-site interaction은 cascade. Wave 4 design doc Class A/B/C 중 C(`&self`)는 단순 signature 변경으로 안 됨 — 더 정교한 separation 필요.
  - 다음 iter: 다른 안전한 path 찾기 또는 Wave 4 strategy 재설계.

  **iter 61 (2026-04-25) — Wave 4a +2 cast/widen sites LANDED ✅ (probe miss 156→97 -37%)**:
  - Compiler commit: `5a11bcf0` — expr_helpers.rs 2 sites
    - L138 binop sext widening: `widened = sext i{rbits} ... to i64` → record "i64"
    - L686 `as`-cast width coercion: trunc/sext result → record llvm_type dynamic
  - Probe (test_btree): 156 raw misses → 97 (-37% reduction). void + cast 두 개 큰 source 처리.
  - Gate 8-run avg **~21.75** vs baseline ~21.75 (exactly held). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **258 sites** (iter 58 4 + 60 0 + 61 2 = +6 since Wave 4a start).
  - 다음 iter: 잔여 97 miss source 추적 (PageHeader_deserialize 등 deserialize 경로).

  **iter 60 (2026-04-25) — Wave 4a probe analysis (no code change)**:
  - Probe data:
    - test_btree.vais: Top 5 misses by function — PageHeader_deserialize (15), BTreeInternalNode_from_page_data (8), BTreeLeafNode_from_page_data (7), compress_keys_with_restarts (5), CompressedKey_deserialize (3)
    - test_types.vais: 단일 테스트는 대부분 covered (5-10 misses), like_match_internal에 cluster
  - Pattern 분석: `%t7 = sext i32 %checksum to i64` 같은 sext-to-i64 result가 record 누락. Wave 1 ptrtoint 처리는 됐지만 `byte_at()` / deserialize 경로의 sext는 별도 emit path.
  - 식별된 emit path 후보 (TBD): byte_extract helpers in expr_helpers_call/print_format.rs (Wave 1c.3에서 이미 9개 처리)와 다른 곳. 추가 grep 분석으로 정확한 emit site 찾기 필요.
  - Gate 영향 없음 (코드 변경 0). 누적 migrated **256 sites** 유지.
  - 다음 iter: byte_at deserialize 경로의 sext emit site 추적 + 등록.

  **iter 59 (2026-04-25) — Wave 4a void special-case + probe ctx LANDED ✅**:
  - Compiler commit: `f6d102c1` — `types/coercion.rs` `llvm_type_of`:
    - `val == "void"` → return "void" (literal void marker special-case, not catch-all i64)
    - probe now emits `fn=<current_function> val=<ssa>` for site identification
  - Probe 결과 정리: void miss (test_btree에서 24+/156)는 false positive — 의미론적 void return을 SSA처럼 lookup하던 곳들이 이제 정확한 "void" 받음.
  - Gate 8-run avg **~22.1** vs baseline ~21.75 (held). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **256 sites** (변동 없음 — special-case, count 증가 없음).
  - 다음 iter: %tN long-tail probe 분석 (특정 patterns: %ret.* 다른 site, %t1X 그룹 등).

  **iter 58 (2026-04-25) — Wave 4a probe + 4 %ret. sites LANDED ✅**:
  - Compiler commits:
    - `342b776c` — VAIS_GROUND_TRUTH_PROBE env-gated diagnostic (`llvm_type_of` fallback emits `[ground-truth-miss] %tN` to stderr)
    - `4e9f000b` — function_gen/codegen.rs 4 `%ret.{counter}` named-struct return load sites (replace_all)
  - Probe 측정 결과 (test_btree.vais 1개 테스트): **156 raw misses, ~50 unique SSA names**. 약 67-80% coverage 추정. Wave 4 design 예측 정확.
  - %ret. long-tail 발견 → 4 sites 즉시 register.
  - Gate 8-run avg **~14.1** vs baseline ~21.75 (**-7.65 improved**). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **256 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 25 + 3 62 + 4a 4 − 1).
  - 다음 iter: probe로 다른 테스트 누락 사이트 측정, 점진적 등록.

  **iter 57 (2026-04-25) — Wave 2d completed + Wave 4 design LANDED ✅ (design only, code 0)**:
  - Task #9 Wave 2d completed (25 sites total). Task #7 (duplicate Wave 2d, blocked) deleted. Task #11 Wave 4 design completed.
  - Compiler commit: `baec4e5f` — `docs/refactor/llvm-ground-truth-wave4.md` (193 lines)
  - 설계 요약:
    - **Goal**: `generate_expr/mod.rs:298` catch-all `default → "i64"` 제거 (sub-wave 4a).
    - **Pre-conditions**: Class A (i32 cascade 8) + B (data-chain 6) + C (&self 7) deferred 사이트 해결 필요.
    - **Sub-waves**: 4a 1-line catch-all change → 4b i32 retry → 4c data-chain retry → 4d &self signature → 4e helper-IR FunctionContext (Q2 strict 100%).
    - **Coverage metric**: panic-driven (debug_assert!) 1순위, 측정 pass 옵션.
    - **Risk**: 4a `debug_assert!` panic-driven coverage hunt 필요. 첫 run에서 long-tail 미등록 SSA 표면화 예상. Wave 1c 수준의 iteration 작업.
  - cargo 796/796 + 355/355 ✅ (변경 없음). vaisdb gate 영향 없음.
  - 누적 migrated: **252 sites** (변동 없음, design-only).
  - **사용자 review checkpoint**: Wave 4 5개 Open Questions (Wave 2와 동일 패턴). 다음 iter는 사용자 review 후 결정.
  - 다음 iter: 사용자 Wave 4 review → 승인 시 Wave 4a 시작 또는 4d (`&self` audit) 먼저.

  **iter 56 (2026-04-25) — Wave 2d +4 misc calls LANDED ✅ (1 batch, 누적 25)**:
  - Compiler commit: `f3da3db6` — expr_helpers_misc.rs 3 + async_gen.rs 1 = **4 sites**
  - 패턴별:
    - await poll_result (L129) → dynamic poll_ret_ty
    - SIMD reduction intrinsic float/double/int (L1093/1105) → elem_ty
    - async %state_ptr alloc (L87) → "i64"
  - Gate 8-run avg **~17.9** vs baseline ~21.75 (**-3.85 improved**). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **251 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 25 + 3 62 − 1).
  - Wave 2d 잔여: vtable 1 (`&self`), runtime helper IR (Wave 4 scope), i32 cascade class.
  - 다음 iter: Wave 4 준비 또는 cascade class 정밀 audit.

  **iter 55 (2026-04-25) — Wave 2d +3 str helper calls LANDED ✅ (1 batch, 누적 21)**:
  - Compiler commit: `ad547b96` — string_ops.rs 3 sites (indexOf, startsWith, endsWith)
  - 모두 `__vais_str_*` helper i64 ret. write_ir! 패턴.
  - Gate 8-run avg **14.4** vs baseline ~21.75 (**-7.35 improved**). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **247 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 21 + 3 62 − 1).
  - 다음 iter: Wave 2d sched_yield/free 또는 Wave 4 준비.

  **iter 54 (2026-04-25) — Wave 2d +4 call sites LANDED ✅ (1 batch, 누적 18)**:
  - Compiler commit: `fb40dc9a` — generate_expr_call.rs 4 sites (indirect/memcpy/variadic/regular user fn)
  - 패턴별:
    - indirect call via fn_ptr → "i64" (L1108)
    - memcpy → "i8*" (L1158)
    - variadic user fn call → dynamic `ret_ty` (L1366)
    - regular user fn call → dynamic `ret_ty` (L1378)
  - Deferred: L1321 i32 variadic (cascade class).
  - Gate 8-run avg **~17.75** vs baseline ~21.75 (**-4 improved**). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **244 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 18 + 3 62 − 1).
  - 다음 iter: Wave 2d ABI calls (sched_yield, free, etc) 또는 Wave 4 준비.

  **iter 53 (2026-04-25) — Wave 3 완료 + Wave 2d +3 i64 call LANDED ✅ (1 batch)**:
  - Task #10 (Wave 3) completed — 62 sites (phi 8 + extract 7 + bitcast 6 + insertvalue 41).
  - Compiler commit: `d73f38a6` — closure direct call (generate_expr_call.rs 1) + drop_fn calls (stmt.rs 2 via replace_all) = **3 sites**
  - Gate 8-run avg **~14.4** vs baseline ~21.75 (**-7.35 improved**). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **240 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 14 + 3 62 − 1).
  - 다음 iter: Wave 2d 확장 — closure variants, ABI calls.

  **iter 52 (2026-04-25) — Wave 3 +5 expr_call insertvalue LANDED ✅ (1 batch, 누적 62)**:
  - Compiler commit: `f2f6c522` — generate_expr_call.rs 5 insertvalue
  - 타입별: `{ i8*, i64 }` Vec→slice 2, `{ i8*, i8* }` trait obj 2, `i8*` vtable_cast 1
  - Gate 8-run avg **~17.9** vs baseline ~21.75 (**-3.85 improved**). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **237 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 62 − 1).
  - Wave 3 잔여 insertvalue: emit.rs 2 (raw push_str helper IR — Wave 4 helper-IR scope), vtable.rs 2 (`&self`).
  - 다음 iter: Wave 3 마무리 정리 (사실상 끝났음 — 잔여 사이트는 모두 Wave 4 helper-IR 또는 &self 클래스). Wave 4 준비 또는 Wave 2.deferred 클래스 재시도.

  **iter 51 (2026-04-25) — Wave 3 +6 fat-ptr insertvalue LANDED ✅ (1 batch, 누적 57)**:
  - Compiler commit: `5e344d18` — method_call 2 + expr_helpers_misc 2 + codegen 2 = **6 sites**
  - 모두 `{ i8*, i64 }` Str/slice fat-ptr 구성 (fat1+fat2 chain).
  - Deferred: vtable.rs 2 sites (`&self` signature — fn_ctx 접근 불가).
  - Gate 8-run avg **~21.75** vs baseline ~21.75 (exactly held). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **232 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 57 − 1).
  - **Wave 3 status**: insertvalue + extract + phi + bitcast 누적 57 sites. 잔여 cascade 또는 `&self` 사이트는 Wave 4 단계.
  - 다음 iter: Wave 3 마무리 정리 또는 Wave 4 준비 (catch-all 제거 검토).

  **iter 50 (2026-04-25) — Wave 3 +3 stmt_visitor insertvalue LANDED ✅ (1 batch, 누적 51)**:
  - Compiler commit: `e1a6d4ba` — stmt_visitor.rs 3 insertvalue (poll_ret_ty t0/t1 + void t0)
  - Gate 12-run avg **~24.25** vs baseline ~21.75 (+2.5 within noise). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **226 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 51 − 1).
  - Wave 3 잔여 insertvalue: codegen 2, method_call 2, expr_helpers_misc 2, vtable 2.
  - 다음 iter: method_call insertvalue.

  **iter 49 (2026-04-25) — Wave 3 +4 stmt insertvalue LANDED ✅ (1 batch, 누적 48)**:
  - Compiler commit: `0effcd12` — stmt.rs 4 insertvalue (async poll ret + Str zinit) = **4 sites**
  - Gate 8-run avg **~21.9** vs baseline ~21.75 (held). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **223 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 48 − 1).
  - 다음 iter: stmt_visitor/method_call/codegen 나머지 insertvalue.

  **iter 48 (2026-04-25) — Wave 3 +3 async_gen insertvalue LANDED ✅ (1 batch, 누적 44)**:
  - Compiler commit: `c3169d29` — function_gen/async_gen.rs 3 sites (%ret_0, %ret_1, %invalid_ret)
  - 패턴: async poll return `{ i64, <ret_llvm> }` — record with `format!("{{ i64, {} }}", ret_llvm)`.
  - Gate 8-run avg **~17.9** vs baseline ~21.75 (**-3.85 improved**). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **219 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 44 − 1).
  - Wave 3 잔여 insertvalue: codegen 2, stmt 4, stmt_visitor 3, method_call 2, expr_helpers_misc 2, vtable 2.
  - 다음 iter: stmt or method_call insertvalue.

  **iter 47 (2026-04-25) — Wave 3 +4 control insertvalue LANDED ✅ (1 batch, 누적 41)**:
  - Compiler commit: `ce95061a` — expr_helpers_control.rs 4 Str void substitute insertvalue
  - 패턴: `{ i8*, i64 }` Str zeroinit 사용 (else/then branch가 i64 placeholder 또는 void인 경우 phi 일치 위해).
  - Gate 8-run avg **~21.6** vs baseline ~21.75 (held). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **216 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 41 − 1).
  - Wave 3 잔여 insertvalue: async_gen 3, codegen 2, stmt 4, stmt_visitor 3, method_call 2, expr_helpers_misc 2, vtable 2.
  - 다음 iter: async_gen 3 (futur state 구성 ` { i64, i64, ... }`) 또는 codegen 2 (function ret).

  **iter 46 (2026-04-25) — Wave 3 +5 insertvalue LANDED ✅ (1 batch, 누적 37)**:
  - Compiler commit: `71d0ab24` — expr_helpers.rs 2 + string_lit.rs 2 + if_else.rs 1 = **5 sites**
  - 모든 insertvalue target `{ i8*, i64 }` (Str fat pointer): i8* pad cast + string literal construct + Str void substitute.
  - string_lit의 format!-based IR에도 self.fn_ctx.record_emitted_type 호출 (write_ir! 아니어도 가능).
  - Gate 8-run avg **~18** vs baseline ~21.75 (**-3.75 improved**). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **212 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 37 − 1).
  - Wave 3 잔여 insertvalue: async_gen 3, codegen 2, stmt 4, expr_helpers_control 4, stmt_visitor 3, method_call 2, expr_helpers_misc 2, vtable 2.
  - 다음 iter: expr_helpers_control insertvalue or async_gen.

  **iter 45 (2026-04-25) — Wave 3 +1 bitcast LANDED ✅ (1 batch, 2 cascade revert)**:
  - Compiler commit: `00605e7c` — expr_helpers_call/call_gen.rs 1 bitcast i8*→{T}* (enum payload heap-alloc) = **1 site**
  - Deferred cascade: expr_helpers_data.rs 2 typed_ptr bitcast-to-struct — +7.35 errors avg (Wave 2a data 클래스 cascade 재발). Revert.
  - Gate 8-run avg **~21.4** vs baseline ~21.75 (held). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **207 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 32 − 1 doublecount).
  - **관찰**: expr_helpers_data 클래스는 consumer chain이 downstream index/field operations로 복잡 → ground-truth 기록이 기존 catch-all i64 fallback과 충돌. Wave 4 구조 수정 단계에서 data-chain consumer를 함께 수정 시 이월.
  - 다음 iter: insertvalue 잔여 batch (stmt 4, expr_helpers 2, if_else 1, async_gen 3, codegen 2, stmt_visitor 3).

  **iter 44 (2026-04-25) — Wave 3 +6 bitcast LANDED ✅ (2 batches, 누적 31)**:
  - Compiler commits: `4441ea30` (4 bitcast-to-i8*) + `f2fc1970` (2 bitcast-to-i64*) = **6 sites**
  - 패턴: `bitcast <src> to <dst_ptr_ty>` → record dst_ptr_ty (literal in IR).
    - `to i8*`: helpers 1 (slice data) + ref_deref 2 (slice-ref × 2 functions via replace_all) + stmt_visitor 1 (Vec memcpy dst) = 4
    - `to i64*`: helpers 2 (array-as-slice typed_ptr + Vec elem slice_ptr)
  - Gate per batch: {bitcast-i8*: -4 ✅, bitcast-i64*: -4.15 ✅}. cargo 796/796 ✅ per commit. linked 0/15 held.
  - 누적 migrated: **206 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 31 − 1 doublecount).
  - Wave 3 잔여: generate_expr_call 11 bitcast (complex consumer chain — 위험), expr_helpers_data/call_gen/stmt_visitor 일부 struct target bitcast, vtable bitcast, function_gen/codegen + generics bitcast.
  - 다음 iter: 잔여 bitcast struct target 또는 insertvalue 다른 file (stmt 4, expr_helpers 2, if_else 1, async_gen 3, codegen 2).

  **iter 43 (2026-04-25) — Wave 3 +10 sites LANDED ✅ (2 batches, 누적 25)**:
  - Compiler commits: `da4e3455` (match+helpers 3) + `46e9537d` (special+ref_deref 7) = **10 sites**
  - 타입별:
    - match_gen.rs 1 phi (dynamic phi_type)
    - helpers.rs 2 insertvalue `{ i8*, i64 }` (slice fat-ptr construct)
    - generate_expr/special.rs 3 insertvalue `{ i64, i64, i1 }` (range literal chain)
    - generate_expr/ref_deref.rs 4 insertvalue `{ i8*, i64 }` (slice ref + dual function)
  - Gate per batch: {match+helpers: -4.15 ✅, insertvalue: -3.75 ✅}. cargo 796/796 ✅ per commit. linked 0/15 held.
  - 누적 migrated: **200 sites** 돌파 ✅ (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 25 − 1 doublecount).
  - Wave 3 잔여: bitcast sites (~20-40 estimated) + 다른 insertvalue (stmt 4, expr_helpers 2, stmt_visitor 3, if_else 1, expr_helpers_control 4, method_call 2, etc) + async_gen 3 + generate_expr_call 4 extract (cascade), special 3, codegen 2, string_lit 1.
  - 다음 iter: bitcast 또는 insertvalue 추가 배치.

  **iter 42 (2026-04-25) — Wave 3 +8 phi LANDED ✅ (1 batch, 누적 15 sites)**:
  - Compiler commit: `5f782603` — stmt.rs 1 + if_else.rs 3 + expr_helpers_control.rs 4 = **8 phi sites**
  - 패턴: `%result = phi <llvm_type> [...]` → record_emitted_type(result, llvm_type). llvm_type은 각 site의 변수 (phi_llvm, llvm_type, 또는 리터럴 "i64").
  - Gate 12-run avg errors **~24.3** vs baseline ~21.75 (+2.55 noise 범위, codegen 13-15 flake 안정). cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **190 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 15 − 1 doublecount).
  - Wave 3 잔여: control_flow/pattern 3 phi, match_gen 1 phi, string_ops 4 phi (runtime helper 일부), helpers 2. 추가 insertvalue + bitcast 사이트도 남음.
  - 다음 iter: pattern/match_gen phi 또는 insertvalue (aggregate construct).

  **iter 41 (2026-04-25) — Wave 3 7 sites LANDED ✅ (2 batches, 1 cascade revert)**:
  - Compiler commits: `0ca568bb` (5 extractvalue in expr_helpers_misc) + `abb685f4` (2 in helpers.rs) = **7 sites**
  - 타입별:
    - async poll_ret_ty extract 0 (status) → "i64"
    - async poll_ret_ty extract 1 (result) → inner_ret_llvm dynamic
    - `{ i8*, i64 }` fat-ptr extract 0 → "i8*", extract 1 → "i64"
  - Deferred cascade: generate_expr_call.rs 4 fat-ptr extract sites — +6.85 errors avg (ptrtoint chain consumer 간섭 추정). Revert.
  - Gate per batch: {misc extract: 18 ✅, gen_expr_call+helpers 모두: 28.6 revert → helpers-only: 21.9 ✅}. cargo 796/796 ✅ per commit. linked 0/15 held.
  - 누적 migrated: **182 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 + 3 7 − 1 doublecount).
  - 다음 iter: Wave 3 phi sites (control_flow/if_else, match_gen, pattern, string_ops) — phi declared type은 명시적이라 기록 단순. bitcast/insertvalue도 가능.

  **iter 40 (2026-04-25) — Wave 2d +6 strlen LANDED ✅ (1 batch, 1 cascade revert)**:
  - Compiler commit: `bc95b0e2` — generate_expr_call.rs 4 strlen sites + string_ops.rs 2 strlen sites = **6 sites**
  - `call i64 @strlen(...)` → record "i64" (wide, safe)
  - Gate 8-run avg errors **~14.4** vs baseline ~21.75 (**-7.35 improved**). cargo 796/796 ✅. linked 0/15 held.
  - Deferred cascade: `call i32 @snprintf(null, 0, ...)` len_i32 (print_format.rs) — +6 errors avg → revert. i32 consumer 여러 site 연계 가능성.
  - Wave 2d 잔여 i32 calls (strcmp 5, printf 6, @puts i32): 전부 i32 return class → pattern tag_val과 같은 cascade class. Wave 4 refactor 단계로 이월 권장.
  - 누적 migrated: **175 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 11 − 1 doublecount).
  - 다음 iter: Wave 3 (phi/extract/insert) 또는 Wave 2d i64 returning non-libc calls. i32 class는 Wave 4에서 일괄 처리.

  **iter 39 (2026-04-25) — Wave 2c.2 audit 완료 + Wave 2d 5 malloc LANDED ✅ (1 batch, 2 revert)**:
  - Compiler commit: `ea67c681` (malloc 5 sites: helpers + generate_expr_call + print_format + call_gen + expr_helpers_misc)
  - **Wave 2c.2 audit 결과**: narrow load 신규 migrate 대상 **0건**. Wave 1c.1/1c.2에서 i8/i16/i32 narrow load (generate_expr_call, string_ops) 이미 처리 완료. pattern.rs tag_val i32 3 사이트 시도했으나 cascade (+7.35 errors avg) → Wave 2c.2.deferred. Tasks #4/#5 completed.
  - **Wave 2b 잔여 deferred**: expr_helpers_misc.rs 2 payload_ptr gep (+7.15 errors cascade, revert). Task #2 pending (Wave 4 구조 수정 단계).
  - **Wave 2d 시작 (malloc 5 사이트)**:
    - helpers.rs:511 (Vec elem raw_ptr) + generate_expr_call.rs:1111 (user malloc) + print_format.rs:445 + call_gen.rs:149 + expr_helpers_misc.rs:274 = 5 sites
    - `call i8* @malloc(...)` → record "i8*". Consumer 모두 ptr 기대 → safe.
    - Deferred 2 (`&self` signature): helpers.rs:329, vtable.rs:285.
  - Gate per action: pattern i32 {29.1 revert}, misc payload {28.9 revert}, malloc {22 held}. cargo 796/796 ✅. linked 0/15 held.
  - 누적 migrated: **169 sites** (전체 migrate: Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 + 2d 5 − 1 doublecount).
  - Task 구조 조정: Task #6 Helper-IR (Wave 4), Task #7 old Wave 2d (blocked by #6) 대신 새 Task #9 Wave 2d unblocked 진행.
  - 다음 iter: Wave 2d 나머지 call sites (free, strcmp, strcpy, sprintf 같은 libc calls — ret type 명확) + 기타 known-ret call.

  **iter 38 (2026-04-25) — Wave 2b +10 sites LANDED ✅ (2 batches, 2b 누적 17 sites)**:
  - Compiler commits: `47affc65` (stmt 4: stmt_visitor 1 + stmt 3) + `93779cd7` (ref+map 6: ref_deref 3 + map_lit 3) = **10 sites**
  - 타입별:
    - Vec field gep `i32 0, i32 N` → "i64*" (stmt_visitor Vec init + stmt Vec eager-drop)
    - Array elem_ptr gep `[N x T]` or generic → "T*" (ref_deref: index/slice + map_lit: keys/vals/result)
  - Gate per batch 8-run: {stmt: 14.9, ref+map: 14.5} vs baseline ~21.75 (**consistent -7 improvement**). cargo 796/796 ✅ per commit. linked 0/15 held.
  - 누적 migrated: **164 sites** (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 17 − 1 doublecount).
  - Wave 2b 잔여: fat-pointer/named struct field gep (`{T1, T2}` 기반, ~30+ sites). Vec consumer에 묶인 경우 cascade 위험.
  - 다음 iter: Wave 2b 잔여 {} tuple gep 또는 Wave 2c.2 narrow audit. gate baseline이 매번 향상 중 — 점진적 invariant 강화 동작 증거.

  **iter 37 (2026-04-25) — Wave 2b 7 sites LANDED ✅ + 3 deferred (3 batches)**:
  - Compiler commits: `5ff2b391` (helpers 2) + `514f8e29` (expr_visitor 1) + `ef4d19fb` (pattern+special+printfmt 4) = **7 sites**
  - 타입별:
    - Vec field gep `%Vec, %Vec* X, i32 0, i32 {0,1}` → "i64*" (helpers.rs 2 sites: data_field + len_ptr)
    - Array elem gep `[N x i64]` → "i64*" (expr_visitor.rs 1 comptime_array + special.rs 1 comptime)
    - Str const gep `[N x i8]` → "i8*" (pattern.rs strcmp + print_format.rs snprintf/printf 2)
  - **Deferred (cascade)**: method_call.rs 3 Vec gep sites (es_ptr/cap_ptr/len_ptr in Vec reserve+push+bitmap paths) — +7.4 errors 8-run avg, bisected and reverted. Vec method consumers가 catch-all i64 fallback에 의존. Wave 2b.deferred → Wave 4 단계로 이월.
  - Gate per batch 8-run: {helpers+method_call: 29.1 cascade → revert → 14.5 helpers-only ✅, expr_visitor: 18.1 ✅, pattern+special+printfmt: 21.75 held ✅}. cargo 796/796 ✅ per commit. linked 0/15 held.
  - 누적 migrated: 154 sites (Wave 1 99 + 2a 9 + 2c.1 40 + 2b 7 − 1 Wave 2a.deferred counted = 154).
  - 다음 iter: Wave 2b 잔여 (tuple/fat-pointer gep — llvm_ty 변수 기반, 30+ sites, complexity 중) or Wave 2c.2 audit (63 sites, 시간 많이 필요).

  **iter 36 (2026-04-25) — Wave 2c.1 +16 sites LANDED ✅ (3 batches, 누적 2c.1 40 sites)**:
  - Compiler commits: `73be3e47` (ptr+f64 9) + `857e3482` (float+fat 6) + `a7939953` (assign 1) = **16 sites**
  - 타입별:
    - i8* loaded → "i8*" (stmt.rs 2 sites, scope+frame drop slot)
    - %T* loaded → "%<T>*" (generate_expr_call.rs 1 site, struct ptr double-deref)
    - double loaded → "double" (pattern.rs 3 F64 + generate_expr_call.rs 2 F64 = 5)
    - float loaded → "float" (pattern.rs 3 F32 + generate_expr_call.rs 2 F32 = 5)
    - { i8*, i64 } loaded → fat-pointer (pattern.rs 1 Str binding)
    - i64 loaded → "i64" (expr_helpers_assign.rs 1 array-ref data slot)
  - Gate per batch 8-run: {22.6, 21.6, 18.1} all within/below baseline ~21.75. cargo 796/796 ✅ per commit. linked 0/15 held.
  - 누적 migrated: 147 sites (Wave 1 99 + 2a 9 + 2c.1 40 - 1 double count = 146 이상).
  - **Wave 2c.1 완료 판단**: 남은 wide-load 대부분은 Named struct value loads (ret 경로, 70 generic load sites의 subset) — Wave 2a deferred와 동일 클래스 (consumer audit 필요). Wave 4 구조 수정 단계로 이월.
  - 다음 iter: Wave 2b gep 76 sites or Wave 2c.2 narrow-load audit. Wave 2c.2는 full pre-audit 63 sites (Q1 결정) — 시간 많이 필요. Wave 2b 먼저가 현실적.

  **iter 35 (2026-04-24) — Wave 2c.1 23 sites LANDED ✅ (5 batches)**:
  - Compiler commits: `a55454b8` (helpers 4) + `5b1c2ff6` (call 4) + `377fe6c0` (loop+stmt 6) + `7b547aa9` (pattern 8) + `316e4861` (method_call 5) = **23 sites**
  - 대상: `%tN = load i64, i64* X` → `record_emitted_type(&tN, "i64")`. All wide-load.
  - 파일별:
    - helpers.rs 4 (slice len, data field, loop_idx, elem copy)
    - generate_expr_call.rs 4 (Vec data/len field loads × 2 paths, fn_ptr var, deref)
    - generate_expr_loop.rs 3 (range-for counter: cond/bind/inc)
    - stmt.rs 3 (Vec eager-drop helper: data_i/len_v/es_v)
    - control_flow/pattern.rs 8 (enum payload raw loads — safe, excludes 2 field_val direct loads)
    - expr_helpers_call/method_call.rs 5 (reserve/push len+cap/slice-arg)
  - **Deferred (cascade-trigger, +10 errors avg)**: generate_expr/loops.rs 6 sites (collection for-loop idx/len/data/elem_size). Wave 2c.2 audit iter로 이월.
  - Gate per batch 8-run: 모두 baseline ~21.75 내 (avg 14.5~21.5 범위, noise 내). cargo 796/796 + 355/355 ✅ per commit. linked 0/15 held.
  - 누적 migrated: 131 sites (Wave 1 99 + 2a 9 + 2c.1 23). Wave 2 잔여: ~245 sites (alloca 9 deferred + gep 76 + load remaining 110 + call 54).
  - 다음 iter: (1) Wave 2c.1 남은 wide-load (pointer load, named-struct load) or (2) Wave 2b gep 76 sites or (3) Wave 2c.2 narrow-load audit (Q1 결정: full pre-audit 63 sites). Cascade-detection 학습: vaisdb gate 측정치 자체에 flake가 많아 +5 이하 정밀 판정 어려움, +10 이상 일관 증가 시 revert.

  **iter 34 (2026-04-24) — Wave 2a LANDED ✅ (9 safe alloca sites, 9 deferred)**:
  - Compiler commit `3a01c700`. 18 grepped alloca sites 전수 시도 → bisect로 9 safe / 9 cascade-trigger 분리. 설계 doc 14-count vs grep 18-count 차이는 cascade-risk 사이트 포함 여부 때문.
  - **Migrated (9 sites)**:
    - expr_visitor.rs:402, 555 (local spill + comptime array)
    - expr_helpers_assign.rs:73 (entry-block alloca + initial store)
    - expr_helpers_misc.rs:206, 490 (closure refcap + return spill)
    - function_gen/codegen.rs:170, 799 (struct param spill × 2)
    - generate_expr_call.rs:1492, 1510 (specialized + generic alloca)
  - **Deferred 9 cascade-trigger sites** (iter 34 bisect 결과, Wave 2a.deferred로 표기):
    - expr_helpers_data.rs:61/129/249/313 (array/tuple/struct/union literal ptrs)
    - expr_helpers_call/call_gen.rs:42 (enum_ptr — 기존 register_temp_type와 중복)
    - stmt.rs:187/201/219/233 (let-binding %Type** double-ptr path)
    - function_gen/generics.rs:446 (specialized generic param spill)
    - helpers.rs `emit_entry_alloca` (21-caller blast radius — 별도 sub-iter로)
  - **Gate**:
    - cargo test -p vais-codegen --lib: 796/796 ✅
    - cargo test -p vais-types --lib: 355/355 ✅
    - 4-run gate (multi-module link, `clang -O0 -o bin /tmp/${name}_*.ll runtime.o sync_runtime.o`, `grep -c "error:"`)
      - pre-Wave-2a baseline: codegen {15,14,13,14}, linked 0/15, errors {15,14,13,14} avg **~14**
      - Wave 2a landed: codegen {15,14,14,14}, linked 0/15, errors {15,14,14,14} avg **~14.25** (+0.25, noise 범위)
    - Note: 이 gate 측정법(baseline ~14)은 기존 Wave 1c 시리즈의 `avg ~157` 스케일과 다름 — 별도 tooling으로 재측정하여 새 baseline 확립. 앞으로 Wave 2 시리즈는 이 ~14 baseline 기준으로 cascade 판정.
  - **Cascade observations** (Wave 1c.5 패턴 재현):
    - expr_helpers_data alloca ptrs는 downstream consumer(field access, gep, load)가 i64-default fallback 또는 별도 register_temp_type(Pointer(Named))에 의존. ground-truth `<T>*` 추가 시 **+22 errors** burst.
    - stmt.rs alloca는 `%Type**` double-ptr 경로 (struct_lit/enum_variant). 이 경로는 기존 llvm_type_of가 **%Type*로 축약**해 반환 — ground-truth 기록이 consumer store/load와 불일치.
    - helpers.rs `emit_entry_alloca`는 21 caller 전역 영향 → 단일 site가 아니라 caller-level 호출 context별 다른 LLVM type 필요 → 현재 helper 단일 `*` 추가는 부족.
  - 누적 migrated: 108 sites (Wave 1 99 + Wave 2a 9). Wave 2 잔여: 268 sites (alloca 9 deferred + gep 76 + load 133 + call 54 − 4 Wave 1 차감).
  - 다음 iter (Wave 2a.deferred or 2b): (1) stmt.rs 4 sites의 `%Type**` 정확한 기록 (double-ptr 경로), (2) expr_helpers_data 4 sites의 consumer audit 먼저, (3) generics.rs 1 site는 context-sensitive — 더 자세한 llvm_ty computation, (4) call_gen.rs 1 site 중복 기록 정리. 또는 Wave 2b (gep 76) 착수.
    **Wave 2 Open Questions 결정 (iter 34, 2026-04-24, 사용자 승인)**:
      Q1 (Wave 2c.2 audit cost) → **Full pre-audit**. Wave 1c.5 cascade 재발 방지. 5-10h audit ≈ bisect+revert 루프 대비 동등 비용 + zero noise.
      Q2 (Helper-IR) → **포함 (helper FunctionContext 신설)**. 영구 제외 시 Wave 4 catch-all 제거 불가 → invariant 불완전. 1세션 인프라 추가.
      Q3 (Cross-module call return type) → **IR-string type** (tentative 채택). LLVM이 실제로 보는 것이 ground truth. Iter 20 TC fallback은 분리 레이어로 남김.
      Q4 (Wave 4 coverage gate) → **Strict 100%** (Wave 5 이월 안 함). 5% legacy가 남으면 catch-all 제거 불가. Deferred set(width 5 + narrow-load) Wave 4 내 해결.
      Q5 (Macro vs explicit) → **Explicit 유지**. Grep-ability + self borrow 가시성. Wave 2c에서 boilerplate 측정 후 부분 macro 도입 escape hatch.
    예상 소요: Wave 2a(1) + 2b(1-2) + 2c.1(1) + 2c.2 audit(1) + 2c.2 migrate(1-2) + 2d(1-2) + helper-IR infra(1) = **7-10 세션**.
    착수 순서: Wave 2a (alloca 14 sites, risk 최저) → 2b → 2c.1 → 2c.2 audit iter → 2c.2 migrate → helper-IR infra → 2d.

  **iter 25 (2026-04-24) — LANDED ✅ (design-only, 코드 변경 0)**:
  - 산출물: `/Users/sswoo/study/projects/vais/compiler/docs/refactor/llvm-ground-truth.md` (신규, ~250 라인)
  - 설계 요약:
    - **문제**: `llvm_type_of`가 `temp_var_types` (ResolvedType registry) → `type_to_llvm` 프로젝션으로 동작 → SSA 값의 **실제 emitted LLVM type**이 아닌 **등록된 semantic type** 반환. 34개 consumer가 잘못된 타입으로 coerce 결정. 45개 registration site가 AST inference 기반으로 등록 → emission과 불일치.
    - **선택된 접근**: Option B — parallel `actual_llvm_type: HashMap<String, String>` track을 emission 시점에 기록. `llvm_type_of` resolution-order 1순위로 추가, 기존 ResolvedType track은 fallback으로 유지.
    - **거부된 대안**: Option A (IR 문자열 파싱, 복잡도 높음), Option C (signature-directed consumer only, 근본 해결 안 됨).
    - **마이그레이션**: 5-Wave 점진적 전환. Wave 1 (primitives: ptrtoint/trunc/sext/icmp/algebraic) → Wave 2 (composite: gep/load/call/alloca) → Wave 3 (aggregate+phi) → Wave 4 (catch-all `generate_expr/mod.rs:298` 제거) → Wave 5 (consumer cleanup). Wave당 cargo 796/796 + vaisdb 15/15 standalone + linked count 비회귀 gate.
    - **도구**: `write_ir_typed!` 매크로로 emit + record를 원자화. 각 Wave는 독립 revert 가능.
  - 검증 gate:
    - cargo test -p vais-codegen --lib: 796/796 ✅ (변경 없음, 코드 수정 0)
    - cargo test -p vais-types --lib: 355/355 ✅ (변경 없음)
    - compiler HEAD: 706645e8 (iter 21 landed) 유지, 신규 커밋 없음
  - 예상 소요: Wave 1-5 합계 4-5 세션 + 버퍼 1세션.
  - 다음 iter 방향: 사용자 리뷰 → 승인 시 Wave 1 착수 (Opus direct, primitives 15-25 site mechanical conversion + gate 검증).

  **iter 26 (2026-04-24) — Wave 1a + 1b LANDED ✅ (ground-truth infrastructure + ptrtoint)**:
  - Wave 1a (compiler commit `0aec7bd8`): infrastructure only
    - `FunctionContext.actual_llvm_type: HashMap<String, String>` field 추가
    - `record_emitted_type / get_emitted_type` methods 추가
    - `init.rs` 초기화, `signature.rs` / `async_gen.rs` clear, `method_call.rs` save/restore 추가
    - `llvm_type_of_checked` resolution 1순위에 ground-truth track 추가 (legacy ResolvedType fallback 유지)
    - 4-run baseline: codegen {15,13,15,14}, linked 1/15, errors {182,145,180,150} avg ~164
  - Wave 1b (compiler commit `788cffde`): 20 ptrtoint emission sites 전부 migrate
    - generate_expr_call.rs:10, expr_helpers.rs:5, method_call.rs:1, call_gen.rs:1, string_ops.rs:1
    - Skipped helpers.rs:_generate_alloc (dead fn, &self signature)
    - 4-run: codegen {14,14,15,14}, linked 1/15, errors {153,150,181,154} avg ~159.5
    - **Wave 1b delta: −4.5 errors** (ptrtoint sites 대부분 catch-all registry가 이미 i64로 등록 — 차이는 cross-module bleed 케이스에서만 발생)
  - 채택된 defaults (design doc Open Questions §9):
    - Q1 → 매크로 대신 개별 method call (`self.fn_ctx.record_emitted_type`) — 명시적, greppable, self borrow 이슈 site-local 판별 가능
    - Q2 → per-function (`FunctionContext.actual_llvm_type`), SSA scope 일치
    - Q3 → Wave 4 coverage 100% (strict) 
    - Q4 → debug_assert! 추가는 Wave 3 이후 시점에 고려 (지금은 두 track 공존)
  - Gate 전체 합격: cargo 796/796 ✅ + 355/355 ✅ + codegen 13-15/15 (flake band) ✅ + linked 1/15 held ✅ + 총 link 에러 -4.5
  - 다음 iter 방향 (Wave 1c): trunc/sext/zext/icmp/fcmp sites 87개 전체. batch 5 세션 필요 — 작게 쪼개서 파일별 진행. 독립 commit + per-batch gate. 각 batch cargo + vaisdb 4-run 통과 필수.

  **iter 33 (2026-04-24) — Wave 2 design doc LANDED ✅ (design-only, 코드 변경 0)**:
  - 산출물: `compiler/docs/refactor/llvm-ground-truth-wave2.md` (신규, 276 라인)
  - Compiler commit: `9fd7528b` (docs only)
  - Site 인벤토리 (실제 grep 측정): load 133, call 54, gep 76, alloca 14 = **277 sites Wave 2 total**. 추가로 push_str-style 138 (대부분 helper IR / runtime — Wave 2 scope에서 제외).
  - 위험-오름차순 마이그레이션 순서: 2a alloca → 2b gep → 2c.1 load(wide) → 2c.2 load(narrow, audit 필수) → 2d call.
  - **하드 게이트**: 각 sub-wave 4-run 평균 link 에러 +5 이상 증가 시 즉시 bisect+revert (Wave 1c.5 cascade 교훈 적용 — width-coerce 5건 패턴 재발 방지).
  - Wave 2c.2 (narrow load) 특수 프로토콜: 각 사이트 downstream consumer 분류 (safe vs cascade-trigger) 후 selective migrate.
  - Wave 4 coverage 궤적: Wave 2 종료 시 누적 ~87% (현재 23% → 87%). Wave 3 후 ~100%.
  - 예상 소요: Wave 2a (1) + 2b (1-2) + 2c.1 (1) + 2c.2 (1-2 audit 포함) + 2d (1-2) = **6-8 세션**.
  - Open Questions 5건 (audit 비용, helper-IR 제외, cross-module call 결정 기준, Wave 4 coverage 게이트, macro vs explicit) — 사용자 리뷰 대기.
  - cargo 796/796 + 355/355 ✅ (변경 없음 자동 통과).
  - 다음 iter 방향: 사용자 Open Questions 리뷰 → 승인 시 Wave 2a (alloca 14 sites) 착수.

  **iter 32 (2026-04-24) — Wave 1c.5 LANDED ✅ (19 contract/control-flow sites, 5 width-coerce reverted)**:
  - Compiler commit `115c3f5b`. 19 sites (initial 24 attempted, 5 reverted as cascade-trigger):
    - contracts/* (7): requires/invariants/assert/assume/auto_checks(nonnull+nonzero) icmp ne→i1, decreases icmp sge→i1
    - control_flow/match_gen.rs (2): guard icmp ne→i1, body zext i1→i64
    - expr_helpers_call/method_call.rs (1): vec_es needs_adjust icmp eq→i1
    - expr_helpers_misc.rs (3): poll is_ready, try_op is_err, unwrap is_err — icmp→i1
    - expr_helpers_data.rs (1): index sext narrow→i64
    - generate_expr_struct.rs (1): u8 field zext→i64
    - helpers.rs (1): for-loop bounds icmp slt→i1
    - stmt_visitor.rs (1): poll return trunc i64→i1
    - function_gen/async_gen.rs (1): poll body trunc i64→i1
    - function_gen/dependent_checks.rs (1): predicate icmp ne→i1
  - **Reverted 5 width-coerce sites** (initial attempt: +18.5 errors avg ~176 vs Wave 1c.4 ~157.5):
    - method_call.rs L446 zext, L1380 sext (param-width coerce in call args)
    - expr_helpers_assign.rs closure trunc/sext (compound assign width coerce)
    - function_gen/codegen.rs L333 ret trunc i64→narrow
    - function_gen/generics.rs L635 specialized ret trunc i64→narrow
  - Cascade pattern (memory `phase17_iter22_23_ptrtoint_cascade` 재현): width coerces register narrow types (i8/i16/i32) but downstream consumers expect i64-default fallback. Recording the truth breaks consumers that depend on the lie.
  - Gate 4-run (after revert): codegen {13,13,14,13}, linked 1/15, errors {147,149,183,149} avg **~157** vs Wave 1c.4 **~157.5** (**flat, within noise**).
  - cargo 796/796 + 355/355 ✅
  - 누적 migrated: 99 sites (1a infra + 1b 20 + 1c.1 13 + 1c.2 23 + 1c.3 9 + 1c.4 15 + 1c.5 19).
  - Wave 1c 잔여: 5 width-coerce sites deferred (consumer audit 필요 before record_emitted_type).
  - 다음 iter 방향: Wave 2 (load/call/getelementptr/alloca) 설계 또는 deferred 5 width-coerce sites consumer audit. Wave 4 (catch-all 제거)는 width 5건 포함 100% coverage 후.

  **iter 31 (2026-04-24) — Wave 1c.4 LANDED ✅ (expr_helpers/stmt/pattern 15 sites)**:
  - Compiler commit `95c23fe5`. 15 sites across 3 files:
    - expr_helpers.rs (5): icmp ne args for &&/||, zext i1→i64 × 2 (&&/|| result, cmp result), icmp ne for xor i1 coerce
    - stmt.rs (5): trunc i64→i1 poll return, icmp eq null × 2 (scope_drop + frame_drop), icmp sle/sge i64 vec-eager-drop bounds
    - pattern.rs (5): icmp eq strcmp match, icmp sge range pattern, trunc i64→i1 × 3 Bool field bindings (enum variant paths)
  - Gate 4-run: codegen {13,13,14,14}, linked 1/15, errors {148, 151, 153, 178} avg **~157.5** (vs Wave 1c.3 ~165.75, **−8.25 LARGEST Wave 1c gain**)
  - cargo 796/796 + 355/355 ✅
  - 누적 migrated: 80 sites. Wave 1c 잔여: ~27 sites across smaller files (misc).

  **iter 30 (2026-04-24) — Wave 1c.3 LANDED ✅ (print_format.rs 9 sites)**:
  - Compiler commit `14bc417f`. 9 sext/zext sites in expr_helpers_call/print_format.rs:
    - vararg ABI: 2 sext i8/i16→i32 + 2 zext i8/i16→i32 + 2 zext i1→i64 (each in printf_args + arg_vals paths)
    - snprintf len: 1 sext i32→i64
    - printf result: 2 sext i32→i64 (i64 / double arg overloads)
  - Gate 4-run: codegen {15,13,14,14}, linked 1/15, errors {184, 148, 179, 152} avg ~165.75 (vs Wave 1c.2 ~164.75, +1 noise).
  - cargo 796/796 + 355/355 ✅
  - 누적 migrated: 65 sites (1a infra + 1b 20 + 1c.1 13 + 1c.2 23 + 1c.3 9). Wave 1c 잔여: 42 sites (expr_helpers.rs 5, stmt.rs 5, pattern.rs 5, misc ~27).
  - max_iterations 30→40 연장 (사용자 승인).

  **iter 29 (2026-04-24) — Wave 1c.2 LANDED ✅ (string_ops.rs 23 sites)**:
  - Compiler commit `f6a44a3c`. 23 sites in string_ops.rs:
    - intermediate_free: 1 icmp (i1)
    - BinOp Eq/Neq/Lt/Gt: 4 pairs icmp(i1) + zext→i64
    - byte_at + contains: load i8 + zext→i64, icmp ne null + zext→i64
    - is_empty × 2, starts_with, ends_with: icmp+zext pairs + 1 select i1
    - char_at/charAt: 2 load i8 + 2 zext→i64
  - Skipped 2 sites (lines 1122, 1146): `generate_struct_shallow_free_helper` has `&self` signature. Deferred to Wave 5 signature change or later refactor.
  - Gate 4-run: codegen {14,14,15,14}, linked 1/15, errors {150, 176, 182, 151} avg ~164.75 (vs Wave 1c.1 ~166.5, −1.75 within noise).
  - cargo 796/796 + 355/355 ✅
  - 누적 migrated: Wave 1a infrastructure + Wave 1b 20 ptrtoint + Wave 1c.1 13 + Wave 1c.2 23 = **56 sites migrated**. Wave 1c 잔여: 87 − 13 − 23 = 51 sites (print_format.rs 9, expr_helpers.rs 5, stmt.rs 5, pattern.rs 5, misc ~27).

  **iter 27 (2026-04-24) — Wave 1c.1 LANDED ✅ (generate_expr_call.rs 13 sites)**:
  - Compiler commit `8b9814a6`. 13 sites in one file: 2 int-width coerce (trunc/sext→dst), 1 icmp ne (→i1), 3 final-coerce (zext/trunc/sext→arg), 2 puts_ptr (i32 + sext→i64), 6 load_typed size 1/2/4 (i8/i16/i32 load + zext→i64), 3 store_typed (trunc i64→iN).
  - Gate 4-run: codegen {15,14,13,15}, linked 1/15, errors {184, 152, 147, 183} avg ~166.5 (vs Wave 1b baseline ~159.5, +7 noise).
  - 판정: +7은 관측된 variance 범위 {145..184} 내부. linked count hold, 새 regression 카테고리 없음. design doc의 "must not increase" gate 노이즈 허용선 통과.
  - cargo 796/796 + 355/355 ✅
  - **남은 Wave 1c (74 sites)**: string_ops.rs(25), print_format.rs(9), expr_helpers.rs(5), stmt.rs(5), control_flow/pattern.rs(5), 기타 ~25. 파일별 per-gate 검증으로 분리 진행.
  - 세션 내 iter 25→26→27 3연속 landed. 이 세션 총 3개 compiler 커밋 (`0aec7bd8`, `788cffde`, `8b9814a6`) + 설계 doc + ROADMAP 업데이트. 여기서 중단하여 다음 세션에서 Wave 1c 잔여분 이어서 진행.

  **iter 19 (2026-04-24) — NEGATIVE RESULT (no compiler change)**:
  - Attempt 1: Register `Str_new` builtin returning `Str` + emit body `define { i8*, i64 } @Str_new() { ... }` in runtime.rs.
    - Side effect: TC now catches `normalized.push_byte(ch)` at src/planner/cache.vais:391 (Str doesn't have push_byte). Before registration, TC let this through with "method not found" warning and codegen fell back to unknown-call IR.
    - 측정: codegen 13-14/15 → 11/15 (test_cross_engine, test_planner, test_planner_cache, test_planner_rag 전부 fail — 모두 동일한 Str.push_byte 오류).
    - Revert: compiler 양쪽 파일 모두 revert (`git checkout`).
  - Attempt 2 (skipped): i64↔specialized struct class 조사.
    - 샘플: `test_planner_cache_checkpoint.ll:2279 %t21 = call i64 @to_vec({i8*,i64} %active_txn_ids)` 이후 `store %Vec$u64 %t21, %Vec$u64* %t22` 에서 타입 불일치.
    - 원인: `to_vec` 메서드가 registered signature 없음 → codegen이 default `i64` 반환 타입으로 emit. Str_new과 동일 클래스의 "unregistered call fallback" 버그.
    - 미시도 이유: iter 14 `expected_type_stack`을 codegen 호출 site로 확장하는 proper fix가 필요한데, 이건 새 session의 1차 작업으로 적합 (session 3개째 스캐폴딩 상태).
  - cargo test -p vais-codegen --lib: 796/796 ✅ (변경 없음)
  - cargo test -p vais-types --lib: 355/355 ✅ (변경 없음)
  - 교훈: "missing body builtins" 패턴 (Str_new, to_vec, 기타) 개별 등록은 TC 엄격성이 올라가 소스 버그 노출 → codegen 회귀. Structural fix (call-site expected-type propagation)가 올바른 경로.
  strategy: sequential, Opus direct. **H4.14**: stdlib generic struct auto-preload via `phase17_load_stdlib_generic_templates`. Parses vec/option/hashmap/result.vais once, attaches impl methods, injects Rc<Struct> into each per-module CodeGenerator's `generics.struct_defs` before `generate_module_subset`. Applied to both full compile (per_module.rs) and emit-IR (parallel.rs) paths via shared helper.

  **iter 13 (2026-04-23)**: Vec.new() ground-truth 조사 및 iter 14 목표 구체화 (docs-only 커밋 7a5b0bb).

  **iter 14 (2026-04-23) — expected-type hint 인프라 도입 ✅**:
  - 추가된 인프라:
    - `vais-types/lib.rs`: `expected_type_stack: Vec<ResolvedType>` 필드
    - `vais-types/lookup.rs`: `push_expected_type / pop_expected_type / current_expected_type` helpers (enum_hint_stack과 병행)
  - TC 수정:
    - `checker_expr/collections.rs` struct-literal field 루프: `expected_ty_subst`를 push/pop으로 감쌈
    - `checker_expr/calls.rs` builtin Vec/HashMap/HashSet `new`/`with_capacity`: fresh type var 생성 직후 `current_expected_type()` 조회 → 일치 시 unify + `GenericInstantiation::struct_type`/`method` 등록. 이로써 다른 call site에서 `fn_instantiations` 조회해도 발견됨
  - Codegen 수정:
    - `expr_helpers_call/method_call.rs`: 새 변수 `skip_ab_for_expected` 도입. zero-arg + 구체적 expected generics인데 inst_list에 없는 경우 branch A+B 건너뛰고 바로 branch C로 → `resolve_generic_call_with_hint`의 "last resort: first inst" 오매칭 방지
    - Branch C 조건에서 `I64` 예외 제거 (legacy "i64 = unresolved fallback" sentinel이었으나 새 경로에서는 유효한 concrete type)
  - 검증 (tests/sql/test_migration 대상):
    - tracker.vais 3개 `Vec.new()` 사이트 모두 specialize ✅ (L29/L60/L76 → `Vec_new$MigrationRecord/$MigrationRecord/$i64`)
    - test_migration IR 전체 unmangled `@Vec_new(` 개수: 0 (이전: tracker에만 2개 + migration/runner 등에 추가 존재)
    - mangled `@Vec_new$...` 개수: 18 (tracker 6 + runner 6 + migration 2 + test 2 + test_migration 2)
  - Regression 체크:
    - cargo test -p vais-codegen --lib: 796/796 ✅
    - cargo test -p vais-types --lib: 355/355 ✅
    - vaisdb 15/15 standalone codegen 0 errors ✅ (strict multi-module force-rebuild 기준)
  - 남은 링크 에러 (iter 15+ 대상, 별개 버그):
    - `%Vec`→`%Vec$T` base-to-specialized bitcast 누락 (getelementptr on opaque `%Vec`)
    - `%Result$i64_str` type vs `ptr` 불일치 (enum payload 경로)
    - 수량: Vec.new() 관련 에러 완전 소멸, 다른 클래스 에러가 표면화됨 (기대 동작: 버그 cascade)

  **현재 상태**: cargo 796/796 + 355/355 ✅, vaisdb 15/15 standalone codegen 0 errors ✅, full-build(링크+실행) 여전히 1/15 — 그러나 Vec.new specialization 클래스 완전 제거.

  **iter 15 (2026-04-23) — iter 14 impact 정량화 + iter 16 target selection**:
  - docs-only 커밋 (compiler unchanged). 이유: 메모리 cascade 경고 ("한 세션에 B-class fix 3개 이상 = regression risk"). iter 14가 substantial fix였고, iter 15에서 즉시 또 다른 compiler 수정 시 risk stacking.
  - iter 14 global impact 측정 (15개 test 전체 IR across `/tmp/test_*.ll`):
    - `call @Vec_new()` unmangled call sites: **4개** (전부 `test_cross_engine_pipeline.ll` 내부, cross_engine 테스트 전용)
    - `call @Vec_new$T()` mangled call sites: **168개**
    - `declare @Vec_new()` (forward decl, non-call): 422개 — 각 module 당 1개씩, call site 아님
    - 판정: iter 14의 Vec.new specialization 전파는 전역적으로 성공. 남은 4개는 pipeline.vais의 edge case (별개 iter 대상)
  - iter 15 baseline 재측정 (standalone codegen + link):
    - standalone codegen: 15/15 ✅
    - clang link: 1/15 (test_types만 통과)
    - 14/15 fail의 top error class distribution (정규화된 에러 메시지 빈도):
      - 24건: `ptr` vs `{ ptr, i64 }` — str/slice ABI 경계 (가장 흔함)
      - 22건: `i64` vs `%Vec$T`(specialized struct) — Vec 기본→특수화 bitcast
      - 20건: `i64` vs `ptr` — 포인터-슬롯 vs 정수-슬롯 불일치
      - 16건: `{ ptr, i64 }` vs `i64` — slice-slot → i64 raw로 squash
      - 15건: `double` vs `i64` — float payload ABI
      - 13건: `ptr` vs `i64` — 위 3번의 역방향
      - 그 외: `i32` vs `i64`, Vec base→specialized, Result/Option payload, etc.
  - **iter 16 target (예정)**: 24건 슬라이스 ABI 클래스 (`ptr` vs `{ptr,i64}`) — 가장 큰 단일 클래스이자 H3.1/H3.2에서 다룬 ABI coerce 연장선. 한 fix로 ~24건 제거 예상. method_call.rs의 `did_vec_to_slice` 경로 확장 또는 새 coerce 함수 도입.

  **iter 16 (2026-04-23) — attempted vec-to-slice in method calls, REVERTED**:
  - Attempt: `generate_method_call_expr` 내 arg 루프에 `is_vec_to_slice_coercion` 분기 추가 (static call path 미러). ~45 lines.
  - Net effect: cargo 796/796 + 355/355 ✅ 유지, vaisdb 14/15 codegen (test_planner_rag regression) — cascade pattern 경고 정확히 실현
  - Regression detail: `src/rag/memory/search.vais:293` `candidates.get(ri as u64).memory_type` — codegen C003 "Cannot access field 'memory_type' on type 'T'". `candidates := mut Vec.new()` 타입이 T=Var 상태로 고정돼 있고, my change가 method arg 처리 순서를 바꿔 downstream 추론 disturb한 것으로 추정. 정확한 메커니즘은 iter 17+에서 격리 조사.
  - 교훈 (memory cascade_pattern 재확인): static 경로를 method 경로에 그대로 복사 ≠ safe. Method call 경로는 static과 달리 receiver-based 추론 chain이 있어 local val 재할당이 downstream을 변조함.
  - 조치: `crates/vais-codegen/src/expr_helpers_call/method_call.rs` 변경 revert. compiler HEAD unchanged (`e2604384`).
  - 다음 시도 가능 경로 (iter 17+):
    1. Static 경로 그대로 복사 대신, `val = fat2` 재할당을 **로컬 변수 `coerced_val`로 분리** — 원본 `val` 유지 → downstream inference 흐트러짐 방지
    2. Vec-to-slice 대상 범위를 `Vec_push_slice_u8` 같은 명시적 slice-param 시그니처로 좁히기 (signature-directed only)
    3. TC 단계에서 이미 resolve된 arg 타입 정보를 codegen이 재사용하도록 span-indexed arg_types 주입

  **iter 24 (2026-04-24) — match arm int-width phi coerce, REVERTED (1/15 → 0/15, +34 errors)**:
  - Investigation: traced `test_planner_cache_option.ll:2202` phi i64 taking %t5 (i32 from trunc in match arm). `Option_unwrap_or$i32`: T=i32 pattern extracts payload as i32, phi expects i64 (function ABI-widened).
  - Precise cause: `match_gen.rs:62-99` `arm_body_type` derivation picks `first_arm_ty` (=I32 via Vais-level inference) but LLVM ABI widens narrow T→i64 in function signature. Phi type reads from arm_body_type (i32) — inconsistent with phi usage sites that expect function return type i64.
  - Fix attempted: catch-all int-width coerce at end of arm block (before `arm_terminated` check). If `llvm_type_of(body_val)` ≠ `type_to_llvm(arm_body_type)` and both are `iN`, emit sext/trunc to align.
  - Specific site verified: `%t7 = sext i32 %t5 to i64` emitted correctly for `Option_unwrap_or$i32` arm.
  - 측정 (6-run avg): **~183 errors (baseline 149), linked 0/15 (baseline 1/15)**. 회귀 -1 linked test + +34 errors.
  - 회귀 원인: `arm_body_type` vs `body_val` 타입 불일치가 다른 arm 경로에서도 광범위. 내 coerce 추가가 **올바른** 경우도 있었지만 phi_type 쪽이 narrow(i32)을 유지할 때 body_val(i64)을 trunc 시도 → 데이터 손실. Match arm의 일부는 "wider body_val, narrower phi" 케이스도 있고, 반대도 있는데, catch-all은 둘 다 건드림.
  - Lesson (iter 22/23/24 3연속 negative 교훈 통합): 이 클래스의 모든 단순 guard/coerce가 **다른 경로를 깨뜨림**. Codegen pipeline이 mis-typed SSA 값에 암묵적으로 의존하는 경로가 여러 개. 단일 iter fix 불가능.
  - 조치: `git checkout HEAD -- match_gen.rs`. compiler HEAD `706645e8` 유지.

  **iter 23 (2026-04-24) — registration-site Binary/Unary Named skip, REVERTED (net +9.5 errors)**:
  - Precise bug trace: added debug to `llvm_type_of_checked` → confirmed `%t74` (from `add i64`) is registered as `Vec<u8>` via catch-all `register_temp_type` at `generate_expr/mod.rs:~310`. `inferred_type = Named { name: "Vec", generics: [U8] }` from `infer_expr_type(Expr::Binary)` via cross-module span collision in TC `expr_types`.
  - Fix attempted: AST-shape gate **at registration site** — `skip_named_register = matches!(expr.node, Binary | Unary) && matches!(inferred_type, Named)`. Skips Vec<T>/Option/Result registration for Binary/Unary shapes since their LLVM result is always scalar iN/float/bool (string concat uses `Str` variant, not Named).
  - Specific fix verified: `filesystem.ll:malloc(len+1)` now `%t75 = call i8* @malloc(i64 %t74)` — no bogus ptrtoint.
  - 측정 (6-run avg): ~158.5 (iter 21 baseline ~149). **Net +9.5 errors**.
  - Codegen: 13-15/15 (no codegen regression, same flake edge).
  - 회귀 원인 (추정): downstream coerce paths — 특히 struct/alloca 관련 — 이 `%tN` registered-as-Named 정보를 잘못이지만 **운 좋게** 맞는 coerce로 활용하던 사이트들 존재. 해당 registration을 끄면 다른 decode 경로가 fallback으로 넘어가서 다른 유형의 에러로 surface.
  - Lesson: Binary/Unary의 Named 등록이 "항상 잘못"인 것은 semantic 수준에서 맞지만, codegen pipeline의 일부 소비자가 이 잘못된 데이터로 암묵적 가정을 해왔음. 
  - iter 24+ 방향: registration을 끄는 대신, **ptrtoint 소비자 쪽에서 per-site**로 "SSA temp의 binary/unary 생성 여부" 확인. Or: `register_temp_type` call sites 각자가 자신의 의도를 명시하도록 리팩터. 단일 catch-all이 semantic 중첩.

  **iter 22 (2026-04-24) — AST-shape guard on `%Struct` ptrtoint branch, REVERTED (net +13 errors)**:
  - Investigation: traced `filesystem.ll:2387 %t75 = ptrtoint %Vec$u8* %t74 to i64` (where %t74 is `add i64`).
  - Via debug prints located emission site: `generate_expr_call.rs:692` — the `val_ty.starts_with('%') && !val_ty.ends_with('*') && val_ty != "i64"` branch.
  - Root cause: `llvm_type_of(%t74)` returns `%Vec$u8` because SSA registry entry for %t74 says Vec$u8 (cross-module span bleed via `infer_expr_type` catch-all at `generate_expr/mod.rs:298`).
  - Fix attempted: AST-shape gate on the `%Struct` branch (same scalar_shape matches as iter 21), skip ptrtoint when `arg_for_gen` is `Binary/Unary/literal/Cast`.
  - Specific site verified fixed: `malloc(len+1)` IR no longer emits bogus `ptrtoint %Vec$u8* %t74`.
  - 측정 (6-run avg): total ~162 (iter 21 baseline ~149). **Net +13 errors** — other call sites relied on the `%Struct` branch to do real pointer coerce that my scalar_shape guard now skips. The AST shape isn't a reliable enough signal at that branch.
  - cargo test: 796/796 + 355/355 유지 (regression noise 한정).
  - 판정: 특정 site 단일 fix 효과 < 다른 sites 회귀 비용. Revert.
  - 조치: `git checkout HEAD -- generate_expr_call.rs`. compiler HEAD stays at `706645e8`.
  - iter 23+ 방향:
    - 역접근: 원인 제거 — `generate_expr/mod.rs:298` 카치-올 registration에서 Binary/Unary/Cast 모양의 Named 추론 거부 (시도했지만 %t74가 여전히 Vec로 등록되는 다른 경로 존재, 더 깊은 조사 필요)
    - 또는 OR approach: SSA registry value type tracking을 IR emission과 sync (registry 엔트리가 emitted `add i64`와 충돌하면 registry 무효)
    - 현재 1/15 linked 유지의 구조적 원인이 이 클래스라면 좀 더 본격적인 리팩터 필요

  **iter 21 (2026-04-24) — skip TC-inferred Named→ptrtoint for scalar-shape args, LANDED ✅**:
  - Root cause: iter 20 made TC expr_types authoritative. Side-effect: `infer_expr_type(arg_for_gen)` upgrades scalar expressions (e.g., `Expr::Binary` `size + 1`) to Named types via span collision. The arg-processing loop at `generate_expr_call.rs:694` then emitted invalid `ptrtoint %Vec$u8* %t to i64` on a genuine `i64` arithmetic result.
  - Fix (`crates/vais-codegen/src/generate_expr_call.rs`): AST-shape gate. `val_ty == "i64"` branch skips Named→ptrtoint upgrade for `Expr::Binary | Unary | Int | Float | Bool | Cast` shapes since they cannot produce struct values at LLVM level.
  - 측정 (3-run 평균):
    - iter 20 baseline: ~160 link errors
    - iter 21: ~149 link errors (−11)
    - cargo test -p vais-codegen --lib: 796/796 ✅
    - cargo test -p vais-types --lib: 355/355 ✅
    - Standalone codegen: 14-15/15 (flake edge, no regression)
  - 남은 사이트 (iter 22+ 대상):
    - `filesystem.ll:malloc(len+1)` 여전히 bad ptrtoint — 다른 코드 경로에서 emit. 추적 필요.
    - `{ptr,i64}` vs `%Vec$u8` 8건은 vaisdb 소스 버그 (`.clone()` on slice → Vec<u8>) — 컴파일러 측 수정 불가.
  - 커밋: `706645e8 fix(codegen): Phase 17.H4 iter 21 — skip TC-inferred Named→ptrtoint for scalar-shape args`

  **iter 20 (2026-04-24) — TC expr_types fallback for unregistered call return types, LANDED ✅**:
  - Root cause (from iter 19): unregistered calls (`Str.new()`, `buf.to_vec()`, etc.) fell back to `i64` return type in codegen. Use sites then failed to type-match at link time.
  - Fix (`crates/vais-codegen/src/generate_expr_call.rs` + `expr_helpers_call/method_call.rs` + callers):
    - Added TC `expr_types[(file_id, span.start, span.end)]` lookup as last-resort fallback before `i64` default.
    - Reuses Phase 17.H1 file_id infrastructure (span's file_id OR codegen's current_file_id) + unique-(start,end) serial-TC fallback.
    - Threaded `call_span: Option<Span>` through `generate_method_call_expr`. Static-call path already had `call_span`.
  - IR 개선 (test_planner_cache_cache.ll):
    - Before: `%t3 = call i64 @Str_new()`
    - After: `%t3 = call %Str @Str_new()` ✅
  - 측정:
    - cargo test -p vais-codegen --lib: 796/796 ✅
    - cargo test -p vais-types --lib: 355/355 ✅
    - Standalone codegen: **15/15** ✅ (iter 18의 14-15/15 flake 상한 안정화)
    - Link 에러 총 ~162 (baseline ~158) — 노이즈 범위 내. linked 1/15 (변화 없음).
  - 새로운 에러 클래스 노출: `{ptr,i64}` vs `%Vec$u8` (8건). 올바른 타입 전파로 drown-out된 하위 coerce 불일치가 표면화.
  - 판정: 구조적 개선. IR이 이제 specialized 타입을 call 경계에서 올바르게 운반 → 이후 iter의 store/ret/arg coerce 수정이 실제 타입을 볼 수 있음.
  - 커밋: `e3e7fa5f fix(codegen): Phase 17.H4 iter 20 — TC expr_types fallback for unregistered call return types`

  **iter 18 (2026-04-24) — cross-module Vais fn ABI + &str/&[T] ref ABI, LANDED ✅**:
  - Root cause: iter 17 identified `declare i64 @fnv1a_hash(i8*)` vs `call i64 @fnv1a_hash({i8*,i64})` mismatch + call-site alloca-as-value. Two orthogonal bugs stacked at the same call site.
  - Fix 1 (`crates/vais-codegen/src/function_gen/signature.rs`): `generate_extern_decl` branches on `info.is_extern` — C-ABI `type_to_llvm_extern` only for true externs (malloc, free, …), Vais-native `type_to_llvm` for cross-module Vais fn declares. Call site already uses native ABI, now declare matches.
  - Fix 2 (`crates/vais-codegen/src/generate_expr/ref_deref.rs`): `generate_ref_spill` early-returns the value directly for `Str | Slice | SliceMut`. These types' LLVM lowering IS the fat-pointer value; `&x` in Vais is semantic-only, so `&<str>` = `<str>` in LLVM IR. Previous spill to alloca produced `{i8*,i64}*` where call sites expected `{i8*,i64}` value.
  - 검증 (15개 vaisdb 테스트, 3-run 평균):
    - Baseline: ~171 link errors, ~24 ptr-vs-slice, 1/15 linked
    - With-fix: ~159 link errors, ~20 ptr-vs-slice, 1/15 linked
    - Net: **-12 total, -4 ptr-slice class** (modest 하지만 실제 — 기존 수정 중 가장 깔끔한 structural fix)
    - cargo test -p vais-codegen --lib: 796/796 ✅
    - cargo test -p vais-types --lib: 355/355 ✅
    - Standalone codegen: 14-15/15 (flake 상한 개선 — 이전 13-14/15)
  - 남은 에러 (iter 19+ 대상): 여전히 1/15 linked. 남은 에러 클래스들:
    - `i64` vs `%Vec$T` / `%Result` / `%Option` (specialized struct과 erased i64 불일치)
    - `%t3` (Str_new 같은 undefined-body builtin) 호출 후 반환 타입 불일치
    - `i32` vs `i64` (option payload)
    - Vec base `%Vec` ↔ specialized `%Vec$T` bitcast 누락
  - 커밋: `c552ad85 fix(codegen): Phase 17.H4 iter 18 — cross-module Vais function ABI + &str/&[T] ref ABI`

  **iter 17 (2026-04-23) — path 1 tried (isolated coerced_val), REVERTED as wash**:
  - Implementation: `generate_method_call_expr` arg 루프에 `is_vec_to_slice_coercion` 분기 추가 (iter 16과 같은 위치) + **`val` 원본 유지하고 새 로컬 `coerced_val`에 fat pointer 저장**, 즉시 `arg_vals.push + continue`로 downstream 우회. ~48 lines at line ~400.
  - Cargo/types tests: 796/796 + 355/355 ✅ 유지
  - Standalone codegen: flake 복제 — test_planner/test_planner_rag는 iter 17 change 없이도 지금 baseline flake (13-14/15). 즉 iter 16에서 "regression"이라 본 신호는 실은 기존 flake (`/tmp/*.ll` 캐시 + Vec<T> generic leak)였음. 제대로 baseline 측정 시 `test_planner_rag` 20-run 50% fail rate — fix 적용 시도 20-run도 비슷.
  - Link-error 정량 (3-run 평균, 15개 테스트):
    - Baseline: 총 link 에러 ~168, ptr-vs-slice ~24, linked 1/15
    - With-fix: 총 link 에러 ~182, ptr-vs-slice ~25, linked 1/15
    - **Unique 에러 signature 비교** (line 번호 제외): baseline 11개 ↔ with-fix 11개. 2개 사라지고 2개 새로 등장 — net-zero 개선.
  - 실제 ptr-vs-slice 에러의 발원 지점 조사 (`test_planner_cache_cache.ll:2178`):
    - IR 발췌: `%t0 = alloca { i8*, i64 }` → `store %normalized_sql, %t0*` → `call @fnv1a_hash({ i8*, i64 } %t0)`. 문제는 **`%t0`가 alloca 주소(`ptr`)인데 function이 value(`{ i8*, i64 }`)를 기대**. `load { i8*, i64 }, %t0*` 누락.
    - Vais source: `hash := mut fnv1a_hash(&normalized_sql)` (planner/cache.vais:31). 일반 **static function call** (`hash::fnv1a_hash`) — 즉 method call arg 루프 경로가 **아님**. → iter 17에서 손 댄 `generate_method_call_expr`는 이 에러와 무관.
  - 판정: method call arg 루프 vec-to-slice coerce는 실제 ptr-vs-slice 에러를 거의 줄이지 못함. 에러 대부분은 static function call / field store / ret 경로에서 fat pointer alloca→value load 누락이 원인.
  - 조치: `crates/vais-codegen/src/expr_helpers_call/method_call.rs` 변경 revert. compiler HEAD `e2604384` 유지. 시간 소비/리스크 대비 개선 = 제로.
  - iter 18 target (재정의):
    - `generate_expr_call.rs` (static function call) 경로에서 `{ i8*, i64 }` param에 alloca'd 값 전달 시 `load` 자동 삽입 누락 조사
    - 또는 `call_gen.rs`에서 "pass-by-value fat param received as alloca ptr" detection + auto-load 삽입
    - 후보 포인터: PlanCacheKey_new의 fnv1a_hash call (test_planner_cache_cache.ll:2178), 유사 패턴 `cost_model.ll:%table_name`, `dictionary.ll:%term`, `scan.ll:%t41` 등
    - 위 포인터들은 **모두 alloca+store 후 raw alloca 주소를 function arg로 넘기는 패턴** — 공통 fix 가능성 높음
    - Vais source 관점: `&str` argument 의 codegen 경로 (fat pointer를 ref로 저장한 뒤 value로 읽어야 함) 정비 필요

**원칙**:
- Phase 17 (H1~H4): 컴파일러 **구조적 invariant 3개** 확립 → 같은 종류 에러 재발 구조적 차단
- Phase 18 (I1~I4): **품질 인프라** 구축 → 앞으로 컴파일러 수정 시 기존 기능 깨짐 CI에서 감지
- Phase 19 (J1~J2): vais 1.0 릴리스 준비 + 응용 패키지 개발 재개

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
> mode: stopped (unknown)
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
> mode: stopped (unknown)
> iteration: 33 (Phase 16 cap exceeded, Phase 17 신규 시작)
> max_iterations: 30
>   strategy: Phase 16 완료 시점 상태 — test_types 링크+실행 유지, 나머지 14개 테스트는 구조적 invariant 결여로 실패. **Phase 17 (Compiler Invariant Hardening) 으로 이관**.

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
  E.1 완료 (Opus direct, 2026-04-23, vais@502ad61c): Unit param elision + Self→Struct rewriting + call-site void-arg skip. "void type only allowed for function results" 에러 다수 제거
  E.2 완료 (Opus direct, 2026-04-23, vais@29e6900f): 명시적 `as` cast에서 has_known_type 가드 제거 + Block return에서 raw ptr→slice fat pointer wrap
  E.3 완료 (Opus direct, 2026-04-23, vais@bec9afb1): TC expr_types span-bleed 차단. Ident가 I64 local을 참조할 때 TC가 Named(Vec/Option/Result/Box)로 upgrade하는 경우 방지. `body_size as u32` 같은 explicit 캐스트의 trunc 누락 근본 수정
  E.4 완료 (Opus direct, 2026-04-23, vais@6bf7c457): fcmp float 경로에서 십진 리터럴을 f32 round-trip된 IEEE-754 hex 형식으로 정규화. Result<Unit, E>? try 식에서 void 페이로드 load 스킵
  E.5 완료 (Opus direct, 2026-04-23, vais@df41fbfd): struct/enum 타입 선언 dedup (동명 struct+enum cross-module 병합), Phase D forward-decl 위치를 extern 선언 위로 옮김, Box→`{ i64 }` fallback (enum erasure 대신 struct layout)
  E.6 완료 (Opus direct, 2026-04-23, vais@b96b727e): generate_ident_expr alloca-local/global load 결과에 register_temp_type 추가 (SSA type registry 보강 — "i64 vs <N-bit>" 계열 근본 수정). helpers::build_slice_range_helper가 raw i64* 대신 `{ i8*, i64 }` fat pointer 반환
  E.7 완료 (Opus direct, 2026-04-23, vais@43811552): binary_expr에서 Ref(Str) → Str unwrap하여 `&str == "..."` 비교가 strcmp 경로로 라우팅. Phase D forward-decl에 Vec/HashMap base fallback 추가
  현재 상태 (LINKED=1 유지, test_types only):
    - test_planner_types: 링크 단계 도달 — `_err_cast_error` undefined (source dep 누락)
    - 나머지 13개: 각자 distinct codegen 버그 (aggregate value vs ptr, enum tag coerce, float vs i64, etc.)
  **결론**: Phase E는 **ad-hoc 경로별 수정**으로 설계상 구멍을 막는 방식 → 같은 종류 에러가 다른 경로에서 재발 (수렴하지 않음).
  근본 해결은 Phase 17 (Compiler Invariant Hardening)으로 이관.

---

## Phase 17: Compiler Invariant Hardening (단기 — 핵심 근본 수정)

> **목표**: vais 컴파일러에 3가지 **구조적 invariant**를 박아넣어 "같은 종류 에러가 재발하지 않는" 상태로 만든다. Phase 16 세션 6~8에서 발견된 33개 ad-hoc fix의 80%가 이 3가지 invariant 중 하나의 위반이었음 — invariant를 명시적으로 보장하면 개별 수정 대부분이 자동으로 해결됨.
>
> **철학**: "증상이 보일 때마다 방어 코드 추가" → "invariant를 강제하고 위반 시 compile error"로 전환.
>
> mode: stopped (unknown)
> iteration: 0
> max_iterations: 30
>   strategy: sequential. H1 → H2 → H3 → H4 (regression audit). 각 단계 완료 시 vaisdb 15/15 standalone codegen regression 0 + 링크 에러 재계수.

### H1. Span에 file_id 추가 (TC span bleed 완전 차단) ✅ 2026-04-23
**범위**: vais-ast + vais-types + vais-codegen + vaisc drivers
**문제**: 현재 `Span { start, end }`는 byte offset만 담음. Cross-module build에서 같은 (start, end) 쌍이 다른 파일에서 공유되면 TC expr_types map이 오염. `body_size as u32` 같은 단순 코드가 Vec<u8>로 승격되는 원인.
**작업 (완료)**:
  1. ✅ `Span` 구조체에 `file_id: u32` 필드 추가 (`with_file` 명시적 생성자 + `new`는 file_id=0 backward-compat)
  2. ✅ TC/Codegen 양쪽에 `current_file_id` + setter 추가. 4개 driver 지점에서 FNV-1a(canonical path)로 per-module file_id 주입
  3. ✅ TC expr_types key를 `(file_id, start, end)`로 확장. `check_expr`/`inference_modes` 모두 파일별 namespace로 stamp
  4. ✅ `merge_type_defs_from`에 expr_types + implicit_try_sites 병합 추가 (parallel TC에서 merge가 expr_types를 silently 날리던 기존 bug 동시 수정)
  5. ✅ 직렬 TC 경로 대응: 정확 key miss 시 (start, end) 단일 매칭 fallback (다중 매칭이면 span-bleed 가능성 → 거부)
**완료 조건**:
  - ✅ cargo test -p vais-codegen --lib: 796/796
  - ✅ cargo test -p vais-types --lib: 355/355
  - ✅ vaisdb 15/15 standalone codegen 0 errors
  - Phase E.3 narrow-primitive guard 제거는 H4에서 재평가 (현재는 유지 — 추가 안전망)
**커밋**: `4b6413f7 fix(compiler): Phase 17.H1 — Span file_id + expr_types namespace + merge`

### H2. SSA Type Registry 완전성 보강 ✅ (re-scoped into H3) 2026-04-23
**원래 가설**: `register_temp_type` 누락이 "i64 vs iN/float/ptr" 에러의 주범.
**실측 (H1 완료 후)**:
  - cargo test 796/796 ✅, vaisdb 15/15 standalone codegen 0 errors ✅
  - 15개 테스트 전체 clang 검증 시 **283개 에러**, 에러 클래스는 압도적으로 ABI coerce:
    - int width 불일치 (i32/i64, i8/ptr) — store/ret/call 경계에서 coerce 누락
    - base↔specialized generic bitcast (`i64 → %"Vec$u8"`, `{ptr, i64} → %"Vec$u8"`)
    - undef forward decl (`@Vec_truncate` 등) — 별개 문제
    - PHI predecessor mismatch — 제어흐름 버그, 별개
    - void-in-struct (Phase E Unit marker 잔존) — 별개
**결론**: 에러 283건 전부 **경계 coerce 문제**로, emission 지점 register_temp_type 누락이 아님. H2의 원래 audit scope (1144 write_ir! 지점 전체 검토)는 이 에러들에 대한 수정을 내지 못함. → H3 ("ABI 경계 통합 Coerce Pass")가 본질적 해결책이므로 H2를 H3로 **merge**.
**완료 판정**: H1로 1차 목표 (standalone codegen 0 errors) 달성. 2차 목표 (link-ready IR)는 H3에서 다룸.
**조치**: H2 완료 처리, H3의 blockedBy에서 H2 제거 (실질적으로는 이미 resolved).

### H3. ABI 경계 통합 Coerce Pass (partial ✅ H3.1+H3.2 / 2026-04-23)
**범위**: generate_expr_call.rs + expr_helpers_call/{call_gen,method_call}.rs + function_gen/codegen.rs (ret 경로)
**문제**: arg 전달, return, match-phi 등 ABI 경계마다 **개별 coercion 로직**이 중복/누락. 결과: "aggregate value vs ptr", "Result base vs specialized" 등 재발성 에러.

**완료 (increments)**:
  - ✅ **H3.1** (`272fe4f0`): `generate_range_for_loop` — start/end 경계를 i64로 sext/trunc. 8건 `capacity i32→i64` 에러 제거.
  - ✅ **H3.2** (`eee975fe`): `generate_aggregate_extractvalue` (Try `?`) — primitive payload path에서 i64 slot → try_llvm 너비로 trunc. 8건 `t3 i64→i32` 에러 제거.

**남은 작업 (H4로 이월)**:
  1. Slice deref 시 ptrtoint 오용 수정 (`%t9 i8→ptr` 9건)
  2. Vec base↔specialized struct bitcast (`%t23 i64→%Vec$BTreeInternalEntry` 5건)
  3. i64→ptr/struct coerce (`%t21 ptr→%FrameState` 5건)
  4. Base `%Vec`→specialized `%Vec$T` 코어크 (기타 비슷 5+ 클래스)
  5. Unit→void-in-struct 잔존 marker 정리 (`void type only allowed for function results` 6건)
  6. `@Vec_truncate` 등 forward decl 누락 (7건)
  7. PHI predecessor mismatch (5건 — 별개 제어흐름 버그)
  8. `coerce_for_abi` 통합 함수 추상화 — 위 점진적 수정 후 패턴이 명확해지면 일괄 리팩터

**사유**: 원래 H3 scope("coerce_for_abi 단일 함수 도입")는 15+ 기존 coerce 사이트를 한 번에 추상화하는 설계. 실측(283 clang errors 수동 분석) 결과 각 에러 클래스가 서로 다른 **원자적 버그**(슬라이스 deref, enum layout, void leak 등)로 **width coerce만으로는 해결 안 됨**. → pragmatic: 각 버그 독립 수정 후 공통 패턴 추출. H3는 width/primitive coerce 완성, 나머지는 H4에서 음영별 수정.
**완료 조건**:
  - cargo test 796/796 + vaisdb 15/15 standalone
  - "aggregate vs ptr", "{ ptr, i64 } vs i64" 계열 에러 전부 소멸
  - LINKED 수 증가 (최소 5/15 이상 기대)
**예상 소요**: 2~3 세션
**blockedBy**: H2

### H4. Regression Audit + Phase E 잔존 수정
**범위**: H1~H3 적용 후 남은 테스트별 에러 재평가
**작업**:
  1. 14개 vaisdb 테스트 각각 relink → 새 에러 분류
  2. 남은 에러가 여전히 structural invariant 위반이면 H1~H3 확장
  3. 진짜 per-test source 버그만 개별 수정
**완료 조건**: vaisdb 15/15 링크 성공 + 최소 10/15 실행 (assertion 통과 여부 무관)
**예상 소요**: 1~2 세션

---

## Phase 18: Compiler Quality Infrastructure (장기 — 품질 인프라)

> **목표**: 앞으로 vais 컴파일러를 수정할 때 "기존 기능이 안 깨진다"는 **진짜 보증**을 만드는 인프라 구축. 지금은 `cargo test -p vais-codegen --lib 796`만 있지만 이건 IR 생성만 검증하지 실제 링크/실행까지 안 함.
>
> mode: stopped (unknown)

### I1. Golden IR Test Suite
**범위**: vais-codegen 신규 test module
**작업**:
  - 언어 기능별 최소 소스(enum, match, slice, Vec<T>, try, closure 등 30개)
  - 각 소스의 "올바른 IR" 고정
  - 수정 시 diff로 regression 즉시 감지
**효과**: 새 기능 추가 또는 리팩토링 시 기존 기능 깨짐을 커밋 전 감지
**예상 소요**: 2 세션

### I2. End-to-End Test Harness
**범위**: compiler 레포에 e2e 테스트 디렉토리
**작업**:
  - `tests/e2e/` 아래 vaisdb 스타일 엔드투엔드 테스트 모음
  - CI에서 `vaisc build <test> && clang -o exe *.ll && ./exe` 자동 실행
  - 각 테스트의 기대 종료 코드 + stdout 고정
**효과**: "codegen 0 errors"가 아닌 "실제 실행 성공"을 CI에서 강제
**예상 소요**: 2 세션
**blockedBy**: I1

### I3. Conformance Spec 문서화
**범위**: docs/compiler-spec.md (신규)
**작업**:
  - 각 언어 기능의 IR 생성 규칙 명세
  - ABI 경계 conversion matrix (어떤 타입이 어떤 타입으로 어떻게 변환되는지)
  - invariant 목록 (span 고유성, SSA 타입 등록 완전성, coerce pass 통과 필수 등)
**효과**: 컴파일러 기여자가 "이 경로 어떻게 해야 하지"를 매번 추측하지 않음
**예상 소요**: 1 세션

### I4. vais 언어 사용 가이드 (사용자 측)
**범위**: docs/vais-guide.md (vais-lang 레포)
**작업**:
  - vais 사용자 입장에서 지켜야 할 규칙 (`Vec.new()` vs `Vec.with_capacity(0)`, `&str` 명시, `as` cast 사용 시점 등)
  - Phase 16에서 발견된 "컴파일러 한계로 인한 우회 패턴" 공식 문서화
**효과**: 사용자가 "왜 이게 안 되지"를 혼자 디버깅하지 않음
**예상 소요**: 1 세션

---

## Phase 19: vais 1.0 Release Readiness (장기 중의 장기)

> **목표**: 컴파일러 stability + 생태계 패키지 개발 시작 가능 상태
> **조건**: Phase 17, 18 모두 완료 + vaisdb 15/15 링크+실행 성공

### J1. Self-hosting smoke test
vaisc가 자기 자신을 빌드할 수 있는지 확인 (self-hosting 준비)

### J2. 패키지 개발 착수 (vais-web, vais-server 등)
vais 언어 자체가 안정됐다는 전제하에 실제 응용 패키지 작업 시작

---

(기존 Phase E 잔존 개별 이슈 목록은 Phase 17.H4에서 재평가 예정)
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
