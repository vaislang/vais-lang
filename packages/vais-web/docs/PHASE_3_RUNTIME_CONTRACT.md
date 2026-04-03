# VaisX 런타임 헬퍼 API 시그니처 계약

> **대상**: `@vaisx/runtime` 패키지 (packages/vaisx-runtime/)
> **목적**: vaisx-compiler/codegen_js.rs가 생성하는 런타임 헬퍼 함수의 시그니처를 확정하여 Phase 3 (런타임 구현)의 계약으로 사용
> **날짜**: 2026-03-11
> **기준**: vaisx-compiler Phase 2 완료 기준 codegen_js.rs 출력 분석

---

## 1. 개요

vaisx-compiler의 JS codegen은 `@vaisx/runtime`에서 12개 런타임 헬퍼 함수를 import하여 사용한다.
이 문서는 각 함수의 정확한 시그니처, 동작, 사용 시나리오를 정의한다.

**Import 형태:**
```js
import { $$element, $$text, $$append, $$attr, $$listen, $$schedule,
         $$anchor, $$create_fragment, $$insert_before, $$remove_fragment,
         $$set_text, $$spread } from "@vaisx/runtime";
```

---

## 2. 헬퍼 함수 시그니처

### 2.1 `$$element(tag)` -- DOM 요소 생성

```ts
function $$element(tag: string): HTMLElement;
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `tag` | `string` | HTML 태그명 (e.g., `"div"`, `"button"`, `"input"`) |

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `HTMLElement` | 생성된 DOM 요소 |

**사용 시나리오:**
```js
// codegen이 <div>, <button>, <input> 등 HTML 요소마다 호출
let $$el0 = $$element("div");
let $$el1 = $$element("button");
```

**구현 요구사항:**
- `document.createElement(tag)` 래퍼
- 최소한의 오버헤드 (인라인 가능할 정도로 단순)

---

### 2.2 `$$text(content)` -- 텍스트 노드 생성

```ts
function $$text(content: string | number | boolean): Text;
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `content` | `string \| number \| boolean` | 텍스트 내용. 숫자/불리언은 문자열로 변환 |

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `Text` | 생성된 텍스트 노드 |

**사용 시나리오:**
```js
// 정적 텍스트
let $$txt0 = $$text("Hello");
// 동적 텍스트 (변수 참조)
let $$txt1 = $$text(count);
```

**구현 요구사항:**
- `document.createTextNode(String(content))` 래퍼
- `content`가 `null` 또는 `undefined`이면 빈 문자열 처리

---

### 2.3 `$$append(parent, child)` -- 자식 노드 추가

```ts
function $$append(parent: Node, child: Node): void;
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `parent` | `Node` | 부모 노드 (HTMLElement, DocumentFragment, 또는 $$target) |
| `child` | `Node` | 추가할 자식 노드 |

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `void` | - |

**사용 시나리오:**
```js
// 요소를 부모에 추가
$$append($$el0, $$txt0);
$$append($$target, $$el0);
// Fragment를 부모에 추가
$$append($$comp0_target, $$frag);
```

**구현 요구사항:**
- `parent.appendChild(child)` 래퍼

---

### 2.4 `$$attr(el, name, value)` -- 속성 설정

```ts
function $$attr(el: HTMLElement, name: string, value: string | number | boolean | null): void;
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `el` | `HTMLElement` | 대상 요소 |
| `name` | `string` | 속성명 (e.g., `"class"`, `"value"`, `"disabled"`) |
| `value` | `string \| number \| boolean \| null` | 속성값. `null`이면 속성 제거 |

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `void` | - |

**사용 시나리오:**
```js
// 정적 속성
$$attr($$el0, "class", "container");
// 동적 속성
$$attr($$el0, "class", cls);
// 양방향 바인딩 초기값
$$attr($$el0, "value", name);
// 업데이트 함수 내 속성 갱신
$$attr($$el0, "class", cls);
```

**구현 요구사항:**
- `value`가 `null` 또는 `false`이면 `el.removeAttribute(name)`
- `value`가 `true`이면 `el.setAttribute(name, "")` (boolean 속성)
- 그 외: `el.setAttribute(name, String(value))`
- 특수 속성 (`value`, `checked`, `selected` 등)은 프로퍼티 직접 설정: `el[name] = value`

