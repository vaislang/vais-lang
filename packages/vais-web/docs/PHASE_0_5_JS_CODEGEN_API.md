# vais-codegen-js 크레이트 API 계약 문서

> **대상**: `vais-codegen-js` 크레이트 (vais 코어 Phase 140+)
> **목적**: vaisx-compiler가 호출할 공개 API 계약 문서화
> **날짜**: 2026-03-11 (Phase 140 검증 업데이트)

---

## 1. 크레이트 구조

```
vais-codegen-js/src/
├── lib.rs              # 진입점, JsCodeGenerator, JsConfig, JsCodegenError
├── types.rs            # JsType 열거형, type_to_js() 변환 함수
├── items.rs            # 아이템 코드 생성 (Function, Struct, Enum, Trait, Impl 등)
├── expr.rs             # 표현식 코드 생성
├── expr_helpers.rs     # 표현식 헬퍼 (sanitize_js_ident 등)
├── stmt.rs             # 문장 코드 생성
├── modules.rs          # ESM import/export, 모듈 분할, barrel export
├── sourcemap.rs        # Source Map v3 생성
└── tree_shaking.rs     # 트리 쉐이킹 (Dead Code Elimination)
```

---

## 2. 핵심 공개 API

### 2.1 JsCodeGenerator

```rust
pub struct JsCodeGenerator {
    pub config: JsConfig,
    // 내부 상태 (private)
}

impl JsCodeGenerator {
    /// 기본 설정으로 생성
    pub fn new() -> Self;

    /// 커스텀 설정으로 생성
    pub fn with_config(config: JsConfig) -> Self;

    /// Vais Module AST → JS (ESM) 문자열 변환
    /// 2패스: (1) 타입 등록, (2) 코드 생성
    pub fn generate_module(&mut self, module: &Module) -> Result<String>;

    /// 모듈 맵이 있는 경우 여러 .js 파일로 분할 생성
    /// 반환: HashMap<filename, js_content>
    pub fn generate_module_to_files(&mut self, module: &Module) -> Result<HashMap<String, String>>;

    /// 배럴 export (index.js) 생성
    pub fn generate_barrel_export(&self, modules: &[String]) -> String;
}
```

### 2.2 JsConfig

```rust
pub struct JsConfig {
    pub use_const_let: bool,  // true: const/let, false: var (기본: true)
    pub emit_jsdoc: bool,     // JSDoc 주석 생성 (기본: false)
    pub indent: String,       // 들여쓰기 문자열 (기본: "  ")
    pub target: String,       // ES 버전 (기본: "es2020")
}
```

### 2.3 JsCodegenError

```rust
pub enum JsCodegenError {
    UnsupportedFeature(String),  // JS 타겟에서 미지원 기능
    TypeError(String),           // 타입 에러
    Internal(String),            // 내부 에러
}
```

---

## 3. JsType 매핑 (types.rs)

### 3.1 JsType 열거형

```rust
pub enum JsType {
    Number,                              // i8~u64, f32, f64
    BigInt,                              // (현재 미사용, 향후 u128/i128)
    String,                              // str, String
    Boolean,                             // bool
    Void,                                // unit, ()
    Array(Box<JsType>),                  // Vec<T>, [T]
    Map(Box<JsType>, Box<JsType>),       // Map<K, V>
    Object(String),                      // 커스텀 타입 (클래스명)
    Function(Vec<JsType>, Box<JsType>),  // Fn(A, B) -> C
    Nullable(Box<JsType>),               // Option<T>
    Any,                                 // 추론 불가, 기타
}
```

### 3.2 type_to_js() 변환 테이블

