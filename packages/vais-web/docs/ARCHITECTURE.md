# VaisX / VaisKit 아키텍처 설계

> **버전**: 0.1.0 (초안)
> **날짜**: 2026-02-09
> **선행 조건**: Vais 언어의 WASM↔JS Interop (vais-codegen wasm_component 모듈) + JS 코드 생성 백엔드 (vais-codegen-js 크레이트)

---

## 1. 프로젝트 개요

### 1.1 비전

Next.js의 풀스택 역량 + Svelte의 컴파일러 우선 경량성 + Vais의 토큰 효율성을 결합한 프론트엔드 프레임워크.

### 1.2 두 레이어

| 레이어 | 역할 | 비유 |
|--------|------|------|
| **VaisX** | UI 컴포넌트 + 반응성. `.vaisx` 컴파일러 + 소형 런타임 | Svelte (컴파일러) |
| **VaisKit** | 앱 프레임워크. 라우팅, SSR/SSG, 서버 연동, 배포 어댑터 | SvelteKit + Next.js (프레임워크) |

### 1.3 설계 원칙

1. **컴파일러 우선**: 런타임은 최소화, 가능한 모든 것을 빌드 타임에 해결
2. **토큰 효율성**: Vais 단일 문자 키워드 활용 — AI 코드 생성 시 30%+ 토큰 절감
3. **DOM은 도구**: Virtual DOM 없이 컴파일러가 정확한 DOM 업데이트 코드를 생성
4. **하이브리드 출력**: UI 로직 → JS, 계산 집약 → WASM, 자동 분리
5. **점진적 복잡성**: 간단한 앱은 간단하게, 복잡한 앱은 가능하게

---

## 2. 모노레포 구조

```
vais-web/
├── crates/                         # Rust 크레이트 (컴파일러)
│   ├── vaisx-parser/               # .vaisx 파일 파서
│   │   ├── src/
│   │   │   ├── lib.rs              # 진입점
│   │   │   ├── lexer.rs            # .vaisx 전용 렉서 (template/style 블록)
│   │   │   ├── template.rs         # <template> 블록 파서
│   │   │   ├── style.rs            # <style> 블록 파서
│   │   │   └── ast.rs              # VaisX 전용 AST 노드
│   │   └── Cargo.toml
│   │
│   ├── vaisx-compiler/             # 반응성 분석 + 코드 생성
│   │   ├── src/
│   │   │   ├── lib.rs              # 컴파일 파이프라인 오케스트레이션
│   │   │   ├── analyze.rs          # 반응성 의존성 그래프 분석
│   │   │   ├── codegen_js.rs       # JS 코드 생성 (DOM 업데이트)
│   │   │   ├── codegen_wasm.rs     # WASM 코드 생성 (계산 집약)
│   │   │   ├── codegen_ssr.rs      # SSR용 HTML 문자열 생성
│   │   │   └── optimize.rs         # 컴파일 타임 최적화
│   │   └── Cargo.toml
│   │
│   └── vaisx-cli/                  # CLI 도구 (vaisx dev/build/start)
│       ├── src/
│       │   └── main.rs
│       └── Cargo.toml
│
├── packages/                       # JS/TS 패키지
│   ├── vaisx-runtime/              # VaisX 소형 런타임 (< 3KB gzipped)
│   │   ├── src/
│   │   │   ├── index.ts            # 진입점
│   │   │   ├── signal.ts           # 시그널 런타임 (컴파일러 미해결 부분용)
│   │   │   ├── scheduler.ts        # DOM 업데이트 배치 스케줄러
│   │   │   ├── event.ts            # 이벤트 위임
│   │   │   └── lifecycle.ts        # 컴포넌트 생명주기
│   │   └── package.json
│   │
│   ├── vaiskit/                    # VaisKit 앱 프레임워크
│   │   ├── src/
│   │   │   ├── index.ts            # 진입점
│   │   │   ├── router.ts           # 파일 기반 라우터
│   │   │   ├── ssr.ts              # 서버 사이드 렌더링
│   │   │   ├── ssg.ts              # 정적 사이트 생성
│   │   │   ├── server-component.ts # 서버 컴포넌트
│   │   │   ├── server-action.ts    # 서버 액션
│   │   │   ├── middleware.ts       # 미들웨어 시스템
│   │   │   └── adapters/           # 배포 어댑터
│   │   │       ├── node.ts
│   │   │       ├── static.ts
│   │   │       ├── vercel.ts
│   │   │       └── cloudflare.ts
│   │   └── package.json
│   │
│   └── vaisx-hmr/                  # 핫 모듈 리플레이스먼트
│       ├── src/
│       │   ├── client.ts           # 브라우저 측 HMR 클라이언트
│       │   └── server.ts           # 파일 감시 + WebSocket 서버
│       └── package.json
│
├── std/                            # VaisX 표준 라이브러리 (.vaisx 컴포넌트)
│   ├── Button.vaisx
│   ├── Input.vaisx
│   ├── Link.vaisx
│   └── Head.vaisx
│
├── docs/                           # 설계 문서
│   └── ARCHITECTURE.md             # 이 파일
│
├── examples/                       # 예제 앱
│   ├── hello/                      # 최소 예제
│   ├── counter/                    # 반응성 데모
│   └── todo/                       # CRUD 앱
│
├── Cargo.toml                      # Rust 워크스페이스
├── package.json                    # pnpm 워크스페이스
├── pnpm-workspace.yaml
├── ROADMAP.md
├── CLAUDE.md
└── README.md
```

### 2.1 패키지 네이밍 규칙

| 디렉토리 | npm 패키지명 (package.json `name`) | import 경로 |
|----------|-----------------------------------|------------|
| `packages/vaisx-runtime/` | `@vaisx/runtime` | `import { ... } from "@vaisx/runtime"` |
| `packages/vaiskit/` | `@vaisx/kit` | `import { ... } from "@vaisx/kit"` |
| `packages/vaisx-hmr/` | `@vaisx/hmr` | `import { ... } from "@vaisx/hmr"` |

