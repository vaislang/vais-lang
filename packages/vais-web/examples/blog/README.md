# blog-vaisx

VaisX 블로그 애플리케이션. SSR(서버 사이드 렌더링)과 SSG(정적 사이트 생성)를 한 프로젝트에서 혼합 사용하는 방법을 시연합니다.

주요 기능:
- 홈 페이지(`/`): SSG — 빌드 시 정적 HTML 생성
- 게시물 목록(`/posts`): SSG — 빌드 시 정적 HTML 생성
- 게시물 상세(`/posts/[slug]`): SSG + SSR 혼합 — `entries()`에 등록된 슬러그는 정적 생성, 나머지는 요청 시 SSR
- 파일 기반 동적 라우팅 (`[slug]`)
- 서버 컴포넌트로 클라이언트 JS 없이 렌더링

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

`vaisx.config.ts`의 `prerender` 목록과 각 페이지의 `entries()` 함수를 기반으로 정적 HTML을 미리 생성합니다.

### 프로덕션 서버 시작

```bash
pnpm start
```

## 디렉토리 구조

```
blog/
├── app/
│   ├── page.vaisx              # 홈 페이지 (SSG)
│   ├── layout.vaisx            # 루트 레이아웃 (서버 컴포넌트)
│   └── posts/
│       ├── page.vaisx          # 게시물 목록 (SSG)
│       └── [slug]/
│           └── page.vaisx      # 게시물 상세 (SSG + SSR)
├── package.json
├── vaisx.config.ts
└── README.md
```

## 핵심 개념

### SSG — 정적 사이트 생성

`vaisx.config.ts`의 `prerender` 배열에 경로를 등록하거나, 페이지 파일에 `entries()` 함수를 정의하면 해당 경로를 빌드 시 정적 HTML로 생성합니다.

```ts
// vaisx.config.ts
export default {
  srcDir: "app",
  outDir: "dist",
  prerender: ["/", "/posts"],
};
```

### 동적 경로 SSG — `entries()`

동적 경로(`[slug]`)에서 `entries()` 함수를 정의하면 해당 함수가 반환하는 파라미터 조합을 빌드 시 정적으로 생성합니다.

```vaisx
#[server]
A F entries() -> Array<{ slug: String }> {
  posts := getAllPosts()
  R posts.map(p => { slug: p.slug })
}
```

### SSR — 서버 사이드 렌더링

`entries()`에 포함되지 않은 동적 경로는 요청 시 서버에서 렌더링됩니다. 데이터 로딩은 `load()` 함수로 처리합니다.

```vaisx
#[server]
A F load(ctx: LoadContext) -> PageData {
  post := getPostBySlug(ctx.params.slug)
  R PageData { post }
}
```

### 파일 기반 라우팅

`app/` 디렉토리 구조가 URL 구조와 직접 매핑됩니다.

| 파일 경로 | URL |
|---|---|
| `app/page.vaisx` | `/` |
| `app/posts/page.vaisx` | `/posts` |
| `app/posts/[slug]/page.vaisx` | `/posts/:slug` |
| `app/layout.vaisx` | 모든 페이지의 공통 레이아웃 |

## Vais 문법 참조

| 패턴 | 의미 |
|---|---|
| `name := value` | 변수 선언 |
| `P { name: Type }` | Props 선언 |
| `A F name() { }` | 비동기 함수 정의 |
| `#[server]` | 서버 전용 속성 |
| `<script context="server">` | 서버 컴포넌트 선언 |
| `R value` | 반환값 |
| `@each items as item { }` | 리스트 렌더링 |
| `@if condition { } @else { }` | 조건부 렌더링 |
| `<slot />` | 레이아웃의 자식 삽입 위치 |
