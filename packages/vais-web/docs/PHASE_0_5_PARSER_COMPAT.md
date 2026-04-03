# 코어 파서 호환성 매트릭스

> **대상**: vais-parser / vais-ast / vais-lexer (vais 코어 Phase 140+)
> **목적**: desugar된 VaisX 코드가 코어 파서에서 정상 파싱되는지 검증
> **날짜**: 2026-03-11 (Phase 140 검증 업데이트)

---

## 1. desugar 변환 목록

vaisx-parser가 `<script>` 블록을 코어 파서에 넘기기 전에 수행하는 전처리:

| # | VaisX 소스 | desugar 결과 | 변환 레벨 |
|---|-----------|-------------|----------|
| 1 | `$state(x)` | `__vx_state(x)` | 소스 텍스트 또는 토큰 스트림 |
| 2 | `$derived(expr)` | `__vx_derived(\|\| { expr })` | 소스 텍스트 또는 토큰 스트림 |
| 3 | `$effect { body }` | `__vx_effect(\|\| { body })` | 소스 텍스트 또는 토큰 스트림 |
| 4 | `P { fields }` | `S __VxProps__ { fields }` | **소스 텍스트만** (필수) |
| 5 | `emit x()` | `__vx_emit("x")` | 소스 텍스트 또는 토큰 스트림 |

---

## 2. 호환성 검증 매트릭스

### 2.1 `$state(x)` → `__vx_state(x)`

| 검증 항목 | 상태 | 근거 |
|----------|------|------|
| `__vx_state` 식별자 유효성 | ✅ 호환 | 더블 언더스코어 식별자는 코어 lexer에서 `Token::Ident`로 정상 토큰화 |
| 함수 호출 파싱 | ✅ 호환 | `__vx_state(x)` = 일반 함수 호출, 코어 파서의 `parse_call_expr()` 정상 처리 |
| 할당문 파싱 | ✅ 호환 | `count := __vx_state(0)` = 일반 let 바인딩 (`:=` → `Token::ColonEq`) |
| 타입 추론 영향 | 무관 | desugar 단계에서 타입 정보 불필요 (파싱 단계만 검증) |

**desugar 전 파싱 문제**: `$state(0)`에서 `$`는 `Token::Dollar`로, `state`는 `Token::Ident`로 분리 토큰화됨 → 코어 파서는 `$`를 매크로 메타변수 문맥에서만 처리하므로 파싱 에러 발생.

### 2.2 `$derived(expr)` → `__vx_derived(|| { expr })`

| 검증 항목 | 상태 | 근거 |
|----------|------|------|
| `__vx_derived` 식별자 | ✅ 호환 | 위와 동일 |
| 빈 파라미터 클로저 `\|\|` | ✅ 호환 | 코어 파서가 `\|\| { body }` 클로저 완벽 지원 (`parse_closure_expr()`) |
| 클로저 내 표현식 | ✅ 호환 | 클로저 본문은 일반 표현식/블록으로 파싱 |
| 복합 표현식 (ex: `count * 2`) | ✅ 호환 | 이항 연산, 함수 호출, 필드 접근 등 모두 정상 |

### 2.3 `$effect { body }` → `__vx_effect(|| { body })`

| 검증 항목 | 상태 | 근거 |
|----------|------|------|
| 변환 결과 | ✅ 호환 | #2와 동일한 패턴 (함수 호출 + 클로저 인자) |
| 여러 문장 포함 | ✅ 호환 | 클로저 블록 내 여러 `Stmt` 정상 파싱 |

### 2.4 `P { fields }` → `S __VxProps__ { fields }`