> pnpm workspace에서 디렉토리명과 패키지명이 다를 수 있으므로 반드시 package.json의 `name` 필드를 canonical name으로 사용한다.

### 2.2 빌드 도구

- **Rust 크레이트**: `cargo` 워크스페이스
- **JS 패키지**: `pnpm` 워크스페이스
- **연결**: vaisx-cli가 Rust 크레이트를 빌드하고, JS 패키지와 조합하여 최종 출력

---

## 3. .vaisx 파일 포맷 스펙

### 3.1 파일 구조

```vaisx
<script>
  # Vais 코드 — 기존 Vais 문법 그대로 사용
</script>

<template>
  # 선언적 마크업 — HTML + VaisX 지시문
</template>

<style>
  /* 스코프드 CSS */
</style>
```

3개 블록 모두 선택사항. 순서 무관.

### 3.2 `<script>` 블록 — 반응성 프리미티브

기존 Vais 문법에 3개 프리미티브 추가.

> **파싱 전략**: `$state`/`$derived`/`$effect`는 코어 vais-parser에 추가하지 **않는다**.
> vaisx-parser가 `<script>` 블록을 코어 파서에 넘기기 전에 전처리(desugar)한다:
> - `$state(x)` → `__vx_state(x)` (일반 함수 호출로 변환)
> - `$derived(expr)` → `__vx_derived(|| { expr })` (클로저로 변환)
> - `$effect { body }` → `__vx_effect(|| { body })` (클로저로 변환)
>
> 코어 파서는 `$` 토큰을 매크로 메타변수 문맥에서만 처리하므로, 이 전처리가 없으면
> `$state(0)`이 매크로 패턴으로 파싱되어 에러가 발생한다.
> 전처리 후 코어 파서는 `__vx_*`를 일반 함수 호출로 정상 파싱한다.
>
> **코어 호환성 검증 결과 (vais 코어 Phase 139+ 기준):**
>
> | desugar 변환 | 호환성 | 변환 레벨 | 비고 |
> |-------------|--------|----------|------|
> | `$state(x)` → `__vx_state(x)` | ✅ 호환 | 소스 텍스트 또는 토큰 스트림 | `$`는 `Token::Dollar`, `state`는 `Token::Ident` — 2토큰으로 분리됨 |
> | `$derived(expr)` → `__vx_derived(\|\| { expr })` | ✅ 호환 | 소스 텍스트 또는 토큰 스트림 | 코어 파서가 빈 파라미터 클로저 `\|\|` 완벽 지원 |
> | `$effect { body }` → `__vx_effect(\|\| { body })` | ✅ 호환 | 소스 텍스트 또는 토큰 스트림 | 동일 |
> | `P { }` → `S __VxProps__ { }` | ⚠️ 충돌 | **소스 텍스트만** | `P`가 `Token::Pub`으로 토큰화되므로 lexing 전에 변환 필수 |
> | `emit x()` → `__vx_emit("x")` | ✅ 호환 | 소스 텍스트 또는 토큰 스트림 | `emit`은 코어 키워드 아님 (일반 식별자) |
> | `__vx_*` 식별자 | ✅ 호환 | — | 더블 언더스코어 식별자가 코어 lexer에서 유효 |
> | `#[server]`, `#[wasm]` | ✅ 호환 | — | Attribute passthrough (코어에서 의미 처리 안 함, key=value args 지원) |
>
> **결론**: `P { }` 변환만 소스 텍스트 레벨 필수, 나머지는 토큰 스트림 레벨에서도 가능.
> 일관성을 위해 모든 desugar를 소스 텍스트 레벨에서 수행하는 것을 권장.

```vaisx
<script>
  # 반응성 상태 — 변경 시 관련 DOM 자동 업데이트
  count := $state(0)
  name := $state("world")

  # 파생 값 — 의존하는 상태가 변경되면 자동 재계산
  doubled := $derived(count * 2)
  greeting := $derived("Hello, " + name + "!")

  # 부수효과 — 의존하는 상태가 변경되면 자동 실행
  $effect {
    console_log("count changed: ", count)
  }

  # 일반 Vais 함수
  F increment() {
    count += 1
  }

  F reset() {
    count = 0
    name = "world"
  }

  # 서버 전용 함수 (서버 컴포넌트 / 서버 액션)
  #[server]
  A F loadItems() -> Vec<Item> {
    db.query("SELECT * FROM items")
  }

  #[server]
  A F saveItem(item: Item) -> Result<Item, Error> {
    db.insert("items", item)
  }
</script>
```

**프리미티브 정리:**

| 프리미티브 | 문법 | 역할 | 컴파일 결과 |
|-----------|------|------|------------|
| `$state(초기값)` | `x := $state(0)` | 반응성 상태 선언 | getter/setter + 구독자 알림 코드 |
| `$derived(표현식)` | `y := $derived(x * 2)` | 파생 값 (메모이제이션) | 의존성 변경 시만 재계산하는 코드 |
| `$effect { ... }` | `$effect { log(x) }` | 부수효과 | 의존성 변경 시 실행하는 코드 |

### 3.3 `<template>` 블록 — 선언적 마크업

HTML 기반 + VaisX 지시문:

```vaisx
<template>
  # 텍스트 보간
  <h1>{greeting}</h1>
  <p>Count: {count}, Doubled: {doubled}</p>

  # 이벤트 바인딩
  <button @click={increment}>+1</button>
  <button @click={reset}>Reset</button>

  # 양방향 바인딩
  <input :value={name} />

  # 조건부 렌더링
  @if count > 10 {
    <p class="warning">Too high!</p>
  } @elif count > 5 {
    <p class="caution">Getting high</p>
  } @else {
    <p>Normal</p>
  }

  # 리스트 렌더링
  @each items -> item, index {
    <li key={item.id}>
      {index}: {item.name}
    </li>
  }

  # Await 블록 (비동기 데이터)
  @await loadItems() {
    loading => <p>Loading...</p>
    ok(items) => {
      @each items -> item {
        <ItemCard item={item} />
      }
    }
    err(e) => <p class="error">{e.message}</p>
  }

  # 컴포넌트 사용
  <Counter initial={5} />
  <UserCard user={currentUser} @select={handleSelect} />

  # 슬롯
  <Layout>
    <:header>
      <h1>My App</h1>
    </:header>
    <:default>
      <p>Content here</p>
    </:default>
  </Layout>
</template>
```

