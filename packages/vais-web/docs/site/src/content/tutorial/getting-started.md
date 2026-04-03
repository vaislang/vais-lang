# 시작하기

이 페이지에서는 VaisX CLI를 설치하고 첫 번째 프로젝트를 만들어 개발 서버를 실행하는 방법을 배웁니다.

## 1. CLI 설치

VaisX CLI를 전역으로 설치합니다.

```bash
npm install -g @vaisx/cli
```

설치가 완료되면 `vaisx` 명령어를 사용할 수 있습니다.

```bash
vaisx --version
# 출력 예시: @vaisx/cli 1.0.0
```

> **팁:** 전역 설치 없이 `npx`를 이용할 수도 있습니다. `npx @vaisx/cli new my-app`

## 2. 새 프로젝트 생성

`vaisx new` 명령으로 프로젝트를 생성합니다.

```bash
vaisx new my-app
```

CLI가 몇 가지 옵션을 물어봅니다.

```
? 프로젝트 템플릿을 선택하세요
  > default    (기본 SPA 템플릿)
    ssr        (서버사이드 렌더링)
    static     (정적 사이트)

? TypeScript를 사용하시겠습니까? (Y/n) Y

? 패키지 매니저를 선택하세요
  > npm
    pnpm
    yarn
```

선택이 완료되면 프로젝트 폴더가 생성됩니다.

```bash
cd my-app
npm install
```

## 3. 프로젝트 구조

생성된 프로젝트의 파일 구조입니다.

```
my-app/
├── app/
│   ├── pages/
│   │   └── index.vaisx       # 홈 페이지
│   ├── components/
│   │   └── Header.vaisx      # 공통 헤더 컴포넌트
│   └── app.vaisx             # 루트 컴포넌트
├── public/
│   └── favicon.svg
├── vaisx.config.ts           # 프레임워크 설정 파일
├── tsconfig.json
└── package.json
```

### 주요 파일 설명

**`vaisx.config.ts`** — 프로젝트 전반의 설정을 담당합니다.

```typescript
import { defineConfig } from "@vaisx/kit";

export default defineConfig({
  // 앱 루트 디렉토리
  appDir: "./app",

  // 빌드 출력 경로
  outDir: "./dist",

  // 서버 설정 (SSR 모드에서 사용)
  server: {
    port: 3000,
    host: "localhost",
  },

  // 플러그인
  plugins: [],
});
```

**`app/app.vaisx`** — 모든 페이지를 감싸는 루트 컴포넌트입니다.

```html
<script>
  // 전역 레이아웃 로직
</script>

<template>
  <div class="app">
    <Header />
    <main>
      <slot />
    </main>
  </div>
</template>

<style>
  .app {
    font-family: sans-serif;
    max-width: 1200px;
    margin: 0 auto;
  }
</style>
```

**`app/pages/index.vaisx`** — 파일 기반 라우팅에 의해 `/` 경로에 매핑됩니다.

```html
<script>
  // 페이지 로직
</script>

<template>
  <h1>VaisX에 오신 것을 환영합니다!</h1>
</template>
```

### 파일 기반 라우팅 규칙

`app/pages/` 디렉토리 아래의 `.vaisx` 파일은 자동으로 라우트가 됩니다.

| 파일 경로 | URL 경로 |
|-----------|----------|
| `pages/index.vaisx` | `/` |
| `pages/about.vaisx` | `/about` |
| `pages/blog/index.vaisx` | `/blog` |
| `pages/blog/[id].vaisx` | `/blog/:id` |

## 4. 개발 서버 실행

```bash
vaisx dev
```

아래와 같은 메시지가 출력되면 성공입니다.

```
  VaisX dev server

  Local:    http://localhost:3000/
  Network:  http://192.168.1.x:3000/

  ready in 312ms
```

브라우저에서 `http://localhost:3000`을 열면 프로젝트 시작 화면이 나타납니다.

### 유용한 개발 서버 옵션

```bash
# 포트 변경
vaisx dev --port 4000

# 네트워크 인터페이스 열기 (다른 기기에서 접속 허용)
vaisx dev --host

# HTTPS 활성화
vaisx dev --https
```

## 5. 빌드 & 프리뷰

개발이 완료되면 프로덕션 빌드를 생성합니다.

```bash
# 프로덕션 빌드
vaisx build

# 빌드 결과물 미리보기
vaisx preview
```

---

프로젝트가 준비되었습니다. 이제 [첫 번째 앱 만들기](/tutorial/first-app)로 넘어가 실제 컴포넌트를 작성해 보겠습니다.
