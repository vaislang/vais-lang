# TODO 앱

카운터보다 조금 더 실용적인 TODO 앱을 만들어봅니다. 이번 튜토리얼에서는 **리스트 렌더링**, **조건부 렌더링**, **폼 입력 바인딩**, **서버 액션을 이용한 CRUD**를 배웁니다.

## 목표

- 할 일 목록을 화면에 표시 (`@each`)
- 완료 여부에 따라 다른 UI 표시 (`@if` / `@else`)
- 입력 필드로 새 항목 추가
- 항목 완료 처리 & 삭제
- 서버 액션으로 데이터 저장

## 1. 파일 생성

```
app/
└── pages/
    └── todo.vaisx    ← 새로 만들 파일
```

## 2. 기본 상태 구조 설계

`<script>` 블록에서 TODO 항목의 타입과 초기 상태를 정의합니다.

```html
<script>
  // TypeScript 타입 정의
  interface Todo {
    id: number;
    text: string;
    done: boolean;
  }

  // 할 일 목록 (반응형 배열)
  const todos = __vx_state<Todo[]>([
    { id: 1, text: "VaisX 설치하기", done: true },
    { id: 2, text: "첫 번째 컴포넌트 만들기", done: false },
    { id: 3, text: "TODO 앱 완성하기", done: false },
  ]);

  // 새 항목 입력값
  const newText = __vx_state("");

  // 파생 상태: 완료되지 않은 항목 수
  const remaining = __vx_derived(
    () => todos.value.filter((t) => !t.done).length
  );
</script>
```

## 3. 리스트 렌더링 (`@each`)

`@each` 지시문으로 배열을 순회하며 각 항목을 렌더링합니다.

```html
<template>
  <ul class="todo-list">
    @each(todos.value as todo, index)
      <li class="todo-item">
        <span>{index + 1}. {todo.text}</span>
      </li>
    @end
  </ul>
</template>
```

### `@each` 문법

```html
@each(배열 as 항목변수, 인덱스변수)
  <!-- 반복할 HTML -->
@end
```

- `배열` — 순회할 반응형 상태 또는 일반 배열
- `항목변수` — 각 항목에 접근할 변수 이름
- `인덱스변수` — 현재 인덱스 (선택 사항)

> **주의:** `@each` 블록 내부에서 `todo`는 반응형 객체가 아닌 일반 값입니다. 항목의 값을 변경하려면 `todos.value` 배열 자체를 교체해야 합니다.

## 4. 조건부 렌더링 (`@if` / `@else`)

완료 여부에 따라 다른 UI를 보여줍니다.

```html
<template>
  <ul class="todo-list">
    @each(todos.value as todo)
      <li class="todo-item" :class="{ done: todo.done }">
        @if(todo.done)
          <!-- 완료된 항목 -->
          <span class="checkmark">✓</span>
          <s>{todo.text}</s>
        @else
          <!-- 미완료 항목 -->
          <span class="circle">○</span>
          <span>{todo.text}</span>
        @end

        <div class="actions">
          @if(!todo.done)
            <button @on:click={() => toggleTodo(todo.id)}>완료</button>
          @end
          <button @on:click={() => deleteTodo(todo.id)}>삭제</button>
        </div>
      </li>
    @end
  </ul>
</template>
```

### `@if` / `@else` 문법

```html
@if(조건)
  <!-- 조건이 true일 때 렌더링 -->
@else if(다른 조건)
  <!-- 다른 조건이 true일 때 렌더링 -->
@else
  <!-- 모든 조건이 false일 때 렌더링 -->
@end
```

목록이 비어있을 때 빈 상태 메시지를 보여주는 예시입니다.

```html
@if(todos.value.length === 0)
  <p class="empty">할 일이 없습니다. 새 항목을 추가해보세요!</p>
@else
  <ul class="todo-list">
    @each(todos.value as todo)
      <!-- ... -->
    @end
  </ul>
@end
```

## 5. 폼 입력 바인딩 (`:bind`)

