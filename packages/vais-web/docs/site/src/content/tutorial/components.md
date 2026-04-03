# 컴포넌트

지금까지 단일 파일에 모든 코드를 작성했습니다. 앱이 커질수록 코드를 재사용 가능한 **컴포넌트**로 분리해야 합니다. 이번 튜토리얼에서는 **Props 정의 & 전달**, **슬롯(`<slot>`)**, **이벤트 에밋**을 배웁니다.

## TODO 앱 컴포넌트 분리

앞서 만든 TODO 앱을 컴포넌트로 나눠보겠습니다.

```
app/
└── components/
    ├── TodoItem.vaisx    ← 할 일 단일 항목
    ├── TodoList.vaisx    ← 할 일 목록
    └── Card.vaisx        ← 재사용 가능한 카드 래퍼
```

## 1. Props 정의

Props는 부모 컴포넌트에서 자식 컴포넌트로 데이터를 전달하는 방법입니다.

`app/components/TodoItem.vaisx`를 만듭니다.

```html
<script>
  // defineProps로 Props 타입을 정의합니다.
  const props = defineProps<{
    id: number;
    text: string;
    done: boolean;
  }>();
</script>

<template>
  <li class="todo-item" :class="{ done: props.done }">
    <div class="todo-content">
      @if(props.done)
        <span class="status done-icon">✓</span>
        <s>{props.text}</s>
      @else
        <span class="status pending-icon">○</span>
        <span>{props.text}</span>
      @end
    </div>
  </li>
</template>
```

### `defineProps` 문법

```html
<script>
  // 타입만 선언 (기본값 없음)
  const props = defineProps<{
    name: string;
    age: number;
    active: boolean;
  }>();

  // 기본값과 함께 선언
  const props = defineProps({
    name: { type: String, required: true },
    age:  { type: Number, default: 0 },
    active: { type: Boolean, default: false },
  });
</script>
```

## 2. Props 전달

부모 컴포넌트에서 자식 컴포넌트를 사용할 때 Props를 전달합니다.

```html
<script>
  import TodoItem from "../components/TodoItem.vaisx";

  const todos = __vx_state([
    { id: 1, text: "VaisX 배우기", done: true },
    { id: 2, text: "컴포넌트 만들기", done: false },
  ]);
</script>

<template>
  <ul>
    @each(todos.value as todo)
      <!--
        :prop={값} 형태로 Props를 전달합니다.
        콜론(:)이 있으면 JavaScript 식으로 평가됩니다.
      -->
      <TodoItem
        :id={todo.id}
        :text={todo.text}
        :done={todo.done}
      />
    @end
  </ul>
</template>
```

### Props 전달 문법

| 문법 | 설명 |
|------|------|
| `:prop={식}` | JavaScript 식 (숫자, 불리언, 객체 등) |
| `prop="문자열"` | 정적 문자열 |
| `:prop` | `prop={true}`의 축약형 (불리언 Props) |

```html
<!-- 정적 문자열 -->
<Button label="저장" />

<!-- JavaScript 식 -->
<Button :label={buttonLabel.value} :disabled={isLoading.value} />

<!-- 불리언 축약형 -->
<Button primary />
<!-- 위 아래는 동일합니다 -->
<Button :primary={true} />
```

## 3. 이벤트 에밋

자식 컴포넌트에서 부모 컴포넌트로 이벤트를 올려보냅니다(emit).

`TodoItem.vaisx`에 완료/삭제 버튼을 추가하고 이벤트를 에밋합니다.

```html
<script>
  const props = defineProps<{
    id: number;
    text: string;
    done: boolean;
  }>();

  // defineEmits로 에밋할 이벤트를 정의합니다.
  const emit = defineEmits<{
    toggle: [id: number];
    delete: [id: number];
  }>();

  function handleToggle() {
    // 이벤트 이름과 전달할 데이터를 함께 에밋합니다.
    emit("toggle", props.id);
  }

  function handleDelete() {
    emit("delete", props.id);
  }
</script>

<template>
  <li class="todo-item" :class="{ done: props.done }">
    <div class="todo-content">
      @if(props.done)
        <span class="status done-icon">✓</span>
        <s>{props.text}</s>
      @else
        <span class="status pending-icon">○</span>
        <span>{props.text}</span>
      @end
    </div>

    <div class="actions">
      @if(!props.done)
        <button @on:click={handleToggle} class="btn-complete">완료</button>
      @end
      <button @on:click={handleDelete} class="btn-delete">삭제</button>
    </div>
  </li>
</template>
```

### 부모 컴포넌트에서 이벤트 수신

`@on:이벤트명` 지시문으로 자식 컴포넌트의 이벤트를 수신합니다.

```html
<script>
  import TodoItem from "../components/TodoItem.vaisx";

  const todos = __vx_state([/* ... */]);

  function handleToggle(id: number) {
    todos.value = todos.value.map((t) =>
      t.id === id ? { ...t, done: !t.done } : t
    );
  }

  function handleDelete(id: number) {
    todos.value = todos.value.filter((t) => t.id !== id);
  }
</script>

<template>
  <ul>
    @each(todos.value as todo)
      <TodoItem
        :id={todo.id}
        :text={todo.text}
        :done={todo.done}
        @on:toggle={handleToggle}
        @on:delete={handleDelete}
      />
    @end
  </ul>
</template>
```