| Vais AST Type | JS 타입 문자열 | 비고 |
|---------------|--------------|------|
| i8, i16, i32, u8, u16, u32, f32, f64 | `"number"` | |
| i64, u64, i128, u128 | `"number"` | (BigInt 미사용) |
| bool | `"boolean"` | |
| str, String | `"string"` | |
| Unit `()` | `"void"` | |
| Array(T) | `"Array<T>"` | 재귀 |
| ConstArray { element, .. } | `"Array<T>"` | 고정 크기 무시 |
| Map(K, V) | `"Map<K, V>"` | 재귀 |
| Tuple(Ts) | `"[T1, T2, ...]"` | |
| Optional(T) | `"T \| null"` | |
| Result(T) | `"T"` | 내부 타입만 추출 |
| Ref(T) / RefMut(T) / Pointer(T) | `"T"` | 참조 투명 |
| Lazy(T) | `"() => T"` | 지연 평가 |
| Fn { params, ret } / FnPtr | `"(P1, P2) => R"` | |
| DynTrait { trait_name, .. } | `"TraitName"` | |
| Named { name, .. } (커스텀) | `"Name"` | 그대로 전달 |
| Infer / 기타 | `"any"` | |

---

## 4. 아이템 코드 생성 (items.rs)

### 4.1 지원하는 Item 변환

| Vais Item | JS 출력 | 비고 |
|-----------|---------|------|
| Function | `[export] [async] function name(params) { body }` | is_pub → export |
| Struct | `[export] class Name { constructor(fields); methods }` | 필드 → 생성자 파라미터 |
| Enum | `[export] const Name = Object.freeze({ Variant: ... })` | 태그 유니온 패턴 |
| Trait | `[export] class Name { methods (default/abstract) }` | 추상 메서드 → throw |
| Impl | `TypeName.prototype.method = function() { ... }` | 인스턴스/스태틱 구분 |
| Const | `[export] const name = value;` | |
| Global | `[export] let name = value;` | |
| Use | `import * as name from './path.js';` | ESM import |
| TypeAlias / TraitAlias | (생략) | 런타임 표현 없음 |
| Macro | (생략) | 파싱 시 확장됨 |
| Union | `[export] class Name { get/set fields via _value }` | C 스타일 |
| ExternBlock | `/* extern: name */` | 주석만 |
| Error | `/* error: message */` | 에러 복구 노드 |

### 4.2 Struct → Class 변환 상세

```javascript
// Vais: S Point { x: f64, y: f64 }
class Point {
  constructor(x, y) {
    // 단일 객체 인자 지원 (StructLit 패턴)
    if (typeof x === 'object' && x !== null && !Array.isArray(x) && arguments.length === 1) {
      const __obj = x;
      this.x = __obj.x;
      this.y = __obj.y;
      return;
    }
    this.x = x;
    this.y = y;
  }
  // methods...
}
```

### 4.3 Enum → Tagged Union 변환 상세

```javascript
// Vais: E Color { Red, Green, Blue(u8) }
const Color = Object.freeze({
  Red: Object.freeze({ __tag: "Red", __data: [] }),
  Green: Object.freeze({ __tag: "Green", __data: [] }),
  Blue(__0) { return { __tag: "Blue", __data: [__0] }; },
});
// Result/Option에는 is_Ok, unwrap, unwrap_or, map 헬퍼 자동 추가
```

### 4.4 Impl 블록 처리

```javascript
// instance method (self 파라미터 있음) → prototype
TypeName.prototype.methodName = function(params) { body };

// static method (self 없음)
TypeName.methodName = function(params) { body };

// trait 구현 시 __implements Set 추적
TypeName.__implements = new Set();
TypeName.__implements.add("TraitName");
TypeName.__implementsTrait = function(traitName) { return this.__implements.has(traitName); };
```

---

## 5. 모듈 시스템 (modules.rs)

### 5.1 Use → ESM Import

```javascript
// U module          → import * as module from './module.js';
// U path::to::mod   → import * as mod from './to/mod.js';
// U std::io as myio → import * as myio from './io.js';
```

규칙: 첫 번째 세그먼트(패키지명)는 스킵, 나머지를 `/`로 연결.

### 5.2 generate_module_to_files()

`Module.modules_map` (PathBuf → Vec<usize>) 가 있으면 파일별 분할:
- 각 파일에 대해 별도의 `JsCodeGenerator` 인스턴스 생성
- 타입 등록(Pass 1) → 코드 생성(Pass 2)
- modules_map이 없으면 단일 `index.js`로 출력

### 5.3 Barrel Export

```javascript
// Auto-generated barrel export
export * from './module1.js';
export * from './module2.js';
```

---

## 6. Source Map v3 (sourcemap.rs)