---

### 2.5 `$$listen(el, event, handler, modifiers?)` -- 이벤트 리스너 등록

```ts
function $$listen(
  el: HTMLElement,
  event: string,
  handler: (e: Event) => void,
  modifiers?: { preventDefault?: boolean; stopPropagation?: boolean; once?: boolean; passive?: boolean }
): (() => void);
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `el` | `HTMLElement` | 대상 요소 |
| `event` | `string` | 이벤트명 (e.g., `"click"`, `"input"`, `"submit"`) |
| `handler` | `(e: Event) => void` | 이벤트 핸들러 |
| `modifiers` | `object` (optional) | 이벤트 수정자 |

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `() => void` | 리스너 제거 함수 (cleanup) |

**사용 시나리오:**
```js
// 기본 이벤트
$$listen($$el0, "click", increment);
// 수정자 포함
$$listen($$el0, "submit", handleSubmit, { preventDefault: true });
// 복수 수정자
$$listen($$el0, "click", handleClick, { preventDefault: true, stopPropagation: true });
// 양방향 바인딩 자동 생성
$$listen($$el0, "input", (e) => { name = e.target.value; $$update(); });
$$listen($$el0, "change", (e) => { checked = e.target.checked; $$update(); });
```

**구현 요구사항:**
- 수정자 처리: `preventDefault` -> handler 실행 전 `e.preventDefault()`, 등
- `once` 수정자 -> `addEventListener` 옵션으로 전달
- `passive` 수정자 -> `addEventListener` 옵션으로 전달
- cleanup 함수 반환: `() => el.removeEventListener(event, wrappedHandler)`

---

### 2.6 `$$schedule(fn)` -- 마이크로태스크 스케줄링

```ts
function $$schedule(fn: () => void): void;
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `fn` | `() => void` | 실행할 함수 |

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `void` | - |

**사용 시나리오:**
```js
// 상태 변경 후 업데이트 스케줄링
function increment() { count += 1
    $$schedule($$update);
}
// 이펙트 실행 스케줄링
$$schedule(() => {
    console_log(count)
});
```

**구현 요구사항:**
- 배치 큐: 같은 마이크로태스크 턴에서 여러 `$$schedule` 호출이 있으면 큐에 추가
- `queueMicrotask` 기반 flush: 동기 코드 완료 후 큐의 모든 함수를 순서대로 실행
- 중복 방지: 같은 `$$update` 함수가 여러 번 스케줄되어도 한 번만 실행 (중복 제거)

```ts
// 참고 구현 (ARCHITECTURE.md 5.3절)
let dirty = false;
const queue: (() => void)[] = [];

function $$schedule(updater: () => void) {
  queue.push(updater);
  if (!dirty) {
    dirty = true;
    queueMicrotask($$flush);
  }
}

function $$flush() {
  for (const fn of queue) fn();
  queue.length = 0;
  dirty = false;
}
```

---

### 2.7 `$$anchor()` -- 앵커 코멘트 노드 생성

```ts
function $$anchor(): Comment;
```

| 파라미터 | 없음 | |
|---------|------|------|

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `Comment` | 위치 마커 코멘트 노드 |

**사용 시나리오:**
```js
// 조건부 렌더링 앵커
let $$if_anchor0 = $$anchor();
$$append($$target, $$if_anchor0);
// 리스트 렌더링 앵커
let $$each_anchor0 = $$anchor();
$$append($$target, $$each_anchor0);
// @await 앵커
let $$await_anchor0 = $$anchor();
$$append($$target, $$await_anchor0);
```

**구현 요구사항:**
- `document.createComment("")` 래퍼
- 빈 코멘트 노드: 렌더링에 영향 없이 DOM 위치를 표시

---

### 2.8 `$$create_fragment()` -- DocumentFragment 생성

```ts
function $$create_fragment(): DocumentFragment;
```

| 파라미터 | 없음 | |
|---------|------|------|

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `DocumentFragment` | 빈 DocumentFragment |

