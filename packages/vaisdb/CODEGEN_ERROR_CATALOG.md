# VaisDB Codegen Error Catalog
> 2026-03-24 — codegen 타입 불일치 근본 원인 분석
> 2026-04-05 update — Phase 11 (Option/Result struct erasure 근본 수정) + Phase 184 (unambiguous keywords) 마이그레이션 후 대부분 해결

## 현재 상태 (2026-04-07)
- **9/9 테스트 모두 codegen 0 errors**: test_btree, test_wal, test_buffer_pool, test_graph, test_vector, test_cross_engine, test_transaction, test_planner, test_fulltext
- **StringMap cross-module 해결**: multi-module 빌드(VAIS_SINGLE_MODULE=1 없이)로 0 errors. 구 SINGLE_MODULE 모드는 deprecated → 사용 금지
- **test_planner 순환 참조**: 실제 순환 import 없음. multi-module 빌드로 0 errors 확인
- **핵심 개선**: Phase 184 키워드 마이그레이션(E/L→EN/EL/LF/LW)으로 test_transaction 1→0, test_planner 47→0
- ir_fix.py post-processing은 더 이상 필요 없음 (근본 codegen 수정됨)

## 구 상태 (2026-04-05)
- 9/9 테스트 중 8개 codegen 0 errors, 잔여 1건: test_fulltext (SINGLE_MODULE 모드에서만 발생하는 C001 Undefined variable `V`)

## 구 이력 (2026-03-24)
- 9/9 IR 생성 ✅
- ir_fix.py 패턴 기반 수정: 500-6300 fixes/test
- clang 에러: 각 테스트 1개 잔여

## 에러 패턴별 근본 원인

### P1: Generic param → i64 erasure (✅ 수정 완료)
- **증상**: `call i64 @Vec_push(%Vec* %v, i8 %val)` — i8/i16/i32를 i64 위치에 전달
- **근본 원인**: Generic<T> 파라미터가 i64로 erasure되나, 실제 값은 작은 타입
- **수정 위치**: `method_call.rs:308`, `generate_expr_call.rs:518`
- **수정 내용**: Generic param → "i64" LLVM type + zext/trunc coercion 추가
- **효과**: Vec_push, Vec_insert 등 모든 generic method의 arg width 불일치 해소
- **상태**: ✅ 수정 완료, 검증 완료

### P2: ret 타입 불일치 (수정 필요)
- **증상**: `ret float %t1` 에서 `%t1`은 `double` (sqrt 결과)
- **근본 원인**: codegen이 function body의 마지막 expression 타입과 선언된 반환 타입 간 coercion 미삽입
- **수정 위치**: `generate_expr/mod.rs` 또는 `stmt_visitor.rs` (ret instruction 생성)
- **수정 내용**: ret 직전에 반환값 타입 ↔ 선언 반환 타입 비교 → fptrunc/fpext/trunc/zext 삽입

### P3: binary op operand 타입 불일치 (수정 필요)
- **증상**: `shl i16 %t20, %t23` 에서 `%t20`은 i8
- **근본 원인**: codegen이 binary op (shl, or, and, add 등)에서 양쪽 operand 타입을 통일하지 않음
- **수정 위치**: `expr_helpers.rs` 또는 `generate_expr/mod.rs` (binary op 생성)
- **수정 내용**: binary op 생성 시 양쪽 operand 타입 비교 → 작은 쪽을 zext/sext

### P4: ptr vs typed pointer (ir_fix.py에서 처리)
- **증상**: `store %Vec %val, %Vec* %ptr` 에서 `%val`은 `ptr` (opaque pointer)
- **근본 원인**: LLVM 15+ opaque pointer 도입으로 일부 codegen 경로가 `ptr` 반환
- **수정 위치**: codegen의 struct method call 반환 타입 추론
- **현재 우회**: ir_fix.py가 `load %T, %T* %val` 삽입으로 처리
- **이상적 수정**: codegen에서 method call 반환 시 typed pointer 유지