### 6.1 SourceMap API

```rust
pub struct SourceMap { ... }

impl SourceMap {
    pub fn new(source: &str, generated: &str) -> Self;
    pub fn add_mapping(&mut self, gen_line: u32, gen_col: u32, src_line: u32, src_col: u32);
    pub fn to_json(&self) -> String;                     // Source Map v3 JSON
    pub fn to_inline_comment(&self) -> String;            // data URI base64
    pub fn to_file_comment(map_file: &str) -> String;     // 파일 참조
}
```

VLQ Base64 인코딩 지원. 표준 Source Map v3 스펙 준수.

---

## 7. 트리 쉐이킹 (tree_shaking.rs)

### 7.1 TreeShaker API

```rust
pub struct TreeShaker { ... }

impl TreeShaker {
    pub fn analyze(module: &Module) -> Self;
    pub fn mark_reachable(&mut self, entry_points: &[&str]);
    pub fn is_reachable(&self, name: &str) -> bool;
    pub fn filter_module(&self, module: &Module) -> Module;
    pub fn shake(module: &Module) -> Module;  // 편의 메서드: 분석 + 마킹 + 필터 일괄
}
```

### 7.2 동작 원리

1. `analyze()`: 모든 아이템의 의존성 그래프 구축 (이름 기반)
2. `mark_reachable()`: 진입점에서 flood-fill로 도달 가능한 아이템 표시
3. `filter_module()`: 도달 불가 아이템 제거

**기본 진입점**: `main` 함수 + 모든 `is_pub` 아이템.

---

## 8. vaisx-compiler가 호출할 API 계약

### 8.1 기본 Vais 코드 → JS 변환 위임

```rust
// vaisx-compiler/codegen_js.rs 에서:
use vais_codegen_js::{JsCodeGenerator, JsConfig};

let config = JsConfig {
    use_const_let: true,
    emit_jsdoc: false,
    indent: "  ".to_string(),
    target: "es2020".to_string(),
};
let mut gen = JsCodeGenerator::with_config(config);

// <script> 블록의 일반 Vais 코드 (함수, 구조체 등)를 JS로 변환
let js_output = gen.generate_module(&vais_ast_module)?;
```

### 8.2 vaisx-compiler의 역할 분담

| 담당 | 코드 범위 |
|------|----------|
| **vais-codegen-js** (위임) | 일반 함수, 구조체, 열거형, 트레이트, impl 블록, const, use → JS 변환 |
| **vaisx-compiler** (직접 생성) | `$$update_*` 함수, `$$schedule`, DOM 생성/업데이트 코드, 이벤트 바인딩, 컴포넌트 라이프사이클 |

### 8.3 주의사항

- `generate_module()`은 상태를 가지므로 (structs, enums, traits, impls 등록), 호출 순서 중요
- `register_item()` (Pass 1)이 먼저 실행된 후 `generate_item()` (Pass 2)이 실행됨
- `sanitize_js_ident()`로 JS 예약어 충돌 방지 (내부적으로 처리됨)
- `self` → `this` 변환은 impl 블록의 메서드 생성 시 자동 처리
- Source Map은 현재 수동으로 `add_mapping()` 호출 필요 -- vaisx-compiler에서 Span 정보를 활용해 매핑 추가
- 트리 쉐이킹은 vaisx-compiler 파이프라인 마지막에 적용 가능: `TreeShaker::shake(&module)`

---

## 9. Phase 140 JsType/Result 변경사항 영향 검증 (2026-03-11)

> Phase 136에서 Result 표준화, Vec/String/HashMap 메서드 확충이 이루어짐.
> Phase 140에서 Lazy, SIMD Vector, Linear/Affine 타입이 추가됨.
> 이 변경들이 VaisX JS codegen에 영향을 주는지 검증.

### 9.1 JsType enum 최신 변형 확인

현재 JsType enum (3.1절 기준):

