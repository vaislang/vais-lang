# 튜토리얼

VaisX로 실제 애플리케이션을 만드는 단계별 튜토리얼입니다. 설치부터 시작해 반응형 상태 관리, 컴포넌트 작성, 서버 액션까지 차근차근 배울 수 있습니다.

## 튜토리얼 목록

| 순서 | 제목 | 내용 |
|------|------|------|
| 1 | [시작하기](/tutorial/getting-started) | CLI 설치, 프로젝트 생성, 개발 서버 실행 |
| 2 | [첫 번째 앱 만들기](/tutorial/first-app) | 카운터 앱으로 배우는 반응성 기초 |
| 3 | [TODO 앱](/tutorial/todo-app) | 리스트 렌더링, 조건부 렌더링, 서버 액션 |
| 4 | [컴포넌트](/tutorial/components) | Props, 슬롯, 이벤트 에밋 |

## 사전 요구사항

튜토리얼을 시작하기 전에 다음 환경이 준비되어 있어야 합니다.

- **Node.js** 18 이상
- **npm** 9 이상 (또는 pnpm / yarn)
- JavaScript / TypeScript 기초 지식
- 터미널 기본 사용법

## VaisX 핵심 개념 미리보기

### .vaisx 파일 구조

VaisX 컴포넌트는 `.vaisx` 확장자를 가진 단일 파일 컴포넌트(SFC)입니다.

```html
<script>
  // 컴포넌트 로직 (TypeScript 지원)
  const count = __vx_state(0);
</script>

<template>
  <button @on:click={() => count.value++}>
    클릭 횟수: {count.value}
  </button>
</template>

<style>
  /* 컴포넌트 스코프 스타일 */
  button {
    padding: 8px 16px;
  }
</style>
```

### 반응성 기초

- `__vx_state(초기값)` — 반응형 상태를 선언합니다. 값이 바뀌면 UI가 자동으로 업데이트됩니다.
- `__vx_derived(식)` — 다른 상태로부터 파생된 값을 선언합니다. 의존 상태가 바뀔 때마다 재계산됩니다.

### 템플릿 지시문

| 지시문 | 설명 |
|--------|------|
| `@if` / `@else` | 조건부 렌더링 |
| `@each` | 리스트 렌더링 |
| `@on:click` | 이벤트 핸들러 연결 |
| `:bind` | 양방향 데이터 바인딩 |
| `{식}` | 텍스트 보간 |

---

준비가 되셨다면 [시작하기](/tutorial/getting-started)부터 따라해 보세요.