| 검증 항목 | 상태 | 근거 |
|----------|------|------|
| `P` 토큰 충돌 | ⚠️ **충돌** | `P`는 `Token::Pub` (우선순위 3)으로 토큰화됨 |
| 충돌 시 에러 | ❌ 파싱 실패 | `P {`가 `Token::Pub + Token::LBrace`가 되어 "public visibility 뒤에 유효한 선언이 없음" 에러 |
| `S __VxProps__` 변환 후 | ✅ 호환 | `S`는 `Token::Struct`, `__VxProps__`는 `Token::Ident` → 정상 구조체 파싱 |
| **필수 요건** | 소스 텍스트 레벨 변환 | lexer 호출 전에 `P {` → `S __VxProps__ {` 치환 필수 |
| 구조체 필드 파싱 | ✅ 호환 | `user: User`, `showAvatar: bool` 등 일반 필드 정상 파싱 |
| 기본값 처리 | ⚠️ 별도 처리 | `showAvatar: bool = true`의 `= true` 부분은 코어 구조체 문법에 없음 → vaisx-parser가 기본값을 분리하여 별도 메타데이터로 저장 후 제거 |
| `emit` 선언 처리 | ⚠️ 별도 처리 | `emit select(user: User)` 행은 코어 구조체 필드 아님 → vaisx-parser가 이벤트 테이블로 분리 후 제거 |

### 2.5 `emit x()` → `__vx_emit("x")`

| 검증 항목 | 상태 | 근거 |
|----------|------|------|
| `emit` 토큰 | ✅ 호환 | `emit`은 코어 키워드가 아님 → `Token::Ident("emit")`으로 토큰화 |
| `__vx_emit("x")` | ✅ 호환 | 일반 함수 호출 + 문자열 리터럴 인자 |

### 2.6 `#[server]`, `#[wasm]` 어트리뷰트

| 검증 항목 | 상태 | 근거 |
|----------|------|------|
| `#[` 토큰 | ✅ 호환 | `Token::HashBracket` → 코어 파서의 `parse_attributes()` 정상 처리 |
| Attribute 구조체 | ✅ 호환 | `Attribute { name: "server", args: [] }` / `Attribute { name: "wasm", args: [] }` |
| key=value 인자 | ✅ 호환 | `#[server(rate_limit = "10/min")]` → `args: ["rate_limit", "=", "10/min"]` |
| passthrough | ✅ 호환 | 코어 파서는 알 수 없는 어트리뷰트를 에러 없이 AST에 저장 (의미 처리 안 함) |

### 2.7 `__vx_*` 식별자 패턴

| 검증 항목 | 상태 | 근거 |
|----------|------|------|
| 더블 언더스코어 접두사 | ✅ 호환 | 코어 lexer는 `_`로 시작하는 식별자 허용 |
| 식별자 길이 제한 | ✅ 호환 | 코어 lexer에 식별자 길이 제한 없음 |
| 코어 키워드와 충돌 | ✅ 없음 | `__vx_state`, `__vx_derived`, `__vx_effect`, `__vx_emit` 모두 비예약어 |

---

## 3. 코어 파서 공개 API 호환성

### 3.1 parse() — 기본 파싱

```rust
pub fn parse(source: &str) -> Result<Module, ParseError>
```

- vaisx-parser가 desugar 후 호출
- 단일 에러 시 즉시 Err 반환
- **프로덕션 빌드**에 적합

### 3.2 parse_with_recovery() — 에러 복구 파싱

```rust
pub fn parse_with_recovery(source: &str) -> (Module, Vec<ParseError>)
```

- 에러가 있어도 최대한 많은 AST 반환
- `Item::Error { message, skipped_tokens }` 노드로 에러 위치 표시
- 동기화 포인트: Statement(`;`, `}`), Expression(`,`, `)`, `]`), Item(다음 키워드)
- **개발 서버 (vaisx dev)**에 적합 — 부분 에러에도 UI 렌더링 유지

### 3.3 parse_with_cfg() — 조건부 컴파일

```rust
pub fn parse_with_cfg(source: &str, cfg_values: HashMap<String, String>) -> Result<Module, ParseError>
```

- `#[cfg(key = "value")]` 어트리뷰트 기반 조건부 포함/제외
- VaisX에서는 `#[cfg(target = "client")]` / `#[cfg(target = "server")]` 등으로 활용 가능

---

## 4. 코어 AST 노드 호환성

### 4.1 desugar 결과가 사용하는 AST 노드

