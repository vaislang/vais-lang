# VaisX 기여 가이드

VaisX에 기여해 주셔서 감사합니다! 이 문서는 개발 환경 설정부터 PR 제출까지 기여 과정 전반을 안내합니다.

## 목차

- [개발 환경 설정](#개발-환경-설정)
- [빌드 및 테스트](#빌드-및-테스트)
- [브랜치 전략](#브랜치-전략)
- [커밋 메시지 컨벤션](#커밋-메시지-컨벤션)
- [PR 규칙](#pr-규칙)
- [코드 스타일](#코드-스타일)
- [테스트 작성 규칙](#테스트-작성-규칙)

---

## 개발 환경 설정

### 필수 도구

| 도구 | 최소 버전 | 설치 방법 |
|---|---|---|
| Node.js | 18.x 이상 | [nodejs.org](https://nodejs.org) |
| pnpm | 9.x 이상 | `npm install -g pnpm` |
| Rust | stable (1.78+) | [rustup.rs](https://rustup.rs) |

Rust는 컴파일러 코어(`@vaisx/compiler`) 빌드에 필요합니다. TypeScript 패키지만 작업할 경우 Rust 설치를 생략할 수 있습니다.

### 저장소 클론 및 의존성 설치

```bash
git clone https://github.com/vaislang/vais-web.git
cd vais-web
pnpm install
```

`pnpm install`은 모노레포의 모든 패키지 의존성을 한 번에 설치합니다.

---

## 빌드 및 테스트

### 전체 빌드

```bash
pnpm build
```

### 특정 패키지 빌드

```bash
pnpm --filter @vaisx/kit build
pnpm --filter @vaisx/runtime build
```

### 타입 체크

```bash
pnpm build:check
# 또는 특정 패키지
pnpm --filter @vaisx/kit build:check
```

### 테스트 실행

```bash
# 전체 테스트
pnpm test

# 특정 패키지 테스트
pnpm --filter @vaisx/kit test

# watch 모드
pnpm --filter @vaisx/kit test:watch
```

### 개발 서버 (예제 실행)

```bash
cd examples/hello
pnpm install
pnpm dev
```

---

## 브랜치 전략

| 브랜치 | 용도 |
|---|---|
| `main` | 최신 안정 코드. 직접 push 금지 |
| `feature/*` | 새 기능 개발 (예: `feature/ssr-streaming`) |
| `fix/*` | 버그 수정 (예: `fix/hmr-reconnect`) |

모든 변경 사항은 `main`으로의 PR을 통해 병합됩니다.

---

## 커밋 메시지 컨벤션

[Conventional Commits](https://www.conventionalcommits.org/) 명세를 따릅니다.

### 형식

```
<type>(<scope>): <subject>

[body]

[footer]
```

### 타입

| 타입 | 설명 |
|---|---|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `style` | 코드 포매팅 (기능 변경 없음) |
| `refactor` | 리팩토링 (기능 변경 없음, 버그 수정 아님) |
| `test` | 테스트 추가 또는 수정 |
| `chore` | 빌드 스크립트, 의존성 등 기타 변경 |
| `perf` | 성능 개선 |

### 스코프 예시

`runtime`, `cli`, `kit`, `plugin`, `devtools`, `hmr`, `components`, `compiler`

### 예시

```
feat(runtime): add $effect cleanup callback support

fix(kit): correct RouteParams generic constraint

docs(examples): add blog example with SSR/SSG

chore(deps): upgrade vitest to 2.1.0
```

---

## PR 규칙

### 제목 형식

PR 제목은 커밋 메시지 컨벤션과 동일한 형식을 따릅니다.

```
feat(runtime): add streaming SSR support
fix(cli): resolve Windows path separator issue
```

### 체크리스트

PR을 열기 전에 아래 항목을 확인하세요.

- [ ] `pnpm build`가 오류 없이 완료된다
- [ ] `pnpm test`가 모두 통과된다
- [ ] 새 기능에 대한 테스트가 추가되었다
- [ ] 공개 API 변경이 있으면 타입 정의가 업데이트되었다
- [ ] 관련 예제 또는 문서가 업데이트되었다

### 리뷰어 지정

- 런타임/컴파일러 변경: `@vaislang/runtime-team` 지정
- CLI/도구 변경: `@vaislang/tooling-team` 지정
- 문서 변경: 리뷰어 지정 생략 가능

### 병합 방식

모든 PR은 **Squash and Merge**로 병합합니다. PR 제목이 최종 커밋 메시지가 됩니다.

---

## 코드 스타일

### TypeScript

- `strict: true` 모드를 준수합니다. `any` 타입 사용을 최소화하고 불가피한 경우 주석으로 이유를 명시하세요.
- 포매터: [Prettier](https://prettier.io/) (설정은 `.prettierrc` 참고)
- 린터: `tsc --noEmit`으로 타입 오류 없음을 확인합니다.

```bash
# 타입 체크
pnpm --filter @vaisx/kit lint
```

### Rust

- `rustfmt`으로 포매팅합니다.
- `clippy` 경고를 모두 해결해야 합니다.

```bash
# Rust 포매팅
cargo fmt --all

# Clippy 린트
cargo clippy --all-targets --all-features -- -D warnings
```

---

## 테스트 작성 규칙

- 테스트 파일은 대상 파일과 같은 디렉토리의 `__tests__/` 폴더 또는 `*.test.ts` 파일에 작성합니다.
- 각 공개 함수/타입에 대해 정상 케이스와 엣지 케이스를 모두 커버합니다.
- 테스트 이름은 `describe` + `it` 패턴으로 의도를 명확히 설명합니다.

```ts
describe('parseRoute', () => {
  it('parses static segments correctly', () => { ... })
  it('parses dynamic [param] segments', () => { ... })
  it('returns null for invalid input', () => { ... })
})
```

- 비동기 테스트는 `async/await`를 사용합니다.
- 목(mock)은 `vi.fn()` / `vi.spyOn()`을 사용하고, 각 테스트 후 `vi.clearAllMocks()`로 정리합니다.
- 벤치마크는 `bench/` 디렉토리에 작성하고 `pnpm bench`로 실행합니다.