**사용 시나리오:**
```js
// @if 분기 렌더링
function $$if0_branch0($$parent) {
  let $$frag = $$create_fragment();
  // ... children ...
  return $$frag;
}
// @each 아이템 렌더링
function $$each0_render(item) {
  let $$frag = $$create_fragment();
  // ... children ...
  return $$frag;
}
// 네임드 슬롯
let $$slot_0_header = $$create_fragment();
```

**구현 요구사항:**
- `document.createDocumentFragment()` 래퍼
- 주의: DocumentFragment는 DOM에 삽입되면 자식 노드가 이동하므로, 반환된 fragment에 대한 참조를 유지해야 함

---

### 2.9 `$$insert_before(parent, node, anchor)` -- 앵커 앞에 노드 삽입

```ts
function $$insert_before(parent: Node, node: Node, anchor: Node): void;
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `parent` | `Node` | 부모 노드 |
| `node` | `Node` | 삽입할 노드 (Element, Fragment) |
| `anchor` | `Node` | 이 노드 앞에 삽입 (앵커 코멘트 노드) |

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `void` | - |

**사용 시나리오:**
```js
// 조건부 블록 삽입
$$insert_before($$target, $$if_current0, $$if_anchor0);
// 리스트 아이템 삽입
$$insert_before($$target, $$frag, $$each_anchor0);
// @await 결과 삽입
$$insert_before($$target, $$await_current0, $$await_anchor0);
```

**구현 요구사항:**
- `parent.insertBefore(node, anchor)` 래퍼

---

### 2.10 `$$remove_fragment(node)` -- Fragment/노드 제거

```ts
function $$remove_fragment(node: Node): void;
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `node` | `Node` | 제거할 노드 (Fragment 또는 Element) |

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `void` | - |

**사용 시나리오:**
```js
// 조건부 블록 교체 시 기존 제거
if ($$if_current0 !== null) { $$remove_fragment($$if_current0); }
// 리스트 업데이트 시 기존 아이템 제거
for (let $$i = 0; $$i < $$each_items0.length; $$i++) {
  $$remove_fragment($$each_items0[$$i]);
}
// 컴포넌트 소멸 시 정리
$$destroy() { ... }
```

**구현 요구사항:**
- `node.remove()` 또는 `node.parentNode.removeChild(node)` 래퍼
- Fragment의 경우: Fragment 자체는 DOM에서 이미 분리되었을 수 있으므로, Fragment에 포함된 모든 자식 노드를 개별 제거해야 할 수 있음
- 주의: DocumentFragment는 insertBefore 시 자식이 이동하므로, fragment 참조가 아닌 실제 DOM 노드 참조를 추적해야 함 (구현 시 fragment를 wrapper div 또는 노드 배열로 대체 검토)

---

### 2.11 `$$set_text(node, value)` -- 텍스트 노드 내용 갱신

```ts
function $$set_text(node: Text, value: string | number | boolean): void;
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `node` | `Text` | 대상 텍스트 노드 |
| `value` | `string \| number \| boolean` | 새 텍스트 내용 |

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `void` | - |

**사용 시나리오:**
```js
// $$update() 함수 내에서 반응성 텍스트 갱신
function $$update() {
  // ...
  $$set_text($$txt0, count);
  $$set_text($$txt1, doubled);
}
```

**구현 요구사항:**
- `node.data = String(value)` 래퍼
- 이전 값과 동일하면 DOM 조작 스킵 (선택적 최적화)

---

### 2.12 `$$spread(el, props)` -- 속성 스프레드

```ts
function $$spread(el: HTMLElement, props: Record<string, unknown>): void;
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `el` | `HTMLElement` | 대상 요소 |
| `props` | `Record<string, unknown>` | 속성 객체 |

| 반환 | 타입 | 설명 |
|------|------|------|
| - | `void` | - |

**사용 시나리오:**
```js
// 템플릿에서 {...props} 스프레드 사용 시
$$spread($$el0, someProps);
```

**구현 요구사항:**
- `Object.entries(props)` 순회하여 각 속성을 `$$attr(el, key, value)` 로 설정
- 이벤트 핸들러 (`on` 접두사) 감지 시 `$$listen` 으로 위임
- `class`, `style` 등 특수 속성 병합 처리

---