`:bind` 지시문으로 입력 필드와 상태를 양방향으로 연결합니다.

```html
<template>
  <form @on:submit={handleSubmit} class="add-form">
    <input
      type="text"
      :bind={newText}
      placeholder="새 할 일을 입력하세요..."
    />
    <button type="submit">추가</button>
  </form>
</template>
```

`:bind={newText}`는 다음 두 동작을 동시에 수행합니다.

1. `newText.value`를 `input`의 `value` 속성으로 설정 (상태 → DOM)
2. 사용자가 타이핑하면 `newText.value`를 자동 업데이트 (DOM → 상태)

`<script>` 블록에서 폼 제출 핸들러를 작성합니다.

```html
<script>
  // ... 기존 상태 선언 ...

  function handleSubmit(event: Event) {
    event.preventDefault();

    const text = newText.value.trim();
    if (!text) return;

    // 새 항목을 배열에 추가
    // 배열을 직접 변이하지 않고 새 배열로 교체합니다.
    todos.value = [
      ...todos.value,
      { id: Date.now(), text, done: false },
    ];

    // 입력 필드 초기화
    newText.value = "";
  }
</script>
```

## 6. 항목 조작 함수 작성

```html
<script>
  // ... 기존 코드 ...

  // 완료 상태 토글
  function toggleTodo(id: number) {
    todos.value = todos.value.map((todo) =>
      todo.id === id ? { ...todo, done: !todo.done } : todo
    );
  }

  // 항목 삭제
  function deleteTodo(id: number) {
    todos.value = todos.value.filter((todo) => todo.id !== id);
  }
</script>
```

> **배열 업데이트 패턴:** VaisX는 `.value`에 새 값이 할당될 때 변경을 감지합니다. `todos.value.push(item)`처럼 배열을 직접 변이(mutate)하면 감지되지 않습니다. 항상 새 배열을 만들어 `.value`에 할당하세요.

## 7. 서버 액션으로 CRUD

지금까지의 코드는 브라우저 메모리에만 데이터를 저장합니다. 페이지를 새로고침하면 데이터가 사라집니다. 서버 액션을 사용하면 데이터를 서버에 저장할 수 있습니다.

### 서버 액션 파일 생성

`app/actions/todo.ts` 파일을 만듭니다.

```typescript
// app/actions/todo.ts
import { defineAction } from "@vaisx/kit";

// 서버 메모리에 임시 저장 (실제로는 DB를 사용합니다)
let store: { id: number; text: string; done: boolean }[] = [];

export const getTodos = defineAction(async () => {
  return store;
});

export const addTodo = defineAction(async (text: string) => {
  const todo = { id: Date.now(), text, done: false };
  store.push(todo);
  return todo;
});

export const toggleTodo = defineAction(async (id: number) => {
  const todo = store.find((t) => t.id === id);
  if (todo) todo.done = !todo.done;
  return todo;
});

export const deleteTodo = defineAction(async (id: number) => {
  store = store.filter((t) => t.id !== id);
});
```

### 컴포넌트에서 서버 액션 사용

```html
<script>
  import { getTodos, addTodo, toggleTodo, deleteTodo } from "../actions/todo";

  interface Todo {
    id: number;
    text: string;
    done: boolean;
  }

  const todos = __vx_state<Todo[]>([]);
  const newText = __vx_state("");
  const remaining = __vx_derived(() => todos.value.filter((t) => !t.done).length);

  // 컴포넌트 마운트 시 서버에서 데이터 로드
  async function loadTodos() {
    todos.value = await getTodos();
  }

  loadTodos();

  async function handleSubmit(event: Event) {
    event.preventDefault();
    const text = newText.value.trim();
    if (!text) return;

    const todo = await addTodo(text);
    todos.value = [...todos.value, todo];
    newText.value = "";
  }

  async function handleToggle(id: number) {
    await toggleTodo(id);
    todos.value = todos.value.map((t) =>
      t.id === id ? { ...t, done: !t.done } : t
    );
  }

  async function handleDelete(id: number) {
    await deleteTodo(id);
    todos.value = todos.value.filter((t) => t.id !== id);
  }
</script>
```