### P5: ptr vs { ptr, i64 } slice (ir_fix.py에서 처리)
- **증상**: `extractvalue { i8*, i64 } %s, 0` 에서 `%s`는 `ptr`
- **근본 원인**: &str, &[u8] 등 slice 타입이 { ptr, i64 } fat pointer로 표현되어야 하나, 일부 경로에서 ptr로 전달
- **현재 우회**: ir_fix.py가 `load { ptr, i64 }, { ptr, i64 }* %s` 삽입

### P6: LLVM backend MCInst (test_graph 전용)
- **증상**: `fatal error: error in backend: Not supported instr`
- **근본 원인**: ARM64 backend에서 처리할 수 없는 instruction 패턴 생성
- **미해결**: 정확한 원인 instruction 파악 필요

### P7: floating point constant invalid (test_planner, test_types)
- **증상**: `floating point constant invalid for type`
- **근본 원인**: codegen이 f64 상수를 f32 context에서 사용하거나, hex float literal 포맷 오류
- **미해결**: 정확한 패턴 파악 필요

### P8: binary op widens to i64, but consumer expects i16 (NEW)
- **증상**: `store i16 %t3` 에서 `%t3`은 i64 (binary op 결과가 max(left,right)=i64로 확장됨)
- **근본 원인**: P3 수정으로 binary op이 더 넓은 타입을 선택하나, 결과를 좁은 타입에 쓸 때 trunc 미삽입
- **수정 위치**: stmt.rs의 store 생성 또는 assign 생성에서 trunc 삽입
- **3개 테스트에서 발생**: test_graph, test_btree, test_fulltext

## 수정 현황 (업데이트 2026-03-24 세션 #4)
1. ✅ P1 (Generic erasure coercion) — codegen 수정 완료
2. ⚠️ P3 (binary op coercion) — left-type approach 사용 중 (max-type는 P8 유발)
3. ⚠️ P2 (ret type coercion) — stmt.rs에 추가했으나 infer_expr_type 부정확으로 미작동
4. ✅ P4/P5 (ptr vs typed) — ir_fix.py iterative로 대부분 해결
5. ✅ P6 (backend MCInst) — P3 max-type 시 해소 (현재 left-type로 미해결)
6. ✅ P7 (float constant) — ir_fix.py iterative로 해결
7. ⚠️ P8 (binary op result width) — P3 left vs max 트레이드오프
8. ✅ NEW: i64→double, double→i64, ptr→i64, struct→ptr — ir_fix.py iterative 핸들러 추가

### ir_fix.py iterative 진행 상태
- 200 iterations로 각 테스트 수백 개 에러 자동 수정
- 남은 에러: phi node 수준 타입 불일치 (i8→i16, i32→i64, float→double)
- phi post-pass 일반화 시도했으나 fn_start 범위 확장으로 test_vector regression

### 다음 단계
1. phi post-pass의 fn_start regression 수정
2. phi node에서 i8→i16, i32→i64 cast 삽입 (incoming block의 br 앞에)
3. ptr→{ ptr, i64 } 패턴 해결 (call arg에서 slice 매개변수)
4. 각 테스트 link + run 시도

## 검증 명령 (strict 모드 — SINGLE_MODULE, VAIS_TC_NONFATAL 사용 금지)
```bash
# 전체 파이프라인 (strict 빌드)
cd /Users/sswoo/study/projects/vais-lang/packages/vaisdb
mkdir -p /tmp/vais-lib && ln -sf /Users/sswoo/study/projects/vais/std /tmp/vais-lib/std
for test in test_graph test_vector test_btree test_buffer_pool test_wal test_fulltext test_transaction test_planner; do
  VAIS_DEP_PATHS="$(pwd)/src:/tmp/vais-lib/std" VAIS_STD_PATH="/tmp/vais-lib/std" \
    ~/.cargo/bin/vaisc build tests/*/${test}.vais --emit-ir -o /tmp/${test}.ll --force-rebuild 2>&1 | grep "^error\["
done
```