**지시문 정리:**

| 지시문 | 문법 | 역할 |
|--------|------|------|
| `{expr}` | `{count}` | 텍스트 보간 |
| `@click={fn}` | `@click={handler}` | 이벤트 바인딩 |
| `:attr={expr}` | `:value={name}` | 양방향 바인딩 (attr + 이벤트) |
| `@if / @elif / @else` | `@if cond { ... }` | 조건부 렌더링 |
| `@each` | `@each list -> item { ... }` | 리스트 렌더링 |
| `@await` | `@await promise { ... }` | 비동기 데이터 |
| `<:name>` | `<:header>...</:header>` | 네임드 슬롯 |

**Vais 문법과의 일관성:**
- `@if` / `@each` / `@await` — Vais의 `I` / `L` / `A`와 대응하되, 템플릿에서는 가독성을 위해 `@` 접두사 + 영문 키워드 사용
- `{ }` 블록 구분 — Vais와 동일
- `->` 화살표 — Vais 클로저 문법과 동일

### 3.4 `<style>` 블록 — 스코프드 CSS

```vaisx
<style>
  /* 이 컴포넌트에만 적용 (자동 스코핑) */
  h1 { color: blue; }
  .warning { color: red; }
</style>

<style global>
  /* 전역 스타일 */
  body { margin: 0; }
</style>
```

- 기본: 자동 스코핑 (컴파일 시 고유 클래스 추가)
- `global` 키워드: 전역 스타일
- 사용하지 않는 CSS 규칙은 컴파일 시 자동 제거

### 3.5 컴포넌트 Props & 이벤트

```vaisx
# UserCard.vaisx

<script>
  # Props 선언 — Vais 구조체 문법 활용
  P {
    user: User
    showAvatar: bool = true       # 기본값
    emit select(user: User)       # 이벤트 prop (부모에게 전달)
  }

  F handleClick() {
    emit select(user)
  }
</script>

<template>
  <div class="card" @click={handleClick}>
    @if showAvatar {
      <img src={user.avatar} />
    }
    <span>{user.name}</span>
  </div>
</template>
```

**`P { }` 블록**: 컴포넌트 Props 선언
- Vais의 `S` (struct)와 유사하지만, 반응성 + 기본값 + 이벤트 지원
- `emit eventName(params)` — 부모에게 이벤트 방출

> **파싱 전략 — `P { }` desugar**:
> vaisx-parser가 `P { }` 블록을 코어 파서에 넘기기 전에 변환한다:
> ```
> P {                                  S __VxProps__ {
>   user: User                →          user: User
>   showAvatar: bool = true              showAvatar: bool    # 기본값은 별도 메타데이터로 저장
>   emit select(user: User)              # emit은 제거 → 이벤트 테이블로 분리
> }                                    }
> ```
> - 일반 필드 → 구조체 필드로 변환, 기본값은 AST 메타데이터에 저장
> - `emit` 선언 → Props AST에서 분리하여 이벤트 테이블로 관리
> - `emit eventName(args)` 호출 → `__vx_emit("eventName", args)` 함수 호출로 변환
>
> **⚠️ `P` 토큰 충돌 주의:**
> 코어 vais-lexer에서 `P`는 `Token::Pub` (공개 접근자)로 정의되어 있다 (우선순위 3).
> 따라서 `P {`를 코어 lexer에 넘기면 `Token::Pub + Token::LBrace`로 토큰화되어
> "public visibility 뒤에 유효한 선언이 없음" 파싱 에러가 발생한다.
>
> **해결**: `P { }` → `S __VxProps__ { }` 변환은 반드시 **소스 텍스트 레벨에서**
> (코어 lexer 호출 전에) 수행해야 한다. 토큰 스트림 변환으로는 불가능하다.

> **`@` 접두사 규칙 — 문맥별 의미 분리**:
> `@`는 **`<template>` 블록에서만** 사용되며, 항상 DOM 이벤트 바인딩을 의미한다:
> - `@click={handler}` — DOM 이벤트
> - `@select={handler}` — 자식 컴포넌트의 emit 이벤트 수신
>
> `<script>` 블록에서 이벤트 방출은 `emit` 키워드를 사용한다:
> - `emit select(user)` — 이벤트 방출 (desugar: `__vx_emit("select", user)`)
>
> 이렇게 분리하면 파서가 문맥 없이 토큰만으로 판별 가능:
> ```
> <script> 내 @ → 파싱 에러 (사용 금지)
> <template> 내 @ → 이벤트 바인딩
> <script> 내 emit → 이벤트 방출
> ```

---

## 4. 컴파일 파이프라인

### 4.1 전체 흐름

```
.vaisx 파일
    │
    ├─ <script> ──→ vaisx-parser: desugar ──→ vais-parser (기존) ──→ Vais AST
    │               ($state → __vx_state 등)                           │
    │                                                                  │
    ├─ <template> ─→ vaisx-parser (신규) ──→ Template AST              │
    │                                                                  │
    ├─ <style> ───→ vaisx-parser (CSS) ───→ Style AST                  │
    │                                                                  │
    └───────────────────────┬──────────────────────────────────────────┘
                            ▼
              vaisx-compiler: 반응성 분석
              (의존성 그래프 생성, __vx_* 호출을 시그널로 인식)
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
        codegen_js   codegen_ssr  codegen_wasm
        (클라이언트)  (서버 렌더)   (계산 집약)
            │           │           │
            ▼           ▼           ▼
        .js 파일     HTML 문자열   .wasm 파일
        + runtime    (SSR/SSG)
```

