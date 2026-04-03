# todo-vaisx

VaisX TODO 애플리케이션. SSR 서버 액션과 클라이언트 반응형 필터링을 함께 사용하는 CRUD 앱입니다.

주요 기능:
- `#[server] A F load()`로 서버 사이드 데이터 로딩
- `#[server] A F`로 추가, 토글, 삭제 서버 액션
- `<form action={serverFn}>`을 통한 점진적 기능 향상
- `$state`와 `$derived`를 사용한 클라이언트 사이드 반응형 필터링
- 런타임 오류 처리를 위한 에러 바운더리

## 실행 방법

### 사전 요구 사항

- Node.js 18+
- pnpm (또는 npm/yarn)

### 의존성 설치

```bash
pnpm install
```

### 개발 서버 시작

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 프로덕션 빌드

```bash
pnpm build
```

### 프로덕션 서버 시작

```bash
pnpm start
```

## 디렉토리 구조

```
todo/
├── app/
│   ├── page.vaisx     # TODO 페이지 — CRUD + SSR + 클라이언트 필터링
│   ├── layout.vaisx   # 루트 레이아웃 (서버 컴포넌트)
│   └── error.vaisx    # 에러 바운더리 컴포넌트
├── package.json
├── vaisx.config.ts
└── README.md
```

## 핵심 개념

### SSR 데이터 로딩

`load` 함수는 페이지가 렌더링되기 전에 서버에서 실행됩니다. 반환값은 템플릿에서 `todos`로 사용 가능합니다.

```vaisx
#[server]
A F load() -> PageData {
  R PageData { todos: getTodos() }
}
```

### 서버 액션

서버 액션은 서버에서 폼 제출을 처리합니다. `<form action={fn}>` 바인딩은 폼을 액션에 연결하여 점진적 기능 향상을 가능하게 합니다 — 폼은 JavaScript 없이도 동작하고 JS가 사용 가능할 때 향상됩니다.

```vaisx
#[server]
A F addTodo(formData: FormData) -> ActionResult {
  text := formData.get("text")
  I text == "" {
    R ActionResult { status: "error", errors: { text: "Text is required" } }
  }
  createTodo(text)
  R ActionResult { status: "success" }
}
```

### 클라이언트 사이드 필터링

필터 상태는 `$state`로 클라이언트에서 관리됩니다. `$derived` 값은 `filter` 또는 `todos`가 변경될 때마다 자동으로 재계산됩니다.

```vaisx
filter := $state("all")

filteredTodos := $derived(
  I filter == "active" {
    todos.filter(t => !t.completed)
  } E I filter == "completed" {
    todos.filter(t => t.completed)
  } E {
    todos
  }
)
```

### 에러 바운더리

`app/error.vaisx`는 프레임워크가 앱 전체의 에러 바운더리로 자동 사용합니다. `error`와 `reset` props를 받습니다.

## Vais 문법 참조

| 패턴 | 의미 |
|---|---|
| `name := value` | 변수 선언 |
| `S Name { field: Type }` | 구조체 정의 |
| `filter := $state("all")` | 반응형 상태 |
| `x := $derived(expr)` | 파생 반응형 값 |
| `F name() { }` | 함수 정의 |
| `A F name() { }` | 비동기 함수 정의 |
| `#[server]` | 서버 전용 속성 |
| `P { name: Type }` | Props 선언 |
| `I condition { } E { }` | If / Else |
| `R value` | 반환값 |
| `@each items as item { }` | 리스트 렌더링 |
| `@if condition { } @else { }` | 조건부 렌더링 |
| `@click={handler}` | 이벤트 바인딩 |
| `<form action={serverFn}>` | 서버 액션 폼 |
