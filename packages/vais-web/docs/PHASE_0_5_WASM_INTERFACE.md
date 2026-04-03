# WASM Component Model 인터페이스 조사 결과

> **대상**: `vais-codegen/src/wasm_component/` 모듈 (vais 코어 Phase 139+)
> **목적**: VaisX `#[wasm]` 함수에서 재사용할 인터페이스 문서화
> **날짜**: 2026-03-11

---

## 1. 모듈 구조 개요

```
vais-codegen/src/wasm_component/
├── mod.rs           # 모듈 진입점 + 공개 re-export
├── types.rs         # WIT 타입 정의 (WitType, WitField, WitRecord 등)
├── bindgen.rs       # JS/TS 바인딩 생성기 (WasmBindgenGenerator)
├── conversion.rs    # Vais ResolvedType → WitType 변환 (vais_type_to_wit)
├── interface.rs     # WIT interface, resource, world 정의
├── link_config.rs   # Component 링킹 설정 (ComponentLinkConfig)
├── package.rs       # WIT 패키지 관리 (WitPackage)
├── serialization.rs # JS↔WASM 직렬화 헬퍼 (WasmSerializer)
├── wasi.rs          # WASI 매니페스트 관리 (WasiManifest)
└── tests.rs         # 테스트
```

---

## 2. 핵심 타입 정의 (types.rs)

### 2.1 WitType (WIT 타입 열거형)

```rust
pub enum WitType {
    // 원시 타입
    Bool, U8, U16, U32, U64, S8, S16, S32, S64, F32, F64, Char, String,
    // 컨테이너 타입
    List(Box<WitType>),
    Option_(Box<WitType>),
    Result_ { ok: Option<Box<WitType>>, err: Option<Box<WitType>> },
    Tuple(Vec<WitType>),
    // 명명 타입
    Record(String), Variant(String), Enum(String),
    Flags(String), Resource(String), Named(String),
}
```

`Display` 트레이트 구현으로 WIT 문법 출력 지원 (`list<string>`, `option<u32>`, `result<T, E>` 등).

### 2.2 레코드/배리언트/열거형/플래그 정의

| 타입 | 구조체 | 주요 필드 |
|------|--------|----------|
| `WitField` | 레코드 필드 | `name: String`, `ty: WitType`, `docs: Option<String>` |
| `WitRecord` | 레코드 정의 | `name`, `fields: Vec<WitField>`, `docs` |
| `WitVariantCase` | 배리언트 케이스 | `name`, `ty: Option<WitType>`, `docs` |
| `WitVariant` | 배리언트 정의 | `name`, `cases: Vec<WitVariantCase>`, `docs` |
| `WitEnumCase` | 열거형 케이스 | `name`, `docs` |
| `WitEnum` | 열거형 정의 | `name`, `cases: Vec<WitEnumCase>`, `docs` |
| `WitFlags` | 플래그 정의 | `name`, `flags: Vec<String>`, `docs` |

### 2.3 함수 관련 타입

```rust
pub struct WitParam { pub name: String, pub ty: WitType }
pub enum WitResult { Named(Vec<WitParam>), Anon(WitType) }
pub struct WitFunction {
    pub name: String,
    pub params: Vec<WitParam>,
    pub results: Option<WitResult>,
    pub docs: Option<String>,
}
pub enum WitTypeDefinition {
    Record(WitRecord), Variant(WitVariant), Enum(WitEnum),
    Flags(WitFlags), Type { name: String, ty: WitType },
}
```

---

## 3. JS/TS 바인딩 생성 (bindgen.rs)

### 3.1 WasmBindgenGenerator API

```rust
pub struct WasmBindgenGenerator {
    pub module_name: String,
}

impl WasmBindgenGenerator {
    pub fn new(module_name: &str) -> Self;
    pub fn generate_js_bindings(&self, funcs: &[WitFunction]) -> String;
    pub fn generate_ts_declarations(&self, funcs: &[WitFunction]) -> String;
}
```

### 3.2 generate_js_bindings() 출력 구조

```javascript
// Generated JavaScript bindings for {module_name}
export class VaisModule {
  constructor(instance) {
    this.instance = instance;
    this.exports = instance.exports;
  }

  // 각 WitFunction에 대해:
  functionName(param1, param2) {
    // 파라미터 변환 (String/List는 자동 변환)
    const result = this.exports.functionName(param1, param2);
    // 결과 변환
    return result;
  }

  // 타입 변환 헬퍼
  _convert_string(str) { ... }
  _convert_from_string(ptr) { ... }
  _convert_list(array) { ... }
  _convert_from_list(ptr) { ... }
}

// 모듈 로더
export async function load{ModuleName}() {
  const response = await fetch('{module_name}.wasm');
  const bytes = await response.arrayBuffer();
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {});
  return new VaisModule(instance);
}
```

### 3.3 generate_ts_declarations() 출력 구조