### 4.2 반응성 분석 (핵심)

컴파일러가 `<script>`와 `<template>`를 분석하여 의존성 그래프를 빌드:

```
입력:
  count := $state(0)
  doubled := $derived(count * 2)
  <p>{doubled}</p>

분석 결과:
  count → doubled → <p> 텍스트 노드

생성 코드 (JS):
  // 초기화
  let count = 0;
  let doubled = count * 2;
  const p_text = document.createTextNode(doubled);

  // 업데이트 함수 (count 변경 시)
  function $$update_count(newVal) {
    count = newVal;
    doubled = count * 2;      // derived 재계산
    p_text.data = doubled;     // DOM 직접 업데이트
  }
```

**핵심**: Virtual DOM diffing 없음. 컴파일러가 `count` → `doubled` → `<p>` 관계를 정적으로 파악하여 정확한 업데이트 코드를 생성.

### 4.2.1 상태 변경 감지 — 컴파일 타임 변환

`$state` 변수에 대한 **모든 할당/수정을 컴파일러가 `$$update_xxx()` 호출로 변환**한다.
런타임 Proxy/getter-setter는 사용하지 않는다 (성능 + 런타임 크기 이유).

```
변환 규칙:

  소스 코드                    컴파일 출력
  ─────────────────────────    ─────────────────────────
  count := $state(0)           let count = 0;
  count = 5                    $$update_count(5);
  count += 1                   $$update_count(count + 1);
  count -= 3                   $$update_count(count - 3);
  count++                      $$update_count(count + 1);
```

**컴파일러의 역할:**
1. `$state` 변수 목록을 수집한다 (desugar 단계에서 `__vx_state` 호출을 인식)
2. AST를 순회하면서, 해당 변수에 대한 모든 할당/복합 할당/증감 표현식을 찾는다
3. 각각을 `$$update_xxx(새값)` 호출로 변환한다
4. `$$update_xxx` 함수 본문에는 의존성 그래프에 따라 파생값 재계산 + DOM 업데이트 코드가 포함된다

**예시:**
```vaisx
# 소스
count := $state(0)
doubled := $derived(count * 2)
F increment() { count += 1 }
F reset() { count = 0 }
```

```js
// 컴파일 출력
let count = 0;
let doubled = 0;

function $$update_count(v) {
  count = v;
  doubled = count * 2;        // derived 재계산
  $$schedule(() => {
    button_text.data = count;  // DOM 업데이트
    span_text.data = doubled;  // DOM 업데이트
  });
}

function increment() { $$update_count(count + 1); }
function reset() { $$update_count(0); }
```

**한계 — 동적 의존성 (런타임 시그널 폴백):**
컴파일 타임에 분석할 수 없는 경우 런타임 시그널로 폴백:
```vaisx
# 동적 접근 — 컴파일 타임에 어떤 state가 읽히는지 알 수 없음
obj := $state({ a: 1, b: 2 })
key := $state("a")
value := $derived(obj[key])   # key가 런타임에 결정됨
```
이 경우 `@vaisx/runtime`의 동적 시그널 (`$$signal`, `$$computed`)이 사용된다.

### 4.3 컴파일 출력 예시

**입력 (counter.vaisx):**
```vaisx
<script>
  count := $state(0)
  F increment() { count += 1 }
</script>

<template>
  <button @click={increment}>{count}</button>
</template>
```

**출력 (counter.js):**
```js
import { $$listen, $$text, $$element, $$append } from "@vaisx/runtime";

export default function Counter($$target) {
  let count = 0;

  // DOM 생성
  const button = $$element("button");
  const button_text = $$text(count);
  $$append(button, button_text);
  $$append($$target, button);

  // 이벤트
  $$listen(button, "click", () => {
    count += 1;
    button_text.data = count;  // 직접 업데이트
  });

  return {
    destroy() { button.remove(); }
  };
}
```

**런타임 함수**: `$$element`, `$$text`, `$$append`, `$$listen` — 각각 1~3줄의 초경량 헬퍼.

### 4.4 하이브리드 출력 (JS + WASM)

`#[wasm]` 어트리뷰트가 붙은 함수는 WASM으로 컴파일:

```vaisx
<script>
  data := $state([])

  # 이 함수는 WASM으로 컴파일됨
  #[wasm]
  F processData(raw: Vec<f64>) -> Vec<DataPoint> {
    raw |> filter(|x| x > 0.0)
        |> map(|x| DataPoint { value: x, normalized: x / max(raw) })
        |> sort_by(|a, b| a.value - b.value)
  }

  # 이 함수는 JS로 컴파일됨 (DOM 관련)
  A F loadAndProcess() {
    raw := await fetch_data("/api/data")
    data = processData(raw)
  }
</script>
```

컴파일러가 자동으로:
1. `processData` → `.wasm` 파일
2. `loadAndProcess` + 나머지 → `.js` 파일
3. JS에서 WASM 함수를 `import`하는 글루 코드 생성

**코어 WASM 인프라 (vais-codegen/wasm_component/):**

vais 코어에는 WASM Component Model (WASI Preview 2) 지원이 이미 구현되어 있다.
vaisx-compiler의 `codegen_wasm.rs`는 이 인프라를 재사용한다:

| 코어 모듈 | 역할 | vaisx 활용 |
|-----------|------|-----------|
| `types.rs` | WIT (WebAssembly Interface Types) 정의 — WitType, WitFunction 등 | `#[wasm]` 함수의 타입 매핑 |
| `interface.rs` | WIT interface, resource, world 정의 | 컴포넌트 간 인터페이스 |
| `bindgen.rs` | JS/TS 바인딩 생성 (wasm-bindgen 스타일) | JS↔WASM 글루 코드 자동 생성 |
| `wasi.rs` | WASI 매니페스트 관리 | 서버 사이드 WASM 실행 |
| `conversion.rs` | Vais Type → WIT Type 자동 변환 | `#[wasm]` 함수 시그니처 변환 |
| `link_config.rs` | Component 링킹 설정 | WASI 어댑터 구성 |
| `serialization.rs` | WASM 메타데이터 직렬화 (MessagePack/Protobuf) | 컴포넌트 메타데이터 |
| `package.rs` | WIT 패키지 관리 | 패키지 버전 관리 |