| JsType 변형 | Phase 140 변경? | VaisX 영향? |
|-------------|----------------|-----------|
| `Number` | 변경 없음 | ✅ 무관 |
| `BigInt` | 변경 없음 | ✅ 무관 |
| `String` | 변경 없음 | ✅ 무관 |
| `Boolean` | 변경 없음 | ✅ 무관 |
| `Void` | 변경 없음 | ✅ 무관 |
| `Array(Box<JsType>)` | 변경 없음 | ✅ 무관 |
| `Map(Box<JsType>, Box<JsType>)` | 변경 없음 | ✅ 무관 |
| `Object(String)` | 변경 없음 | ✅ 무관 |
| `Function(Vec<JsType>, Box<JsType>)` | 변경 없음 | ✅ 무관 |
| `Nullable(Box<JsType>)` | 변경 없음 | ✅ 무관 |
| `Any` | 변경 없음 | ✅ 무관 |

**결론**: JsType enum 자체는 변경 없음. 새 코어 타입(`Lazy`, `Vector`, `Linear`, `Affine`)은 `type_to_js()` 변환 함수에서 기존 JsType으로 매핑됨.

### 9.2 type_to_js() 매핑 갱신 확인

Phase 140에서 추가된 코어 타입의 JS 매핑:

| 코어 타입 | JS 매핑 | JsType | 비고 |
|----------|---------|--------|------|
| `Lazy(T)` | `"() => T"` | `Function([], Box<T>)` | 3.2절에 이미 문서화됨 |
| `Vector(element, lanes)` | `"Array<element>"` | `Array(Box<element>)` | SIMD는 JS에서 TypedArray로, 일반 코드는 Array로 매핑 |
| `Linear(T)` | `"T"` | (inner type) | Ownership은 JS에서 무시 |
| `Affine(T)` | `"T"` | (inner type) | Ownership은 JS에서 무시 |

### 9.3 Result/Vec 표준화 — VaisX $state/$derived 타입 영향

| 검증 항목 | 결과 | 근거 |
|----------|------|------|
| `$state(Vec<T>)` | ✅ 무관 | `$state`는 초기값을 그대로 `let` 바인딩. Vec 메서드 추가는 Vais 타입 시스템 레벨이며 JS codegen에서 `Array` 메서드로 자동 매핑 |
| `$state(Result<T, E>)` | ✅ 무관 | Result는 `type_to_js()`에서 inner 타입 `T`로 매핑. VaisX에서 Result를 state로 사용하는 경우는 드물지만, 사용해도 호환 |
| `$derived(vec.map(...))` | ✅ 무관 | Vec 메서드는 vais-codegen-js가 `Array.prototype.map` 등으로 변환 처리 |
| `$derived(result.unwrap())` | ✅ 무관 | Result 메서드는 codegen-js가 헬퍼 함수로 변환 처리 |
| HashMap 메서드 | ✅ 무관 | codegen-js가 `Map.prototype.*`로 변환 |

### 9.4 VaisX 컴포넌트 코드 생성에 새 JS 타입 필요 여부

| 시나리오 | 새 JsType 필요? | 이유 |
|---------|----------------|------|
| Props에 Lazy 타입 사용 | ❌ 불필요 | `Lazy(T)` -> `() => T` 함수로 매핑, 기존 `Function` JsType으로 충분 |
| Props에 SIMD 타입 사용 | ❌ 불필요 | UI 컴포넌트에서 SIMD 직접 사용은 비일반적. 필요 시 `Array` 매핑 |
| Props에 Linear/Affine 타입 사용 | ❌ 불필요 | JS에 ownership 없음, inner 타입으로 매핑 |
| codegen_js.rs 변경 필요 | ❌ 불필요 | vaisx-compiler/codegen_js.rs는 JsType 직접 사용하지 않음 (vais-codegen-js에 위임) |

### 9.5 결론

Phase 136~140의 타입 시스템 변경은 VaisX JS codegen에 영향 없음:
1. **JsType enum**: 변경 없음, 새 코어 타입은 기존 JsType으로 매핑됨
2. **type_to_js() 매핑**: 이미 Lazy, Ref, Result 등의 매핑이 문서화되어 있으며, 신규 타입도 동일 패턴
3. **Vec/String/HashMap 메서드**: vais-codegen-js가 내부적으로 처리, VaisX에 투명
4. **vaisx-compiler/codegen_js.rs**: JsType을 직접 다루지 않으므로 변경 불필요
