# VAIS Safe Subset

사용 가능/불가 문법 및 타입 규칙 분류표.
기준 버전: Phase 184 (unambiguous keywords) + Phase 158 (strict type coercion).

---

## 1. 타입 시스템 — 안전한 암묵 통합 vs 금지된 암묵 통합

`vais-types/src/inference/unification.rs` 에 정의된 16개 규칙 분류.

### ✅ 안전 (유지)

| 규칙 | 설명 |
|------|------|
| Integer widening | 같은 부호 내 확장: `i8 → i16 → i32 → i64`. 암묵 허용. |
| `Vec<T>` ↔ `&[T]` auto-coercion | 슬라이스 인자로 Vec을 직접 전달 가능. |
| `&Vec<T>` ↔ `&[T]` auto-deref | Rust 스타일 deref coercion. `&vec` → `&[T]` 자동 변환. |
| `&mut Vec<T>` ↔ `&mut [T]` | mutable 슬라이스 coercion. |
| `Linear<T>` ↔ `T` unwrapping | Linear wrapper 자동 언래핑. |
| `Affine<T>` ↔ `T` unwrapping | Affine wrapper 자동 언래핑. |
| float literal `f32` ↔ `f64` inference | 부동소수점 리터럴에서 타입 추론. 컨텍스트에 따라 자동 결정. |

### ❌ 금지 (Phase 158)

| 규칙 | 설명 | 올바른 대안 |
|------|------|-------------|
| `Bool` ↔ `Integer` | bool은 정수가 아님. 암묵 변환 불가. | `true as i64`, `(x == y) as i64` |
| `Str` ↔ `I64` | IR 표현 차이로 인한 불호환. 암묵 변환 불가. | 명시적 변환 함수 사용 |
| `int` ↔ `float` 암묵 변환 | 정수 리터럴의 float 암묵 확장 금지. | `42 as f64` 또는 `42.0` |
| `Pointer` ↔ `I64` | FFI 외부 코드 이외에는 포인터-정수 변환 금지. | FFI 컨텍스트에서만 허용 |

### ⚠️ 주의

| 규칙 | 설명 | 워크어라운드 |
|------|------|--------------|
| `Unit` ↔ `I64` | void 컨텍스트에서만 허용. 일반 식에서는 타입 에러. | void 함수 호출 결과는 Unit으로 추론됨 — match arm에서 주의 |
| `Result/Optional` ↔ `Unit` | 암묵 `Ok(())`/`Some(())` wrapping. 컴파일러가 자동 삽입하는 경우 있음. | 명시적으로 `Ok(())` 작성 권장 |
| `Pointer` ↔ `Slice` | C-style buffer 조작, systems code에서만 허용. | 일반 코드에서는 `Vec<T>` 또는 `&[T]` 사용 |
| `Array` ↔ `Pointer` | C-style decay. 예상치 못한 타입 에러 유발 가능. | 배열은 슬라이스 `&[T]`로 전달 |

---

## 2. 파서 문법 — 지원/미지원 구문

### ✅ 지원

| 구문 | 설명 |
|------|------|
| struct literal | `Foo { field: value }` — 직접 초기화 |
| map literal | `{ "key": value }` 형태 |
| ternary expression | 조건 삼항식 |
| try expression | `?` 연산자 스타일 에러 전파 |
| `>>` right shift | 제네릭 닫기 `>>` 와 구별하여 파싱 |
| 튜플 필드 접근 `.0` `.1` | Phase 6에서 추가. `pair.0`, `pair.1` 형태 |
| `E {}` / `EN {}` enum syntax | `E EnumName { ... }` 및 Phase 184 신규 `EN EnumName { ... }` 모두 지원. 마이그레이션 후 `EN` 권장. |
| `EL` else keyword | `I cond { ... } EL { ... }` — Phase 184에서 `E`(else)와 `EN`(enum)을 구별하기 위한 명시 키워드. 기존 `E { ... }`도 하위 호환. |
| `LF` for-each keyword | `LF var in collection { ... }` — Phase 184 신규. 기존 `L var in ...`도 하위 호환. |
| `LW` while keyword | `LW condition { ... }` — Phase 184 신규. 기존 `L condition { ... }`도 하위 호환. |
| string interpolation `"{var}"` | 문자열 보간. TC에서 어떤 타입이든 허용. 정상 작동. |
| pointer auto-deref `*Mutex<T>.lock()` | 포인터 자동 역참조 후 메서드 호출 |

### ❌ 미지원/금지

| 구문 | 설명 | 대안 |
|------|------|------|
| `L EnumName = ... \| ...` bar syntax | 파이프 구분 enum 정의. TC는 허용하나 파서가 거부. | `E EnumName { ... }` 중괄호 문법 사용 |
| `str.as_bytes()` | str에 유효한 메서드 없음. | `s[i]` 인덱싱 + `__strlen(s)` 길이 계산 |
| `str.push_str()` | str에 유효한 메서드 없음. | `s = s + "..."` 문자열 연결 |
| first-class function pointers | Vais에서 함수 포인터를 일급 값으로 전달 불가. | 이름 문자열로 symbolic dispatch (`"handler_name"` 등록 후 런타임 해석) |