> `bindgen.rs`의 `generate_js_bindings()`와 `generate_ts_declarations()`를 활용하면
> `#[wasm]` 함수에 대한 JS 글루 코드와 TypeScript 타입 선언이 자동 생성된다.

### 4.5 리스트 재조정 (Reconciliation)

`@each`에서 `key` 속성이 있을 때, 리스트 변경 시의 DOM 업데이트 전략:

```
알고리즘: Keyed LIS (Longest Increasing Subsequence) 방식
  — Svelte/ivi/Inferno와 동일한 O(n log n) 알고리즘

1. 새 리스트와 이전 리스트의 key를 비교
2. LIS를 계산하여 이동이 최소인 노드를 식별
3. 삭제 → 이동 → 삽입 순서로 DOM 조작

key 없는 @each:
  index 기반 비교 — 순서만 매칭, 아이템 교체 시 전체 재렌더
  (컴파일러 경고: "key 사용을 권장합니다")
```

### 4.6 코드 스플리팅

라우트별 자동 코드 스플리팅:

```
app/
├── page.vaisx        → chunk-main.js
├── about/page.vaisx  → chunk-about.js  (lazy)
└── blog/page.vaisx   → chunk-blog.js   (lazy)

컴파일 출력:
  chunk-main.js          ← 즉시 로드
  chunk-about.[hash].js  ← /about 진입 시 동적 import
  chunk-blog.[hash].js   ← /blog 진입 시 동적 import
  runtime.[hash].js      ← @vaisx/runtime (모든 페이지 공유)
```

- 라우트별 `page.vaisx` → 별도 청크 (자동)
- 공유 컴포넌트 → 공통 청크로 분리 (사용 빈도 기반)
- `layout.vaisx` → 해당 레이아웃 하위 모든 라우트에 포함

### 4.7 에러 처리 전략

```
레이어별 에러 처리:

1. 컴파일 타임
   - .vaisx 파싱 에러 → 에러 복구 파싱 (vais-parser와 동일, 최대한 많은 AST 반환)
   - 반응성 분석 에러 → 구체적 에러 메시지 + 소스 위치
   - 타입 불일치 → 컴파일 에러 (빌드 실패)

2. 개발 서버 (dev 모드)
   - 컴파일 에러 → 브라우저에 에러 오버레이 표시 (Vite 스타일)
   - 런타임 에러 → 콘솔 + 에러 오버레이

3. 프로덕션 런타임
   - 컴포넌트 에러 → error.vaisx (Error Boundary)로 캐치
   - SSR 에러 → 500 응답 + error.vaisx 렌더링
   - 하이드레이션 실패 → 해당 컴포넌트만 클라이언트 재렌더 (전체 앱은 유지)
```

### 4.8 코어 의존성 참조 (vais-parser, vais-ast, vais-types)

vaisx-parser/compiler가 사용하는 코어 API 현황 (vais 코어 Phase 139+ 기준):

**vais-parser 공개 API:**
```rust
// 기본 파싱 — 에러 시 Err 반환
pub fn parse(source: &str) -> Result<Module, ParseError>

// 조건부 컴파일 지원 — cfg 값에 따라 코드 블록 포함/제외
pub fn parse_with_cfg(source: &str, cfg_values: HashMap<String, String>) -> Result<Module, ParseError>

// 에러 복구 파싱 — 에러가 있어도 최대한 많은 AST를 반환
pub fn parse_with_recovery(source: &str) -> (Module, Vec<ParseError>)
```

> vaisx-parser는 desugar 후 `parse()` 또는 `parse_with_recovery()`를 호출한다.
> 개발 서버에서는 `parse_with_recovery()`를 사용하여 부분 에러에도 AST를 반환.

**vais-ast 핵심 노드:**
- `Module { items: Vec<Spanned<Item>> }` — 최상위 모듈
- `Item` — Function, Struct, Enum, Union, TypeAlias, Use, Trait, Impl, Macro, ExternBlock, Const, Global
- `Function { name, generics, params, ret_type, body, is_pub, is_async, attributes, where_clause }`
- `Struct { name, fields, methods, generics, ... }`
- `Attribute { name: String, args: Vec<String> }` — `#[server]`, `#[wasm]` 등
- `Expr` — 25+ 변형 (Binary, Unary, Call, MethodCall, Field, Index, If, Loop, Match 등)
- `Spanned<T> { node: T, span: Span }` — 소스 위치 정보 포함

**vais-types 주요 타입 (ResolvedType):**
- 원시: I8~U128, F32/F64, Bool, Str, Unit
- 복합: Array, ConstArray, Tuple, Map, Optional, Result
- 참조: Ref, RefMut, Slice, SliceMut, Pointer, RefLifetime, RefMutLifetime
- 함수: Fn (with EffectSet), FnPtr, Future
- 고급: DynTrait, Associated (GAT), ImplTrait, Linear, Affine, Dependent, Lazy, HigherKinded
- 기타: Generic, ConstGeneric, Var (추론 변수), Vector (SIMD), Range, Never, Lifetime

> vaisx-compiler의 JS 코드 생성 시, vais-codegen-js의 `JsType` 매핑을 재사용한다:
> `JsType` — Number, BigInt, String, Boolean, Void, Array, Map, Object, Function, Nullable, Any

### 4.9 VaisX 컴파일러와 vais-codegen-js 크레이트의 관계

