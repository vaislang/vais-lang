# vais-web Regression Baseline (Phase Ω Pillar 2 wave 2, 2026-04-28)

## 현재 baseline

- **Total: 271/0** (cargo test --workspace, 2026-04-28 실측)
- **Ignored: 4** (doc-test 4건 — vaisx_compiler 1 + vaisx_parser 3, 컴파일 예제 snippet)

### Crate별 split

| Crate | Test binary | Passed | Failed | Ignored |
|-------|-------------|--------|--------|---------|
| vaisx-compiler | unittests src/lib.rs | 80 | 0 | 0 |
| vaisx-compiler | tests/bundle_size.rs | 15 | 0 | 0 |
| vaisx-compiler | tests/compile_e2e.rs | 14 | 0 | 0 |
| vaisx-parser | unittests src/lib.rs | 112 | 0 | 0 |
| vaisx-parser | tests/e2e.rs | 40 | 0 | 0 |
| vaisx-wasm | unittests src/lib.rs | 10 | 0 | 0 |
| **합계 (pass)** | | **271** | **0** | **4** |

### Crate별 baseline lock

```
vaisx-compiler unit:     80
vaisx-compiler bundle_size: 15
vaisx-compiler compile_e2e: 14
vaisx-parser unit:       112
vaisx-parser e2e:         40
vaisx-wasm unit:          10
aggregate:               271
```

## Detection model

### vais-web의 regression 감지 유형

vais-web는 vais 컴파일러 crates (`vais-codegen-js`, `vais-parser`, `vais-ast`)에 의존한다.
이 의존성은 Rust API 수준의 계약이므로, 감지 가능한 regression 유형은 다음과 같다:

| 감지 유형 | 예시 | 감지 방법 |
|-----------|------|-----------|
| Trait bound 변경 | `impl Parser for X` 시그니처 변경 | cargo compile error → test binary 생성 실패 |
| Type enum variant 추가/제거 | `AstNode` 에 variant 추가 → exhaustive match 깨짐 | compile error |
| Function signature drift | 함수 파라미터 타입 변경 | compile error |
| Behavior regression | JS codegen 결과 변경 | compile_e2e / e2e 테스트 실패 |
| Bundle size 증가 | JS 출력 크기 limit 초과 | bundle_size 테스트 실패 |

### vaisdb/server 대비 차이

- **vaisdb/server**: `.vais` 소스 → `vaisc build` → IR/output 검증 (런타임 동작 regression)
- **vais-web**: `cargo test` → Rust API 계약 + JS codegen 출력 검증 (컴파일러 API/동작 regression)

## Regression delta

- aggregate baseline 미만 (`< 271`) 어떤 count도 regression으로 간주
- failed > 0 이면 즉시 regression
- crate별 lock 값: 위 테이블 참조
- 현재 스크립트(`compiler/scripts/vais-web-regression.sh`)는 aggregate 271 기준 검증

## 통합 강화 권장사항

### 현재 상태 (iter 87 Wave 1)

- `compiler/scripts/vais-web-regression.sh` 에 aggregate 271 baseline 하드코딩
- 감소 시 `REGRESSION` 출력 + exit 1, 증가 시 `IMPROVEMENT` 출력

### 강화 권장사항

1. **Crate별 baseline 명시**: 현재 aggregate 271만 검증. bundle_size/compile_e2e/e2e 각 테스트 binary별 카운트 추가 검증 권장 (로컬 분리 regression 조기 감지)

2. **컴파일러 변경 시 vais-web cargo test 의무화**:
   - `vais-codegen-js` 변경 → compile_e2e (14) + e2e (40) 재실행 의무
   - `vais-parser` / `vais-ast` 변경 → vaisx-parser unit (112) + e2e (40) 재실행 의무

3. **CI workflow trigger 조건** (`.github/workflows/vais-web-regression.yml` 권장):
   ```yaml
   on:
     push:
       paths:
         - 'crates/vais-codegen-js/**'
         - 'crates/vais-parser/**'
         - 'crates/vais-ast/**'
   ```

4. **Ignored test 모니터링**: 현재 doc-test 4건 ignored. 이 숫자가 증가하면 실제 테스트가 doc-test로 오분류된 것일 수 있으므로 추적 필요.

## 실측 기록

```
측정일: 2026-04-28
명령: cd /Users/sswoo/study/projects/vais/lang/packages/vais-web && cargo test --workspace
결과:
  vaisx_compiler (unit):       80 passed / 0 failed / 0 ignored
  vaisx_compiler (bundle_size): 15 passed / 0 failed / 0 ignored
  vaisx_compiler (compile_e2e): 14 passed / 0 failed / 0 ignored
  vaisx_parser (unit):         112 passed / 0 failed / 0 ignored
  vaisx_parser (e2e):           40 passed / 0 failed / 0 ignored
  vaisx_wasm (unit):            10 passed / 0 failed / 0 ignored
  doc-tests vaisx_compiler:      0 passed / 0 failed / 1 ignored
  doc-tests vaisx_parser:        0 passed / 0 failed / 3 ignored
  doc-tests vaisx_wasm:          0 passed / 0 failed / 0 ignored
  aggregate (non-doc):         271 passed / 0 failed / 0 ignored
```
