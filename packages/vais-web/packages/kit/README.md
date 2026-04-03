# VaisX

컴파일 타임 반응성과 파일 기반 라우팅을 갖춘 토큰 효율적인 풀스택 웹 프레임워크.

## 특징

- **컴파일 타임 반응성** — 반응성 코드를 빌드 시 최적화하여 런타임 크기 < 3KB 유지
- **파일 기반 라우팅 & SSR/SSG** — `app/` 디렉토리 구조가 곧 URL 구조. 페이지별로 SSR/SSG 렌더 모드 선택 가능
- **Vite 호환 플러그인 시스템** — 기존 Vite 플러그인과 완전히 호환되는 플러그인 API
- **DevTools** — 반응성 그래프 시각화, 컴포넌트 프로파일러, HMR 상태 추적
- **다중 배포 어댑터** — Node.js, Vercel, Cloudflare Workers, Deno, Bun, AWS Lambda, Netlify 지원

## 빠른 시작

```bash
npm install -g @vaisx/cli
vaisx new my-app
cd my-app
vaisx dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 패키지

| 패키지 | 설명 | 버전 |
|---|---|---|
| `@vaisx/runtime` | 핵심 런타임 (< 3KB) | 0.1.0 |
| `@vaisx/cli` | 프로젝트 생성 및 개발 CLI 도구 | 0.1.0 |
| `@vaisx/kit` | 핵심 타입 및 공유 인터페이스 | 0.1.0 |
| `@vaisx/plugin` | Vite 호환 플러그인 시스템 | 0.1.0 |
| `@vaisx/devtools` | 반응성 그래프 및 프로파일러 DevTools | 0.1.0 |
| `@vaisx/hmr` | Hot Module Replacement 런타임 | 0.1.0 |
| `@vaisx/components` | 내장 UI 컴포넌트 라이브러리 | 0.1.0 |

## 예제

| 예제 | 설명 |
|---|---|
| [hello](./examples/hello/) | 최소 VaisX 앱 — "Hello, VaisX!" |
| [counter](./examples/counter/) | `$state`, `$derived`, `$effect` 반응성 기초 |
| [todo](./examples/todo/) | SSR 서버 액션 + 클라이언트 필터링 CRUD |
| [blog](./examples/blog/) | SSR + SSG 혼합 블로그 앱 |

## 기여하기

기여 방법, 개발 환경 설정, 코드 스타일, PR 규칙은 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참고하세요.

행동 강령은 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)를 참고하세요.

## 라이센스

[MIT](./LICENSE) © 2026 VaisX Contributors