| desugar 패턴 | 사용하는 AST 노드 | 코어 지원 |
|-------------|------------------|----------|
| `__vx_state(x)` | `Expr::Call { func: Expr::Ident, args }` | ✅ |
| `count := __vx_state(0)` | `Stmt::Let { name, value: Expr::Call }` | ✅ |
| `__vx_derived(\|\| { expr })` | `Expr::Call { args: [Expr::Lambda] }` | ✅ |
| `__vx_effect(\|\| { body })` | `Expr::Call { args: [Expr::Lambda] }` | ✅ |
| `S __VxProps__ { fields }` | `Item::Struct(Struct { name, fields })` | ✅ |
| `__vx_emit("x")` | `Expr::Call { args: [Expr::String] }` | ✅ |
| `#[server]` / `#[wasm]` | `Attribute { name, args }` on `Function` | ✅ |

### 4.2 Function 노드 — VaisX 관련 필드

```rust
pub struct Function {
    pub name: Spanned<String>,
    pub generics: Vec<GenericParam>,
    pub params: Vec<Param>,
    pub ret_type: Option<Spanned<Type>>,
    pub body: FunctionBody,
    pub is_pub: bool,
    pub is_async: bool,
    pub attributes: Vec<Attribute>,    // ← #[server], #[wasm] 저장
    pub where_clause: Vec<WhereClause>,
}
```

### 4.3 Attribute 노드

```rust
pub struct Attribute {
    pub name: String,           // "server", "wasm", "cfg" 등
    pub args: Vec<String>,      // 인자 목록
}
```

---

## 5. 코어 Lexer 토큰 관련 검증

### 5.1 VaisX desugar에 관련된 코어 토큰

| 토큰 | 코어 Lexer | VaisX 관련 |
|------|-----------|-----------|
| `Token::Dollar` (`$`) | 매크로 메타변수용 | desugar 전 `$state` 등에서 발생 → 반드시 소스 레벨에서 치환 |
| `Token::Pub` (`P`) | 접근 제어자 | `P { }` Props 블록과 충돌 → 소스 레벨에서 `S __VxProps__`로 치환 |
| `Token::Struct` (`S`) | 구조체 선언 | desugar 후 `S __VxProps__`에서 사용 |
| `Token::Ident(name)` | 일반 식별자 | `__vx_*`, `emit`, `__VxProps__` 등 |
| `Token::HashBracket` (`#[`) | 어트리뷰트 시작 | `#[server]`, `#[wasm]` |
| `Token::ColonEq` (`:=`) | let 바인딩 | `count := __vx_state(0)` |
| `Token::Pipe` (`\|`) | 클로저 파라미터 | `\|\| { body }` |

### 5.2 동기화 포인트 (에러 복구)

코어 파서의 에러 복구 동기화 토큰:

- **Statement 동기화**: `Token::Semi`, `Token::RBrace`, `Token::Return`, `Token::Break`, `Token::Continue`, `Token::Defer`, `Token::If`, `Token::Loop`, `Token::Match`
- **Item 동기화**: `Token::Function`, `Token::Struct`, `Token::Enum`, `Token::Union`, `Token::TypeKeyword`, `Token::Use`, `Token::Trait`, `Token::Impl`, `Token::Macro`, `Token::Pub`, `Token::Async`, `Token::HashBracket`

desugar된 코드의 `__vx_*` 호출은 일반 표현식이므로, 에러 복구 시 Statement 동기화 포인트에서 정상 복구됨.

---

## 6. 검증 결론

### 6.1 전체 호환성 요약

| 변환 | 호환성 | 변환 레벨 | 추가 처리 |
|------|--------|----------|----------|
| `$state(x)` → `__vx_state(x)` | ✅ 호환 | 소스 텍스트 (권장) | 없음 |
| `$derived(expr)` → `__vx_derived(\|\| { expr })` | ✅ 호환 | 소스 텍스트 (권장) | 없음 |
| `$effect { body }` → `__vx_effect(\|\| { body })` | ✅ 호환 | 소스 텍스트 (권장) | 없음 |
| `P { }` → `S __VxProps__ { }` | ⚠️ 충돌 | **소스 텍스트 필수** | 기본값 분리, emit 분리 |
| `emit x()` → `__vx_emit("x")` | ✅ 호환 | 소스 텍스트 (권장) | 없음 |
| `#[server]` / `#[wasm]` | ✅ 호환 | 변환 불필요 | 코어 파서가 passthrough |
| `__vx_*` 식별자 | ✅ 호환 | — | 없음 |

