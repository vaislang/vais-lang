# counter-vaisx

VaisX 카운터 애플리케이션. 핵심 반응성 기본 요소인 `$state`, `$derived`, `$effect`를 시연합니다.

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
counter/
├── app/
│   ├── page.vaisx     # 카운터 페이지 컴포넌트
│   └── layout.vaisx   # 루트 레이아웃 (서버 컴포넌트)
├── package.json
├── vaisx.config.ts
└── README.md
```

## 시연하는 반응성 기능

### `$state` — 반응형 상태

```vaisx
count := $state(0)
```

`$state`는 반응형 변수를 선언합니다. `count`를 읽는 모든 템플릿 표현식이나 `$derived`는 `count`가 변경될 때마다 자동으로 재평가됩니다.

### `$derived` — 파생(계산) 값

```vaisx
doubled := $derived(count * 2)
isEven  := $derived(count % 2 == 0)
```

`$derived`는 의존하는 상태가 변경될 때 자동으로 재계산되는 읽기 전용 값을 생성합니다. 항상 의존하는 반응형 상태와 동기화됩니다.

### `$effect` — 사이드 이펙트

```vaisx
$effect {
  console.log("Count changed to:", count)
}
```

`$effect`는 읽는 반응형 값이 변경될 때마다 코드 블록을 실행합니다. 로깅, 외부 시스템 동기화 또는 상태 변화에 반응하는 명령형 API 호출에 유용합니다.

### `@click` — 이벤트 바인딩

```vaisx
<button @click={increment}>+</button>
```

`@click`은 DOM 이벤트를 `<script>`에 정의된 함수에 바인딩합니다.

### `@if` / `@else` — 조건부 렌더링

```vaisx
@if isEven {
  "(even)"
} @else {
  "(odd)"
}
```

`@if`/`@else`는 반응형 표현식에 따라 템플릿 콘텐츠를 조건부로 렌더링합니다.

## Vais 문법 참조

| 패턴 | 의미 |
|---|---|
| `name := value` | 변수 선언 |
| `name := $state(value)` | 반응형 상태 선언 |
| `name := $derived(expr)` | 파생(계산) 값 |
| `$effect { }` | 반응형 사이드 이펙트 블록 |
| `F name() { }` | 함수 정의 |
| `@eventName={handler}` | 이벤트 바인딩 |
| `@if cond { } @else { }` | 조건부 렌더링 |