```
vais-codegen-js 크레이트                VaisX (vaisx-compiler/codegen_js.rs)
──────────────────────────────────────  ─────────────────────────────────────
Vais 함수/구조체 → JS 변환              반응성 분석 + DOM 업데이트 코드 생성
6,167줄의 성숙한 JS 코드 생성기         VaisX 전용 코드 생성 ($$update 등)
ESM 생성, Struct→ES6 class 변환
함수/열거형/트레이트/impl 블록 지원
트리쉐이킹, 소스맵 지원

관계: vaisx-compiler는 vais-codegen-js 크레이트를 라이브러리로 사용한다.
- <script> 내 일반 Vais 코드 (함수, 구조체 등) → vais-codegen-js에 위임
- 반응성 래퍼 ($$update, $$schedule 등) → vaisx-compiler가 직접 생성
- DOM 생성/업데이트 코드 → vaisx-compiler가 직접 생성

즉, vais-codegen-js 크레이트가 "범용 Vais→JS 변환기"이고,
vaisx-compiler는 그 위에 "반응성 + DOM 레이어"를 추가한다.
```

### 4.10 구현된 컴파일 파이프라인 (Phase 2 완료)

> **상태**: Phase 2 완료 (2026-03-11). 아래는 실제 구현된 파이프라인의 상세 설명.

#### 4.10.1 파이프라인 상세 흐름

```
.vaisx 파일
    │
    ▼
vaisx-parser (crates/vaisx-parser/)
    ├── lexer.rs:    블록 분리 (<script>/<template>/<style>)
    ├── desugar.rs:  소스 텍스트 전처리 (5가지 변환)
    │                $state → __vx_state, $derived → __vx_derived,
    │                $effect → __vx_effect, P{} → S __VxProps__{},
    │                emit → __vx_emit
    ├── template.rs: <template> 파서 (HTML + @if/@each/@await + 컴포넌트/슬롯)
    ├── style.rs:    <style> CSS 파서
    └── ast.rs:      VaisX AST 노드 정의
    │
    ▼
VaisxFile (파싱 결과)
    │
    ▼
vaisx-compiler (crates/vaisx-compiler/)
    ├── analyze.rs:  반응성 분석 → ComponentIR 빌드
    │   ├── extract_reactive_vars():  desugared source에서 __vx_state/__vx_derived/__vx_effect 추출
    │   ├── analyze_template_nodes(): template AST 순회 → 바인딩 수집
    │   └── DependencyGraph:          state → derived → effect → binding 관계 매핑
    │
    ├── ir.rs:       중간 표현 (ComponentIR, DependencyGraph, BindingKind)
    │
    └── codegen_js.rs: JS 코드 생성
        ├── 2패스 생성:  (1) 컴포넌트 본문 생성 → (2) import문 선행 추가
        ├── emit_state_vars():     let x = initValue;
        ├── emit_derived_vars():   let y = expr; (토폴로지 순서)
        ├── emit_functions():      function name() { ... $$schedule($$update); }
        ├── emit_template_nodes(): DOM 생성 ($$element, $$text, $$append, $$attr, $$listen)
        ├── emit_if_block():       @if → $$anchor + branch함수 + $$if_update
        ├── emit_each_block():     @each → $$anchor + render함수 + $$each_update
        ├── emit_await_block():    @await → loading/ok/err 분기 + Promise.then
        ├── emit_component_instantiation(): 자식 컴포넌트 생성/소멸
        ├── emit_update_function(): $$update() — derived 재계산 + DOM 갱신
        ├── emit_effects():        $$schedule(() => { effect_body })
        └── emit_lifecycle():      return { $$update, $$destroy() { ... } }
```

#### 4.10.2 ComponentIR 구조

```rust
ComponentIR {
    name: String,                    // 컴포넌트명 (파일명 기반)
    dependency_graph: DependencyGraph {
        state_vars: HashMap<name, ReactiveVar>,     // $state 변수
        derived_vars: HashMap<name, DerivedVar>,    // $derived 변수 (+ deps)
        effects: Vec<EffectVar>,                    // $effect 블록 (+ deps)
        bindings: Vec<TemplateBinding>,             // 템플릿 바인딩
        dependents: HashMap<name, Set<dep_key>>,    // 의존성 역방향 맵
    },
    props: Option<PropsIR>,          // P {} 블록에서 추출
    events: Vec<EventIR>,            // emit 선언
    has_reactivity: bool,            // 반응성 코드 존재 여부
    functions: Vec<FunctionIR>,      // 일반 함수 (F name() { })
}
```

#### 4.10.3 바인딩 종류 (BindingKind)

| 바인딩 | 템플릿 문법 | codegen 출력 |
|--------|-----------|------------|
| Text | `{expr}` | `$$text(expr)` + `$$set_text(node, expr)` in $$update |
| Attribute | `attr={expr}` | `$$attr(el, name, expr)` |
| TwoWay | `:prop={var}` | `$$attr` + `$$listen("input"/"change")` |
| Event | `@event={handler}` | `$$listen(el, event, handler, modifiers?)` |
| Conditional | `@if cond { }` | `$$anchor` + branch 함수 + `$$if_update` |
| List | `@each list -> item { }` | `$$anchor` + render 함수 + `$$each_update` |
| ComponentProp | `<Comp prop={expr}>` | props 객체에 포함 |

#### 4.10.4 상태 변이 감지 전략 (Phase 2 구현)

Phase 2에서는 4.2.1절의 `$$update_xxx()` 패턴 대신, 단순화된 접근을 채택:

```
소스 코드                     컴파일 출력
──────────────────────────    ──────────────────────────
count := $state(0)            let count = 0;
F increment() {               function increment() {
  count += 1                    count += 1
}                                 $$schedule($$update);  ← 함수 끝에 삽입
                              }
```

- `transform_state_mutations()`: 함수 본문에서 state 변수에 대한 할당 패턴(`=`, `+=`, `-=`, `*=`, `/=`, `++`, `--`) 감지
- 변이가 감지되면 함수 끝에 `$$schedule($$update)` 삽입
- `$$update()` 함수가 모든 derived 재계산 + DOM 갱신을 수행 (전체 업데이트)
- 향후 최적화: 변이된 state별 세밀한 업데이트 함수 생성 (Phase 4+)