### 6.2 권장 전략

**일관성을 위해 모든 desugar를 소스 텍스트 레벨에서 수행**:

1. `P { ... }` 블록 탐지 → `S __VxProps__ { ... }` 치환 (필수)
   - 기본값 (`= value`) 제거 → 별도 메타데이터 저장
   - `emit name(params)` 행 제거 → 이벤트 테이블 저장
2. `$state(x)` → `__vx_state(x)` 치환
3. `$derived(expr)` → `__vx_derived(|| { expr })` 치환
4. `$effect { body }` → `__vx_effect(|| { body })` 치환
5. `emit name(args)` 호출 → `__vx_emit("name", args)` 치환
6. 치환된 소스를 `parse()` 또는 `parse_with_recovery()`에 전달

### 6.3 Phase 0.5 Stage 1 테스트 항목 (Task #4 연계)

다음 desugar 패턴들이 `parse()` / `parse_with_recovery()`에서 정상 파싱되는지 E2E 테스트:

1. `count := __vx_state(0)` → `Stmt::Let` + `Expr::Call`
2. `name := __vx_state("world")` → 문자열 인자 함수 호출
3. `doubled := __vx_derived(|| { count * 2 })` → 클로저 인자 함수 호출
4. `__vx_effect(|| { console_log("changed: ", count) })` → 표현식문 + 클로저
5. `S __VxProps__ { user: User, showAvatar: bool }` → 구조체 정의
6. `__vx_emit("select")` → 문자열 인자 함수 호출
7. `#[server] A F loadItems() -> Vec<Item> { ... }` → 어트리뷰트 + async 함수
8. `#[wasm] F processData(raw: Vec<f64>) -> Vec<DataPoint> { ... }` → 어트리뷰트 + 함수

---

## 7. Phase 140 호환성 검증 (2026-03-11)

> Phase 139 → 140 업그레이드에서 추가된 변경사항이 VaisX desugar 파이프라인과 충돌하지 않는지 검증.

### 7.1 새 키워드 충돌 검증

Phase 140에서 추가된 키워드: `lazy`, `force`, `comptime`, `yield`, `consume`

| 새 키워드 | VaisX desugar 패턴과 충돌? | 근거 |
|-----------|--------------------------|------|
| `lazy` | ✅ 충돌 없음 | `$state`, `$derived`, `$effect`, `P{}`, `emit` 어느 것과도 문자열 겹침 없음 |
| `force` | ✅ 충돌 없음 | 동일 |
| `comptime` | ✅ 충돌 없음 | 동일 |
| `yield` | ✅ 충돌 없음 | 동일 |
| `consume` | ✅ 충돌 없음 | `emit` 패턴 내 `consume` 부분 문자열이 아님. `find_emit_call()`의 word-boundary 검사 통과 |

**desugar 문자열 치환 안전성:**
- `desugar_dollar_call()`: `source.replace("$state", ...)` — 새 키워드에 `$state` 부분 문자열 없음
- `desugar_derived()`: `"$derived("` 패턴 매칭 — 새 키워드 무관
- `desugar_effect()`: `"$effect"` 패턴 매칭 — 새 키워드 무관
- `find_props_block_start()`: 줄 시작 `P` + `{` 매칭 — 새 키워드 중 `P`로 시작하는 것 없음
- `find_emit_call()`: `"emit "` + word-boundary 검사 — 새 키워드 중 `emit`과 겹치는 것 없음

### 7.2 새 AST 노드 호환성

Phase 140에서 추가된 AST 노드: `Lazy`, `Force`, `Assert`, `Assume`, `Old`, `Comptime`, `Yield`