```typescript
export class VaisModule {
  constructor(instance: WebAssembly.Instance);
  functionName(a: number, b: number): number;
}
export function load{ModuleName}(): Promise<VaisModule>;
```

### 3.4 타입 변환 매핑

| WitType | JS 타입명 | TS 타입 | 변환 필요 |
|---------|----------|---------|----------|
| Bool | `value` | `boolean` | No |
| U8~U64, S8~S64, F32, F64 | `value` | `number` | No |
| Char | `value` | `string` | No |
| String | `string` | `string` | Yes |
| List(T) | `list` | `Array<T>` | Yes |
| Option_(T) | - | `T \| null` | No |
| Result_ | - | `{ ok: T } \| { err: E }` | No |
| Tuple(Ts) | - | `[T1, T2, ...]` | No |
| Record/Variant/Enum/Flags/Resource/Named | - | 이름 그대로 | No |

**변환 필요 타입**: `String`과 `List`만 JS↔WASM 변환 코드가 자동 삽입됨 (`needs_conversion()`).

---

## 4. Vais 타입 → WIT 타입 변환 (conversion.rs)

### 4.1 vais_type_to_wit() API

```rust
pub fn vais_type_to_wit(ty: &ResolvedType) -> Option<WitType>;
```

### 4.2 변환 매핑 테이블

| Vais ResolvedType | WitType | 비고 |
|-------------------|---------|------|
| Bool | Bool | |
| U8/U16/U32/U64 | U8/U16/U32/U64 | |
| I8/I16/I32/I64 | S8/S16/S32/S64 | Vais `I` → WIT `S` (signed) |
| F32/F64 | F32/F64 | |
| Str | String | |
| Array(T) | List(T) | 재귀 변환 |
| ConstArray { element, .. } | List(T) | WIT에 고정 크기 배열 없음 |
| Optional(T) | Option_(T) | 재귀 변환 |
| Result(ok, err) | Result_ { ok, err } | 재귀 변환 |
| Tuple(Ts) | Tuple(Ts) | 재귀 변환 |
| Named { name, .. } | Named(name) | 커스텀 타입 |
| 기타 (Pointer, Ref, Fn 등) | None | WIT으로 매핑 불가 |

---

## 5. WIT 인터페이스/월드/리소스 (interface.rs)

### 5.1 WitInterface

```rust
pub struct WitInterface {
    pub name: String,
    pub types: Vec<WitTypeDefinition>,
    pub functions: Vec<WitFunction>,
    pub resources: Vec<WitResource>,
    pub docs: Option<String>,
}
```

### 5.2 WitResource (OOP 스타일 WASM 리소스)

```rust
pub struct WitResource {
    pub name: String,
    pub methods: Vec<WitResourceMethod>,
    pub docs: Option<String>,
}

pub struct WitResourceMethod {
    pub name: String,
    pub kind: WitMethodKind,  // Constructor | Static | Method
    pub params: Vec<WitParam>,
    pub results: Option<WitResult>,
    pub docs: Option<String>,
}
```

### 5.3 WitWorld (컴포넌트 최상위 인터페이스)

```rust
pub struct WitWorld {
    pub name: String,
    pub imports: Vec<WitImport>,   // WitImportItem: Interface(String) | Function(WitFunction)
    pub exports: Vec<WitExport>,   // WitExportItem: Interface(String) | Function(WitFunction)
    pub docs: Option<String>,
}
```

---

## 6. 직렬화 (serialization.rs)

### 6.1 WasmSerializer API

```rust
pub struct WasmSerializer { pub alignment: usize }  // 기본 4바이트 (wasm32)

impl WasmSerializer {
    pub fn new() -> Self;
    pub fn wit_type_size(&self, ty: &WitType) -> usize;
    pub fn aligned_size(&self, ty: &WitType) -> usize;
    pub fn generate_js_write(&self, ty: &WitType, var_name: &str, offset_expr: &str) -> String;
    pub fn generate_js_read(&self, ty: &WitType, offset_expr: &str) -> String;
    pub fn generate_js_serde_module(&self) -> String;  // WasmSerde 클래스 생성
    pub fn generate_wasm_serde_ir(&self) -> String;     // LLVM IR 헬퍼
}
```

### 6.2 메모리 레이아웃

| WitType | 크기 (bytes) | 비고 |
|---------|-------------|------|
| Bool, U8, S8 | 1 | |
| U16, S16 | 2 | |
| U32, S32, F32, Char | 4 | |
| U64, S64, F64 | 8 | |
| String | 8 | ptr(4) + len(4) in wasm32 |
| List(T) | 8 | ptr(4) + len(4) in wasm32 |
| Option_(T) | 8 | tag(4) + value(4+) |
| Result_ | 8 | tag(4) + payload(4+) |
| Record/Named 등 | 4 | pointer |

### 6.3 WasmSerde 클래스 (JS 런타임 헬퍼)

`generate_js_serde_module()`이 생성하는 JS 클래스:

```javascript
export class WasmSerde {
  constructor(memory, alloc, dealloc);
  writeString(str) → { ptr, len }
  readString(ptr, len) → string
  writeArray(arr, elemSize, writeFn) → { ptr, len }
  readArray(ptr, len, elemSize, readFn) → array
  writeStruct(obj, layout) → ptr
  readStruct(ptr, layout) → object
  writeOption(val, writeFn) → ptr
  readOption(ptr, readFn) → value | null
  writeResult(val, writeOkFn, writeErrFn) → ptr
  readResult(ptr, readOkFn, readErrFn) → { ok: T } | { err: E }
}
```

---

## 7. 링킹/패키지/WASI 관리

### 7.1 ComponentLinkConfig (link_config.rs)

```rust
pub struct ComponentLinkConfig {
    pub adapter_module: Option<String>,
    pub reactor_mode: bool,
    pub command_mode: bool,
    pub component_imports: HashMap<String, String>,
    pub component_exports: HashMap<String, String>,
    pub wasi_manifest: Option<WasiManifest>,
}

impl ComponentLinkConfig {
    pub fn new() -> Self;
    pub fn reactor(self) -> Self;
    pub fn command(self) -> Self;
    pub fn with_adapter(self, path: &str) -> Self;
    pub fn with_wasi_manifest(self, manifest: WasiManifest) -> Self;
    pub fn to_link_args(&self) -> Vec<String>;
}
```

### 7.2 WitPackage (package.rs)

```rust
pub struct WitPackage {
    pub namespace: String,
    pub name: String,
    pub version: Option<String>,
    pub interfaces: Vec<WitInterface>,
    pub worlds: Vec<WitWorld>,
    pub docs: Option<String>,
}

impl WitPackage {
    pub fn new(namespace: &str, name: &str) -> Self;
    pub fn with_version(self, version: &str) -> Self;
    pub fn add_interface(&mut self, interface: WitInterface);
    pub fn add_world(&mut self, world: WitWorld);
    pub fn to_wit_string(&self) -> String;
}
```

### 7.3 WasiManifest (wasi.rs)

```rust
pub struct WasiManifest {
    pub imports: Vec<String>,
    pub exports: HashMap<String, WitType>,
}

impl WasiManifest {
    pub fn new() -> Self;
    pub fn add_import(&mut self, interface: &str);
    pub fn add_export(&mut self, name: &str, wit_type: &WitType);
    pub fn to_wit_string(&self) -> String;
}
```

---

## 8. VaisX `#[wasm]` 함수에서 재사용할 인터페이스

### 8.1 재사용 대상 API

VaisX의 `codegen_wasm.rs`가 `#[wasm]` 함수 처리 시 사용할 코어 API:

| API | 용도 | VaisX 활용 시나리오 |
|-----|------|-------------------|
| `vais_type_to_wit(ty)` | Vais 타입 → WIT 타입 변환 | `#[wasm]` 함수 시그니처의 파라미터/반환 타입 변환 |
| `WasmBindgenGenerator::new(name)` | 바인딩 생성기 초기화 | 컴포넌트별 모듈 이름 설정 |
| `generator.generate_js_bindings(funcs)` | JS 글루 코드 생성 | `#[wasm]` 함수에 대한 JS 래퍼 자동 생성 |
| `generator.generate_ts_declarations(funcs)` | TS 타입 선언 생성 | 타입 안전한 호출 보장 |
| `WasmSerializer::generate_js_serde_module()` | 직렬화 헬퍼 생성 | 복잡한 타입 (struct, array, string) 전달 시 사용 |
| `WasmSerializer::generate_js_write/read()` | 개별 타입 직렬화 코드 | 인라인 직렬화 코드 생성 |
| `ComponentLinkConfig` | WASI 어댑터 설정 | 서버 사이드 WASM 실행 시 |

### 8.2 VaisX `#[wasm]` 함수 처리 흐름 (예상)

```
1. vaisx-parser: #[wasm] 어트리뷰트 감지
2. vaisx-compiler/codegen_wasm.rs:
   a. 함수 시그니처에서 파라미터/반환 타입 추출
   b. vais_type_to_wit()로 WIT 타입 변환
   c. WitFunction 객체 생성
   d. WasmBindgenGenerator::generate_js_bindings()로 JS 글루 코드 생성
   e. (필요 시) WasmSerializer로 복잡한 타입 직렬화 코드 생성
   f. JS 파일에 import + WASM 로드 코드 삽입
```

### 8.3 주의사항

- `vais_type_to_wit()`는 `ResolvedType`을 입력으로 받으므로, 타입 체킹 이후 호출해야 함
- Pointer, Ref, Fn 등 WIT으로 매핑 불가한 타입이 `#[wasm]` 함수 시그니처에 있으면 에러 처리 필요
- `needs_conversion()`은 현재 String과 List만 처리 -- 향후 Record 등 복합 타입 지원 확장 필요
- 서버 사이드 WASM 실행 시 `ComponentLinkConfig`와 `WasiManifest` 활용