---

## 5. VaisX 런타임 (< 3KB gzipped)

### 5.1 역할

컴파일러가 대부분의 작업을 하지만, 런타임이 필요한 최소 기능:

| 기능 | 이유 |
|------|------|
| DOM 헬퍼 (`$$element`, `$$text`, `$$append`) | 코드 크기 최소화 — 인라인보다 공유 함수가 효율적 |
| 이벤트 위임 (`$$listen`, `$$delegate`) | 많은 리스트 아이템에서 리스너 하나로 처리 |
| 배치 스케줄러 (`$$flush`) | 여러 상태 변경을 하나의 DOM 업데이트로 묶기 |
| 생명주기 (`$$mount`, `$$destroy`) | 컴포넌트 마운트/언마운트 훅 |
| 동적 시그널 (폴백) | 컴파일 타임에 분석 불가능한 동적 의존성용 |

### 5.2 크기 예산

| 모듈 | 목표 크기 (gzipped) |
|------|-------------------|
| DOM 헬퍼 | ~400B |
| 이벤트 위임 | ~300B |
| 스케줄러 | ~500B |
| 생명주기 | ~300B |
| 동적 시그널 | ~800B |
| **합계** | **< 2.5KB** |

### 5.3 스케줄러 — 배치 업데이트

```
상태 변경 1 ─┐
상태 변경 2 ─┤→ 마이크로태스크 큐에 flush 예약 → DOM 업데이트 1회 실행
상태 변경 3 ─┘
```

여러 상태가 동기적으로 변경되면, DOM 업데이트는 마이크로태스크에서 한 번만 실행:

```ts
let dirty = false;
const queue: (() => void)[] = [];

function $$schedule(updater: () => void) {
  queue.push(updater);
  if (!dirty) {
    dirty = true;
    queueMicrotask($$flush);
  }
}

function $$flush() {
  for (const fn of queue) fn();
  queue.length = 0;
  dirty = false;
}
```

---

## 6. VaisKit 프레임워크

### 6.1 파일 기반 라우팅

Next.js App Router 스타일:

```
app/
├── layout.vaisx              # 루트 레이아웃
├── page.vaisx                # /
├── about/
│   └── page.vaisx            # /about
├── blog/
│   ├── layout.vaisx          # /blog 레이아웃
│   ├── page.vaisx            # /blog
│   └── [slug]/
│       └── page.vaisx        # /blog/:slug (동적)
├── api/
│   └── users/
│       └── route.vais        # API 라우트 (순수 Vais)
└── error.vaisx               # 에러 바운더리
```

**특수 파일:**

| 파일 | 역할 |
|------|------|
| `page.vaisx` | 라우트 페이지 |
| `layout.vaisx` | 중첩 레이아웃 |
| `loading.vaisx` | 로딩 UI (Suspense) |
| `error.vaisx` | 에러 바운더리 |
| `route.vais` | API 엔드포인트 (서버 전용) |
| `middleware.vais` | 미들웨어 (서버 전용) |

### 6.2 데이터 로딩

SvelteKit의 `load` 함수 + Next.js 서버 컴포넌트 융합:

```vaisx
# page.vaisx — /blog/[slug]

<script>
  # 서버에서 실행 — 자동 감지 (async + DB/fetch 사용)
  #[server]
  A F load(params: RouteParams) -> PageData {
    post := await db.query("SELECT * FROM posts WHERE slug = ?", params.slug)
    PageData { post: post }
  }

  # 서버 액션 — 폼 제출 처리
  #[server]
  A F deletePost(formData: FormData) -> ActionResult {
    id := formData.get("id")
    await db.execute("DELETE FROM posts WHERE id = ?", id)
    redirect("/blog")
  }

  # 클라이언트 상태
  showComments := $state(false)
</script>

<template>
  <article>
    <h1>{post.title}</h1>
    <div>{post.content}</div>

    <form action={deletePost}>
      <input type="hidden" name="id" value={post.id} />
      <button type="submit">Delete</button>
    </form>

    <button @click={() => { showComments = !showComments }}>
      @if showComments { "Hide" } @else { "Show" } Comments
    </button>

    @if showComments {
      <CommentSection postId={post.id} />
    }
  </article>
</template>
```

### 6.3 SSR / SSG / 하이브리드

빌드 설정이 아닌 **라우트별 자동 결정**:

```
라우트 분석:
  서버 함수 없음 + 동적 경로 없음 → SSG (정적 생성)
  서버 함수 있음 + load() 사용    → SSR (서버 렌더링)
  #[static] 어트리뷰트           → 강제 SSG (빌드 타임 프리렌더)
```

```vaisx
# 강제 SSG
#[static]
A F load() -> PageData {
  posts := await fetch("https://api.example.com/posts").json()
  PageData { posts: posts }
}
```

### 6.4 서버 컴포넌트 vs 클라이언트 컴포넌트

기본은 **서버 컴포넌트**. 판별 우선순위 (높은 것이 이김):

```
우선순위  규칙                                    결과
────────  ──────────────────────────────────────  ──────────────
1 (최고)  명시적 context="client"                 클라이언트
2         명시적 context="server"                 서버 (경고: $state 사용 시 컴파일 에러)
3         $state / $effect / @click 등 사용       클라이언트 (자동 감지)
4 (기본)  위 조건 모두 해당 없음                   서버 (JS 미전송)
```

**충돌 방지 규칙:**
- `context="server"` + `$state` 사용 → **컴파일 에러** (모순이므로 명시적으로 거부)
- `context="client"` + `#[server]` 함수 → 허용 (서버 함수는 RPC로 호출)
- 자동 감지 결과가 불확실하면 → 서버로 기본 처리 + 빌드 경고