## 4. 슬롯 (`<slot>`)

슬롯을 사용하면 부모가 자식 컴포넌트의 내부 HTML을 직접 채울 수 있습니다. 이를 통해 **레이아웃 컴포넌트**를 만들 수 있습니다.

### 기본 슬롯

`app/components/Card.vaisx`를 만듭니다.

```html
<script>
  const props = defineProps<{
    title?: string;
  }>();
</script>

<template>
  <div class="card">
    @if(props.title)
      <div class="card-header">
        <h2>{props.title}</h2>
      </div>
    @end

    <div class="card-body">
      <!--
        <slot />은 부모가 전달한 내용이 렌더링될 위치입니다.
      -->
      <slot />
    </div>
  </div>
</template>

<style>
  .card {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .card-header {
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .card-header h2 {
    margin: 0;
    font-size: 18px;
  }

  .card-body {
    padding: 20px;
  }
</style>
```

`Card` 컴포넌트를 사용하는 방법입니다.

```html
<script>
  import Card from "../components/Card.vaisx";
</script>

<template>
  <Card title="사용자 정보">
    <!-- 이 내용이 Card의 <slot /> 자리에 들어갑니다 -->
    <p>이름: 홍길동</p>
    <p>이메일: hong@example.com</p>
  </Card>
</template>
```

### 명명된 슬롯 (Named Slots)

여러 슬롯이 필요할 때는 이름을 붙입니다.

```html
<!-- app/components/PageLayout.vaisx -->
<template>
  <div class="layout">
    <header class="layout-header">
      <!-- "header"라는 이름의 슬롯 -->
      <slot name="header" />
    </header>

    <main class="layout-main">
      <!-- 이름 없는 기본 슬롯 -->
      <slot />
    </main>

    <footer class="layout-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>
```

명명된 슬롯에 내용을 전달하려면 `slot` 속성을 사용합니다.

```html
<script>
  import PageLayout from "../components/PageLayout.vaisx";
</script>

<template>
  <PageLayout>
    <!-- slot="header"로 헤더 슬롯에 전달 -->
    <div slot="header">
      <h1>내 앱</h1>
      <nav>...</nav>
    </div>

    <!-- slot 속성 없으면 기본 슬롯 -->
    <p>여기는 메인 콘텐츠입니다.</p>

    <div slot="footer">
      <p>© 2026 내 앱</p>
    </div>
  </PageLayout>
</template>
```

### 슬롯 기본값 (Fallback Content)

슬롯에 내용이 전달되지 않았을 때 보여줄 기본 내용을 지정할 수 있습니다.

```html
<template>
  <div class="card-body">
    <slot>
      <!-- 부모가 내용을 전달하지 않으면 이 내용이 표시됩니다 -->
      <p class="empty-slot">내용이 없습니다.</p>
    </slot>
  </div>
</template>
```

## 5. 완성된 컴포넌트 예제

지금까지 배운 개념을 모두 적용한 `TodoItem.vaisx`의 최종 코드입니다.

```html
<script>
  const props = defineProps<{
    id: number;
    text: string;
    done: boolean;
  }>();

  const emit = defineEmits<{
    toggle: [id: number];
    delete: [id: number];
  }>();
</script>

<template>
  <li class="todo-item" :class="{ done: props.done }">
    <button
      class="toggle-btn"
      @on:click={() => emit("toggle", props.id)}
      :aria-label="props.done ? '완료 취소' : '완료로 표시'"
    >
      @if(props.done)
        <span class="icon">✓</span>
      @else
        <span class="icon">○</span>
      @end
    </button>

    <span class="todo-text" :class="{ strikethrough: props.done }">
      {props.text}
    </span>

    <button
      class="delete-btn"
      @on:click={() => emit("delete", props.id)}
      aria-label="삭제"
    >
      ✕
    </button>
  </li>
</template>

<style>
  .todo-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    transition: background 0.1s;
  }

  .todo-item:hover {
    background: #f9fafb;
  }

  .toggle-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    font-size: 18px;
    color: #6b7280;
    flex-shrink: 0;
  }

  .todo-item.done .toggle-btn {
    color: #22c55e;
  }

  .todo-text {
    flex: 1;
    font-size: 15px;
  }

  .todo-text.strikethrough {
    text-decoration: line-through;
    color: #9ca3af;
  }

  .delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    font-size: 14px;
    color: #d1d5db;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
  }

  .todo-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: #ef4444;
  }
</style>
```

## 정리

| 개념 | 문법 | 방향 |
|------|------|------|
| Props 정의 | `defineProps<{...}>()` | 부모 → 자식 |
| Props 전달 | `:prop={값}` | 부모 → 자식 |
| 이벤트 정의 | `defineEmits<{...}>()` | — |
| 이벤트 에밋 | `emit("이벤트명", 데이터)` | 자식 → 부모 |
| 이벤트 수신 | `@on:이벤트명={핸들러}` | 자식 → 부모 |
| 기본 슬롯 | `<slot />` | 부모 → 자식 |
| 명명된 슬롯 | `<slot name="이름" />` | 부모 → 자식 |
| 슬롯 전달 | `<div slot="이름">` | 부모 → 자식 |

---

여기까지 VaisX의 핵심 개념을 모두 배웠습니다. 더 깊은 내용은 [가이드](/guide)와 [API 레퍼런스](/api)를 참고하세요.
