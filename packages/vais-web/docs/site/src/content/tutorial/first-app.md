# 첫 번째 앱 만들기

카운터 앱을 직접 만들면서 VaisX의 핵심 개념인 **반응형 상태**, **이벤트 바인딩**, **DOM 자동 업데이트**를 배웁니다.

## 목표

완성 화면은 다음과 같습니다.

- 숫자가 표시된 카운터
- "+ 증가" 버튼을 누르면 숫자가 올라감
- "- 감소" 버튼을 누르면 숫자가 내려감
- "초기화" 버튼을 누르면 0으로 돌아감
- 현재 값이 짝수이면 파란색, 홀수이면 빨간색으로 표시

## 1. 파일 생성

`app/pages/counter.vaisx` 파일을 새로 만듭니다.

```
app/
└── pages/
    ├── index.vaisx
    └── counter.vaisx   ← 새로 만들 파일
```

## 2. .vaisx 파일 구조

`.vaisx` 파일은 세 개의 블록으로 구성됩니다.

```html
<script>
  <!-- 1. 컴포넌트 로직 (JavaScript / TypeScript) -->
</script>

<template>
  <!-- 2. HTML 구조 -->
</template>

<style>
  /* 3. 컴포넌트 스코프 CSS */
</style>
```

각 블록은 선택 사항이지만, 대부분의 컴포넌트는 세 블록을 모두 사용합니다.

> **스코프 스타일:** `<style>` 블록의 CSS는 해당 컴포넌트 내부에만 적용됩니다. 다른 컴포넌트의 스타일과 충돌하지 않습니다.

## 3. 반응형 상태 선언

`<script>` 블록 안에서 `__vx_state`로 상태를 선언합니다.

```html
<script>
  // count는 반응형 상태 객체입니다.
  // 초기값은 0입니다.
  const count = __vx_state(0);
</script>
```

`__vx_state`가 반환하는 객체는 `.value` 프로퍼티로 현재 값을 읽거나 씁니다.

```javascript
count.value;        // 현재 값 읽기
count.value = 5;    // 값 변경 → UI 자동 업데이트
count.value++;      // 증가
```

## 4. 파생 상태(derived) 선언

현재 카운트가 짝수인지 홀수인지를 나타내는 파생 상태를 만듭니다.

```html
<script>
  const count = __vx_state(0);

  // count.value가 변경될 때마다 isEven이 자동으로 재계산됩니다.
  const isEven = __vx_derived(() => count.value % 2 === 0);
</script>
```

`__vx_derived`는 함수를 받아서, 그 함수 안에서 사용하는 반응형 상태가 바뀔 때마다 자동으로 다시 실행합니다.

## 5. 템플릿 작성

`<template>` 블록에서 상태를 화면에 표시하고 이벤트를 연결합니다.

```html
<template>
  <div class="counter">
    <h1>카운터</h1>

    <!-- {식} 으로 상태 값을 텍스트로 출력 -->
    <p class="value" :class="{ even: isEven.value, odd: !isEven.value }">
      {count.value}
    </p>

    <div class="controls">
      <!-- @on:click 으로 클릭 이벤트를 연결 -->
      <button @on:click={() => count.value--}>- 감소</button>
      <button @on:click={() => (count.value = 0)}>초기화</button>
      <button @on:click={() => count.value++}>+ 증가</button>
    </div>
  </div>
</template>
```

### 주요 문법 설명

**`{식}`** — 중괄호 안의 JavaScript 식을 평가해 텍스트로 삽입합니다.

```html
<p>{count.value}</p>
<p>{"현재: " + count.value + "번"}</p>
```

**`@on:이벤트명`** — DOM 이벤트 핸들러를 연결합니다.

```html
<!-- 화살표 함수를 인라인으로 사용 -->
<button @on:click={() => count.value++}>클릭</button>

<!-- 미리 선언한 함수를 참조 -->
<button @on:click={handleClick}>클릭</button>
```

**`:class`** — 조건에 따라 CSS 클래스를 동적으로 추가/제거합니다.

```html
<!-- 객체 형태: 조건이 true이면 클래스 추가 -->
<p :class="{ even: isEven.value, odd: !isEven.value }">...</p>

<!-- 배열 형태 -->
<p :class="[isEven.value ? 'even' : 'odd', 'value']">...</p>
```

## 6. 스타일 작성

```html
<style>
  .counter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 40px;
  }

  .value {
    font-size: 80px;
    font-weight: bold;
    width: 160px;
    text-align: center;
    transition: color 0.2s;
  }

  /* isEven이 true일 때 .even 클래스가 붙음 */
  .value.even {
    color: #3b82f6;
  }

  /* isEven이 false일 때 .odd 클래스가 붙음 */
  .value.odd {
    color: #ef4444;
  }

  .controls {
    display: flex;
    gap: 12px;
  }

  button {
    padding: 10px 20px;
    font-size: 16px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    transition: background 0.15s;
  }

  button:hover {
    background: #f3f4f6;
  }
</style>
```

## 7. 완성된 코드

`app/pages/counter.vaisx`의 최종 코드입니다.

```html
<script>
  const count = __vx_state(0);
  const isEven = __vx_derived(() => count.value % 2 === 0);
</script>

<template>
  <div class="counter">
    <h1>카운터</h1>

    <p class="value" :class="{ even: isEven.value, odd: !isEven.value }">
      {count.value}
    </p>

    <div class="controls">
      <button @on:click={() => count.value--}>- 감소</button>
      <button @on:click={() => (count.value = 0)}>초기화</button>
      <button @on:click={() => count.value++}>+ 증가</button>
    </div>
  </div>
</template>

<style>
  .counter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 40px;
  }

  .value {
    font-size: 80px;
    font-weight: bold;
    width: 160px;
    text-align: center;
    transition: color 0.2s;
  }

  .value.even { color: #3b82f6; }
  .value.odd  { color: #ef4444; }

  .controls {
    display: flex;
    gap: 12px;
  }

  button {
    padding: 10px 20px;
    font-size: 16px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    transition: background 0.15s;
  }

  button:hover { background: #f3f4f6; }
</style>
```

개발 서버(`vaisx dev`)가 실행 중이라면 `http://localhost:3000/counter`에서 결과를 확인할 수 있습니다.

## 8. 반응성 동작 원리

VaisX의 반응성은 **추적 기반(tracked)** 방식으로 동작합니다.

1. `__vx_state(0)`은 내부적으로 신호(signal) 객체를 생성합니다.
2. 템플릿이 렌더링될 때 `{count.value}`를 읽는 순간, 해당 DOM 노드가 `count` 신호를 **구독**합니다.
3. `count.value++`가 실행되면 VaisX는 구독 중인 DOM 노드만 **최소 범위로 업데이트**합니다.
4. 전체 페이지를 다시 그리지 않으므로 성능이 뛰어납니다.

```
count.value++ 실행
      ↓
count 신호가 변경 알림 발송
      ↓
{count.value}를 구독 중인 텍스트 노드만 업데이트
      ↓
isEven 파생 상태 재계산
      ↓
:class 바인딩이 붙은 노드의 클래스 업데이트
```

---

기본 반응성을 이해했다면 [TODO 앱](/tutorial/todo-app)에서 리스트 렌더링과 서버 액션을 배워보세요.