## 8. 완성된 코드

`app/pages/todo.vaisx`의 최종 코드입니다.

```html
<script>
  import { getTodos, addTodo, toggleTodo, deleteTodo } from "../actions/todo";

  interface Todo {
    id: number;
    text: string;
    done: boolean;
  }

  const todos = __vx_state<Todo[]>([]);
  const newText = __vx_state("");
  const remaining = __vx_derived(() => todos.value.filter((t) => !t.done).length);

  async function loadTodos() {
    todos.value = await getTodos();
  }

  loadTodos();

  async function handleSubmit(event: Event) {
    event.preventDefault();
    const text = newText.value.trim();
    if (!text) return;
    const todo = await addTodo(text);
    todos.value = [...todos.value, todo];
    newText.value = "";
  }

  async function handleToggle(id: number) {
    await toggleTodo(id);
    todos.value = todos.value.map((t) =>
      t.id === id ? { ...t, done: !t.done } : t
    );
  }

  async function handleDelete(id: number) {
    await deleteTodo(id);
    todos.value = todos.value.filter((t) => t.id !== id);
  }
</script>

<template>
  <div class="todo-app">
    <h1>할 일 목록</h1>

    <p class="summary">
      @if(todos.value.length === 0)
        항목이 없습니다.
      @else
        전체 {todos.value.length}개 중 {remaining.value}개 남음
      @end
    </p>

    <form @on:submit={handleSubmit} class="add-form">
      <input
        type="text"
        :bind={newText}
        placeholder="새 할 일을 입력하세요..."
      />
      <button type="submit">추가</button>
    </form>

    @if(todos.value.length === 0)
      <p class="empty">할 일을 추가해보세요!</p>
    @else
      <ul class="todo-list">
        @each(todos.value as todo)
          <li class="todo-item" :class="{ done: todo.done }">
            <div class="todo-content">
              @if(todo.done)
                <span class="status done-icon">✓</span>
                <s>{todo.text}</s>
              @else
                <span class="status pending-icon">○</span>
                <span>{todo.text}</span>
              @end
            </div>
            <div class="actions">
              @if(!todo.done)
                <button @on:click={() => handleToggle(todo.id)} class="btn-complete">완료</button>
              @end
              <button @on:click={() => handleDelete(todo.id)} class="btn-delete">삭제</button>
            </div>
          </li>
        @end
      </ul>
    @end
  </div>
</template>

<style>
  .todo-app {
    max-width: 560px;
    margin: 40px auto;
    padding: 0 16px;
    font-family: sans-serif;
  }

  .summary {
    color: #6b7280;
    margin-bottom: 16px;
  }

  .add-form {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
  }

  .add-form input {
    flex: 1;
    padding: 10px 14px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 15px;
    outline: none;
    transition: border-color 0.15s;
  }

  .add-form input:focus {
    border-color: #3b82f6;
  }

  .add-form button {
    padding: 10px 20px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    cursor: pointer;
  }

  .todo-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .todo-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    transition: opacity 0.2s;
  }

  .todo-item.done {
    opacity: 0.5;
  }

  .todo-content {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .status {
    font-size: 18px;
    width: 24px;
    text-align: center;
  }

  .done-icon { color: #22c55e; }
  .pending-icon { color: #9ca3af; }

  .actions {
    display: flex;
    gap: 6px;
  }

  .btn-complete {
    padding: 4px 12px;
    background: #22c55e;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }

  .btn-delete {
    padding: 4px 12px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }

  .empty {
    text-align: center;
    color: #9ca3af;
    padding: 40px 0;
  }
</style>
```

`http://localhost:3000/todo`에서 완성된 TODO 앱을 확인하세요.

---

다음 단계로 [컴포넌트](/tutorial/components)를 배워 TODO 앱을 더 잘게 나눠보겠습니다.
