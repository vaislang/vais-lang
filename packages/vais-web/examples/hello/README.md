# hello-vaisx

VaisX 최소 애플리케이션. "Hello, VaisX!" 메시지를 화면에 출력합니다.

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
hello/
├── app/
│   ├── page.vaisx     # 홈 페이지 컴포넌트
│   └── layout.vaisx   # 루트 레이아웃 (서버 컴포넌트)
├── package.json
├── vaisx.config.ts
└── README.md
```

## Vais 문법 기초

VaisX는 `<script>`, `<template>`, `<style>` 블록으로 구성된 단일 파일 컴포넌트(`.vaisx`)를 사용합니다.

```vaisx
<script>
  greeting := "Hello, VaisX!"
</script>

<template>
  <h1>{greeting}</h1>
</template>
```

| 패턴 | 의미 |
|---|---|
| `name := value` | 변수 선언 |
| `F name() { }` | 함수 정의 |
| `P { name: Type }` | Props 선언 |
| `I condition { }` | 조건문 (if) |
| `R value` | 반환값 |

`<script context="server">`로 선언된 서버 컴포넌트는 서버에서만 실행되며 클라이언트로 JS를 전송하지 않습니다.