```vaisx
<script context="client">
  # 강제 클라이언트 컴포넌트
</script>

<script context="server">
  # 강제 서버 컴포넌트 — $state 사용 시 컴파일 에러
</script>
```

### 6.5 하이드레이션 전략

**Selective Hydration** (Qwik 영감):

1. SSR HTML에 상태 + 이벤트 마커 삽입
2. 클라이언트에서 전체 재실행 없이, 인터랙티브 컴포넌트만 하이드레이션
3. 나머지는 정적 HTML 유지

```html
<!-- SSR 출력 -->
<button data-vx="c0:click" data-vx-state="eyJjb3VudCI6MH0=">
  Count: 0
</button>

<!-- 클라이언트: 이 버튼만 하이드레이션 -->
<script type="module">
  import { hydrate } from "@vaisx/runtime";
  hydrate("c0", () => import("./counter.js"));
</script>
```

### 6.6 미들웨어

```vais
# middleware.vais — 서버 전용, 순수 Vais

F middleware(request: Request) -> Response | Next {
  # 인증 체크
  token := request.headers.get("Authorization")
  I token == "" {
    R Response.redirect("/login")
  }

  # 다음 핸들러로 진행
  R Next
}
```

### 6.7 서버 액션 보안 모델

`#[server]` 함수가 `<form action={...}>`으로 호출될 때의 기본 방어:

```
기본 방어 (자동 적용 — 개발자 코드 불필요):
  1. CSRF 토큰: 폼 렌더링 시 자동 삽입, 서버에서 자동 검증
  2. Origin 헤더: 동일 출처가 아니면 거부 (SameSite)
  3. 메서드 제한: POST만 허용 (GET 서버 액션 금지)
  4. 입력 검증: FormData 타입이 선언된 타입과 불일치 시 에러

보안 흐름:
  클라이언트: <form> 제출
    → 숨겨진 __vx_csrf 필드 자동 포함
    → POST /{action_hash}
  서버:
    → Origin 헤더 검증
    → CSRF 토큰 검증
    → FormData 타입 검증
    → #[server] 함수 실행
    → 결과 반환
```

추가 보안 옵션 (명시적):
```vaisx
#[server(rate_limit = "10/min")]
A F sensitiveAction(data: FormData) -> ActionResult { ... }

#[server(auth_required)]
A F adminAction(data: FormData) -> ActionResult { ... }
```

### 6.8 배포 어댑터

```
vaiskit.config.vais:

adapter := "node"        # node | static | vercel | cloudflare
port := 3000
```

| 어댑터 | 출력 |
|--------|------|
| `node` | Node.js 서버 (express/hono) |
| `static` | 정적 HTML/JS/CSS 파일 |
| `vercel` | Vercel 서버리스 함수 |
| `cloudflare` | Cloudflare Workers |

---

## 7. CLI 명령어

```bash
vaisx new my-app          # 새 프로젝트 생성
vaisx dev                  # 개발 서버 (HMR)
vaisx build                # 프로덕션 빌드
vaisx start                # 프로덕션 서버 시작
vaisx preview              # 빌드 결과 프리뷰
```

---

## 8. 의존성 관계

```
Vais 언어 (코어, Phase 140+)
  └─ vais-codegen/wasm_component: WASM Component Model (WIT, wasm-bindgen, WASI)  ← VaisX WASM 출력에 필요
  └─ vais-codegen-js: JS 코드 생성 (6,167줄, ESM/트리쉐이킹/소스맵)              ← VaisX JS 출력에 필요
  └─ vais-parser: 파서 (parse, parse_with_cfg, parse_with_recovery)              ← vaisx-parser가 <script> 블록 파싱에 사용
  └─ vais-ast: AST 노드 (3,327줄, 40+ 노드 타입)                                ← vaisx-parser/compiler가 참조

VaisX (이 프로젝트)
  ├─ vaisx-parser     ← vais-parser 재사용 (script 블록)
  ├─ vaisx-compiler   ← vais-codegen/wasm_component, vais-codegen-js에 의존
  └─ vaisx-runtime    ← 독립 (JS)

VaisKit (이 프로젝트)
  ├─ vaiskit          ← vaisx-compiler에 의존
  └─ 어댑터           ← 독립
```

---

## 9. 성능 목표

| 지표 | 목표 | 비교 |
|------|------|------|
| 런타임 크기 | < 3KB gzipped | Svelte ~1.6KB, React ~44KB |
| SSR 렌더링 | < 5ms / 컴포넌트 | Next.js ~10ms |
| 하이드레이션 | < 50ms (선택적) | Qwik ~0ms (resumable) |
| HMR | < 100ms | Vite ~50ms |
| 빌드 (100 페이지) | < 10s | Next.js ~30s |
| Lighthouse | > 95 | Svelte ~96 |

---

## 10. Next.js / Svelte에서 가져온 것 정리

| 기능 | 출처 | VaisX/VaisKit 적용 |
|------|------|-------------------|
| 컴파일러 우선 | Svelte | .vaisx → JS/WASM (Virtual DOM 없음) |
| 단일 파일 컴포넌트 | Svelte | `<script>` + `<template>` + `<style>` |
| $state/$derived/$effect | Svelte 5 Runes | 동일 개념, Vais 문법으로 |
| 파일 기반 라우팅 | Next.js App Router | app/ 디렉토리 구조 |
| 서버 컴포넌트 | Next.js RSC | 자동 감지 (반응성 없으면 서버) |
| 서버 액션 | Next.js | `#[server]` 어트리뷰트 |
| 선택적 하이드레이션 | Qwik | SSR 마커 기반 |
| 어댑터 | SvelteKit | node, static, vercel, cloudflare |
| 양방향 바인딩 | Svelte | `:value={name}` |
| 내장 트랜지션 | Svelte | (Phase 2에서 추가 예정) |
| 토큰 효율성 | Vais 고유 | 단일 문자 키워드 `F`, `S`, `I`, `M` 등 |