| 새 AST 노드 | VaisX 영향? | 근거 |
|-------------|-----------|------|
| `Expr::Lazy` | ✅ 무관 | desugar 후 코드에서 `lazy` 키워드 미사용. 사용자가 `<script>`에서 `lazy` 작성 시 코어 파서가 정상 처리 |
| `Expr::Force` | ✅ 무관 | 동일 |
| `Stmt::Assert` / `Stmt::Assume` | ✅ 무관 | 디버그/검증 문 — desugar 패턴과 무관 |
| `Expr::Old` | ✅ 무관 | contract 프로그래밍용 — VaisX 파이프라인 미사용 |
| `Expr::Comptime` | ✅ 무관 | 컴파일 타임 평가 — desugar 이후 코어 파서가 처리 |
| `Expr::Yield` | ✅ 무관 | 코루틴/제너레이터용 — desugar 패턴과 무관 |

### 7.3 CallArgs::Named 추가 — VaisX Props 전달 영향

Phase 140에서 `CallArgs::Named { name, value }` 변형이 추가됨.

| 검증 항목 | 결과 | 근거 |
|----------|------|------|
| desugar 생성 코드에 Named args 사용? | ❌ 미사용 | `__vx_state(x)`, `__vx_derived(|| { expr })`, `__vx_emit("name", args)` 모두 위치 인자 |
| 사용자 코드에서 Named args 사용 시? | ✅ 호환 | desugar 후 코어 파서가 Named args를 정상 파싱 |
| VaisX Props에 Named args 활용 가능성? | 향후 검토 | `<Component name={value}>` 형태는 template 레벨이므로 코어 CallArgs와 무관 |

### 7.4 선형/Affine 타입 (Ownership) — 반응성 변수 영향

Phase 140에서 `Linear`, `Affine` 타입과 `consume` 키워드가 추가됨.

| 검증 항목 | 결과 | 근거 |
|----------|------|------|
| `$state` 변수에 선형 타입 적용? | ✅ 무관 | `$state`는 소스 레벨 desugar → `__vx_state()` 함수 호출. 타입 시스템은 desugar 이후 단계 |
| `consume` 키워드와 `emit` 충돌? | ✅ 충돌 없음 | `consume`은 코어 키워드 → `Token::Consume`, `emit`은 식별자 → `Token::Ident`. desugar에서 `emit`은 word-boundary 검사로 정확히 매칭 |
| JS codegen에서 Ownership 영향? | ✅ 무관 | JS에는 ownership 개념 없음 — codegen이 타입을 JS로 변환할 때 ownership 정보는 무시됨 |

### 7.5 SIMD 벡터 타입 — WASM 바인딩 영향

Phase 140에서 `Vector(element, lanes)` SIMD 타입이 추가됨.

| 검증 항목 | 결과 | 근거 |
|----------|------|------|
| VaisX 컴포넌트에서 SIMD 사용? | 현재 해당 없음 | UI 컴포넌트에서 SIMD 직접 사용은 비일반적 |
| `#[wasm]` 함수에서 SIMD 사용 시? | 향후 검토 | WASM SIMD가 활성화되면 `vais_type_to_wit()` 매핑에 `Vector` 추가 필요 가능 |
| JS codegen JsType에 Vector 매핑? | 미필요 | SIMD 연산은 WASM에서만 실행, JS 바인딩에서는 `Array<number>` 또는 `Float32Array`로 마샬링 |

### 7.6 Phase 140 호환성 결론

| 변경 영역 | 호환성 | 조치 필요 |
|-----------|--------|----------|
| 새 키워드 5개 | ✅ 충돌 없음 | 없음 |
| 새 AST 노드 7개 | ✅ 무관 | 없음 |
| `CallArgs::Named` | ✅ 호환 | 없음 (향후 VaisX Props 개선 시 활용 가능) |
| 선형/Affine 타입 | ✅ 무관 | 없음 |
| SIMD 벡터 타입 | ✅ 무관 | 없음 (향후 WASM SIMD 지원 시 별도 작업) |

**결론**: Phase 140 변경사항은 VaisX desugar 파이프라인, 반응성 분석, JS codegen 어느 단계와도 충돌하지 않는다. 기존 코드 수정 없이 Phase 140 코어와 호환된다.