### ⚠️ 워크어라운드 필요

| 패턴 | 문제 | 워크어라운드 |
|------|------|--------------|
| `Vec<struct>[i].field` | 인덱싱 결과에 필드 접근 불가. | `tmp := mut v[i]; tmp.field` — tmp 패턴 사용 |
| match 안에서 early return | match arm 내부의 `R` 반환이 불안정. | if-else 구조로 대체 권장 |
| 외부 struct 필드를 mutating loop | loop 내에서 외부 struct 필드 직접 변경 불가. | recursive helper function으로 분리 (예: `pipeline_run_before` 패턴) |
| `x & 1 == 1` bitwise AND 비교 | 우선순위 혼동으로 예상 외 결과. | `(x & 1) == 1` 명시적 괄호 필수 |
| `!` 연산자 bitwise NOT | `!` 는 논리 NOT (`bool` 반환). bitwise NOT 불가. | `0xFF ^ val` 형태로 XOR 사용 |

---

## 3. Codegen 한계 — 알려진 지뢰

### ✅ 해결됨 (Phase 11, 2026-04-05)

| 이전 이슈 | 해결 방법 |
|----------|----------|
| `Option<Struct>` / `Result<T, Struct>` erasure | `expr_helpers_call/call_gen.rs`의 `payload_is_native_struct` 분기 제거. 큰 struct(>8B)는 heap-alloc + pointer in i64 slot으로 일원화. phase183 e2e 8/8 PASS. |

### ❌ 미해결

| 이슈 | 설명 |
|------|------|
| `HashMap<K, Struct>` i64 erasure | entry_size를 Phase 8에서 동적화했으나 일부 케이스에서 struct 값이 i64로 소거됨. |
| cross-module struct declare 누락 | `StringMap` 등 외부 모듈 struct가 IR에 미선언되는 케이스 잔존 (test_fulltext 1건). |
| `.drop()` 호출 전체 disabled | 120개 drop 호출 비활성화 상태. auto-free 미완성으로 메모리 해제 수동 관리 필요. |
| 파서 multi-field tuple variant pattern binding | `E::Rect(w, h)` 형태의 multi-field variant pattern에서 첫 필드만 binding됨. |

### ⚠️ 부분 해결

| 이슈 | 설명 | 현재 우회 방법 |
|------|------|----------------|
| match에서 str 반환 | phi 타입 `{ i8*, i64 }` 정렬 불일치로 IR 에러 가능. | match 대신 if-else 체인으로 str 반환 |
| `Vec<struct>` field access | 인덱싱 후 필드 접근 시 i64 erasure로 잘못된 값 참조. | `tmp := mut v[i]; tmp.field` tmp 패턴 |
| enum variant str field | TC와 codegen 간 str 필드 표현 불일치. 일부 variant에서 런타임 오류. | str 필드를 별도 변수에 먼저 추출 후 사용 |

---

## 4. 빌드 규칙 — 어떤 vaisc를 써야 하는가

### Canonical 컴파일러

```
~/.cargo/bin/vaisc   (버전 0.1.0)
```

- 설치: `cd vais-lang && cargo install --path crates/vais-compiler`
- 이 바이너리가 모든 패키지(`vaisdb`, `vais-server`, `vais-web`) 빌드의 기준.

### 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `VAISC` | `~/.cargo/bin/vaisc` | 사용할 컴파일러 경로. `build.sh`에서 `VAISC=${VAISC:-~/.cargo/bin/vaisc}` 로 설정. |
| `VAIS_STD_PATH` | 없음 (필수 지정) | std 라이브러리 경로. `/tmp/vais-lib/std` 또는 symlink 경로. |
| `VAIS_DEP_PATHS` | 없음 | 의존 모듈 탐색 경로. `"$(pwd)/src:/tmp/vais-lib/std"` 형태로 콜론 구분. |
| `VAIS_SINGLE_MODULE` | 없음 | `1`로 설정 시 단일 모듈 모드. |
| `VAIS_TC_NONFATAL` | 없음 | `1`로 설정 시 타입 체커 에러를 non-fatal로 처리. |

### Homebrew 설치 버전 — 용도 제한

```
/opt/homebrew/bin/vaisc   (버전 1.0.0)
```

- **playground/CLI 전용**. 패키지 빌드에 사용 금지.
- 버전 불일치로 인해 Phase 158 이후 strict 규칙이 다르게 적용될 수 있음.

### 표준 빌드 커맨드 예시

```sh
VAIS_DEP_PATHS="$(pwd)/src:/tmp/vais-lib/std" \
VAIS_STD_PATH="/tmp/vais-lib/std" \
VAIS_SINGLE_MODULE=1 \
VAIS_TC_NONFATAL=1 \
vaisc build <target>.vais --emit-ir -o /tmp/<target>.ll --force-rebuild
```