## 3. 런타임 내부 함수 (export 불필요)

codegen이 직접 생성하는 코드에서 사용되지만, import하지 않는 내부 함수들:

| 함수 | 용도 | 생성 위치 |
|------|------|----------|
| `$$update()` | 컴포넌트의 반응성 업데이트 함수 | codegen이 컴포넌트마다 인라인 생성 |
| `$$destroy()` | 컴포넌트 소멸 정리 | codegen이 lifecycle 객체 내에 생성 |
| `$$if{N}_update()` | 조건부 블록 업데이트 | codegen이 @if 블록마다 인라인 생성 |
| `$$each{N}_update()` | 리스트 블록 업데이트 | codegen이 @each 블록마다 인라인 생성 |
| `$$if{N}_branch{M}()` | 조건부 분기 렌더러 | codegen이 @if/@elif/@else 분기마다 생성 |
| `$$each{N}_render()` | 리스트 아이템 렌더러 | codegen이 @each 블록마다 생성 |
| `$$await{N}_loading()` | @await 로딩 상태 렌더러 | codegen이 @await 블록마다 생성 |
| `$$await{N}_ok()` | @await 성공 상태 렌더러 | codegen이 @await 블록마다 생성 |
| `$$await{N}_err()` | @await 에러 상태 렌더러 | codegen이 @await 블록마다 생성 |

---

## 4. Import 의존성 매트릭스

codegen 기능별로 어떤 런타임 헬퍼가 import되는지:

| codegen 기능 | 필요한 런타임 헬퍼 |
|-------------|------------------|
| HTML 요소 생성 | `$$element`, `$$append` |
| 텍스트 노드 | `$$text`, `$$append` |
| 정적/동적 속성 | `$$attr` |
| 이벤트 바인딩 | `$$listen` |
| 양방향 바인딩 (`:prop`) | `$$attr`, `$$listen` |
| 스프레드 속성 (`{...}`) | `$$spread` |
| 상태 변경 invalidation | `$$schedule` |
| 이펙트 실행 | `$$schedule` |
| 반응성 텍스트 갱신 | `$$set_text` |
| 조건부 렌더링 (`@if`) | `$$anchor`, `$$create_fragment`, `$$insert_before`, `$$remove_fragment`, `$$append` |
| 리스트 렌더링 (`@each`) | `$$anchor`, `$$create_fragment`, `$$insert_before`, `$$remove_fragment`, `$$append` |
| 비동기 렌더링 (`@await`) | `$$anchor`, `$$create_fragment`, `$$insert_before`, `$$remove_fragment`, `$$append` |
| 컴포넌트 인스턴스 | `$$element`, `$$append` |
| 네임드 슬롯 | `$$create_fragment` |

---

## 5. 크기 예산

ARCHITECTURE.md 5.2절 기준:

| 모듈 | 포함 함수 | 목표 크기 (gzipped) |
|------|----------|-------------------|
| DOM 헬퍼 | `$$element`, `$$text`, `$$append`, `$$attr`, `$$set_text`, `$$spread`, `$$anchor`, `$$create_fragment`, `$$insert_before`, `$$remove_fragment` | ~400B |
| 이벤트 | `$$listen` | ~300B |
| 스케줄러 | `$$schedule` (+ 내부 `$$flush`) | ~500B |
| **합계** | 12개 함수 | **< 1.2KB** (Phase 3에서 생명주기 + 동적 시그널 별도) |

---

## 6. Phase 3 구현 체크리스트

- [ ] `packages/vaisx-runtime/src/dom.ts` -- $$element, $$text, $$append, $$attr, $$set_text, $$anchor, $$create_fragment, $$insert_before, $$remove_fragment, $$spread
- [ ] `packages/vaisx-runtime/src/event.ts` -- $$listen
- [ ] `packages/vaisx-runtime/src/scheduler.ts` -- $$schedule, $$flush
- [ ] `packages/vaisx-runtime/src/index.ts` -- re-export all 12 helpers
- [ ] E2E 테스트: codegen 출력 JS를 jsdom에서 실행하여 DOM 결과 검증
- [ ] 크기 검증: gzipped < 1.2KB (12개 헬퍼만)
