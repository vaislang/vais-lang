# @vaisx/runtime

Minimal runtime (< 3 KB gzipped) consumed by `vaisx-compiler` codegen output.
All exports are prefixed with `$$` to indicate they are compiler-internal helpers,
except for the public signal API (`createSignal`, `createComputed`, `createEffect`, `track`).

## Installation

```bash
pnpm add @vaisx/runtime
```

---

## DOM Helpers

Low-level DOM mutation functions used by compiled component output.

### `$$element`

```typescript
function $$element(tag: string): HTMLElement
```

Creates an HTML element with `document.createElement`.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `tag` | `string` | HTML tag name (e.g. `"div"`, `"span"`) |

**Returns** `HTMLElement`

**Example**

```typescript
import { $$element } from "@vaisx/runtime";

const div = $$element("div");
document.body.appendChild(div);
```

---

### `$$text`

```typescript
function $$text(
  content: string | number | boolean | null | undefined
): Text
```

Creates a DOM text node. `null` and `undefined` produce an empty string.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `content` | `string \| number \| boolean \| null \| undefined` | Text content |

**Returns** `Text`

**Example**

```typescript
import { $$text } from "@vaisx/runtime";

const node = $$text("Hello, world!");
document.body.appendChild(node);
```

---

### `$$append`

```typescript
function $$append(parent: Node, child: Node): void
```

Appends `child` to `parent` via `parent.appendChild(child)`.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `parent` | `Node` | Parent DOM node |
| `child` | `Node` | Child node to append |

**Example**

```typescript
import { $$element, $$text, $$append } from "@vaisx/runtime";

const p = $$element("p");
const text = $$text("Hello");
$$append(p, text);
```

---

### `$$attr`

```typescript
function $$attr(
  el: HTMLElement,
  name: string,
  value: string | number | boolean | null | undefined,
): void
```

Sets or removes an attribute on an element. Special DOM properties
(`value`, `checked`, `selected`, `disabled`, `readOnly`, `multiple`,
`indeterminate`) are assigned directly as properties instead of using
`setAttribute`.

- `null` / `undefined` / `false` → removes the attribute
- `true` → sets the attribute to `""`
- All other values → converted to string via `String(value)`

**Parameters**

| Name | Type | Description |
|---|---|---|
| `el` | `HTMLElement` | Target element |
| `name` | `string` | Attribute / property name |
| `value` | `string \| number \| boolean \| null \| undefined` | Value to set |

**Example**

```typescript
import { $$element, $$attr } from "@vaisx/runtime";

const input = $$element("input") as HTMLInputElement;
$$attr(input, "type", "text");
$$attr(input, "disabled", true);
$$attr(input, "placeholder", "Enter text");
```

---

### `$$set_text`

```typescript
function $$set_text(
  node: Text,
  value: string | number | boolean | null | undefined,
): void
```

Updates the `data` property of a text node. No-ops if the value has not
changed (avoids unnecessary DOM mutations).

**Parameters**

| Name | Type | Description |
|---|---|---|
| `node` | `Text` | Target text node |
| `value` | `string \| number \| boolean \| null \| undefined` | New text content |

**Example**

```typescript
import { $$text, $$set_text } from "@vaisx/runtime";

const node = $$text("initial");
$$set_text(node, "updated");
```

---

### `$$anchor`

```typescript
function $$anchor(): Comment
```

Creates an empty comment node used as a positional anchor / placeholder in
the DOM (e.g. for conditional blocks or list boundaries).

**Returns** `Comment`

**Example**

```typescript
import { $$anchor, $$insert_before } from "@vaisx/runtime";

const anchor = $$anchor();
document.body.appendChild(anchor);
// Later, insert content before the anchor
$$insert_before(document.body, someNode, anchor);
```

---

### `$$create_fragment`

```typescript
function $$create_fragment(): DocumentFragment
```

Creates a `DocumentFragment` for batching multiple DOM insertions.

**Returns** `DocumentFragment`

**Example**

```typescript
import { $$create_fragment, $$element, $$append } from "@vaisx/runtime";

const frag = $$create_fragment();
$$append(frag, $$element("li"));
$$append(frag, $$element("li"));
document.querySelector("ul")!.appendChild(frag);
```

---

### `$$insert_before`

```typescript
function $$insert_before(parent: Node, node: Node, anchor: Node): void
```

Inserts `node` before `anchor` inside `parent` using `parent.insertBefore`.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `parent` | `Node` | Parent node |
| `node` | `Node` | Node to insert |
| `anchor` | `Node` | Reference node; `node` is inserted before this |

**Example**

```typescript
import { $$element, $$anchor, $$insert_before } from "@vaisx/runtime";

const list = document.querySelector("ul")!;
const anchor = $$anchor();
list.appendChild(anchor);

const item = $$element("li");
$$insert_before(list, item, anchor);
```

---

### `$$remove_fragment`

```typescript
function $$remove_fragment(node: Node): void
```

Removes `node` from its parent. No-ops if the node has no parent.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `node` | `Node` | Node to remove |

**Example**

```typescript
import { $$element, $$remove_fragment } from "@vaisx/runtime";

const div = $$element("div");
document.body.appendChild(div);
$$remove_fragment(div); // div is now detached
```

---

### `$$spread`

```typescript
function $$spread(
  el: HTMLElement,
  props: Record<string, unknown>,
): void
```

Spreads a props object onto an element. Functions whose key starts with `on`
are registered as event listeners. All other keys are forwarded to `$$attr`.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `el` | `HTMLElement` | Target element |
| `props` | `Record<string, unknown>` | Props to spread |

**Example**

```typescript
import { $$element, $$spread } from "@vaisx/runtime";

const btn = $$element("button");
$$spread(btn, {
  type: "button",
  disabled: false,
  onClick: () => console.log("clicked"),
});
```

---

## Events

### `$$listen`

```typescript
function $$listen(
  el: HTMLElement,
  event: string,
  handler: (e: Event) => void,
  modifiers?: EventModifiers,
): () => void
```

Registers an event listener with optional modifiers. Returns a cleanup
function that removes the listener when called.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `el` | `HTMLElement` | Target element |
| `event` | `string` | Event name (e.g. `"click"`, `"input"`) |
| `handler` | `(e: Event) => void` | Event handler |
| `modifiers` | `EventModifiers` (optional) | Modifier options |

**`EventModifiers`**

```typescript
interface EventModifiers {
  preventDefault?: boolean;
  stopPropagation?: boolean;
  once?: boolean;
  passive?: boolean;
}
```

**Returns** `() => void` — call to remove the listener.

**Example**

```typescript
import { $$element, $$listen } from "@vaisx/runtime";

const btn = $$element("button");
document.body.appendChild(btn);

const cleanup = $$listen(btn, "click", (e) => {
  console.log("clicked");
}, { preventDefault: true, once: true });

// Later:
cleanup();
```

---

## Scheduler

Microtask-based batch scheduler. Deduplicates same-reference functions so each
render function runs at most once per microtask tick.

### `$$schedule`

```typescript
function $$schedule(fn: () => void): void
```

Enqueues `fn` for execution in the next microtask flush. If `fn` is already
queued it will not be added again.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `fn` | `() => void` | Function to schedule |

**Example**

```typescript
import { $$schedule } from "@vaisx/runtime";

const render = () => console.log("render");
$$schedule(render);
$$schedule(render); // deduplicated — runs only once
```

---

### `$$flush`

```typescript
function $$flush(): void
```

Immediately executes all queued functions in order, then resets the queue.
Called automatically via `queueMicrotask` after the first `$$schedule` call;
can also be invoked manually in tests.

**Example**

```typescript
import { $$schedule, $$flush } from "@vaisx/runtime";

$$schedule(() => console.log("a"));
$$schedule(() => console.log("b"));
$$flush(); // logs: a  b
```

---

## Lifecycle

### `ComponentInstance`

```typescript
interface ComponentInstance {
  $$update?: () => void;
  $$destroy?: () => void;
}
```

Object returned by a compiled component function. Both methods are optional.

| Property | Type | Description |
|---|---|---|
| `$$update` | `() => void` (optional) | Re-renders the component with new props |
| `$$destroy` | `() => void` (optional) | Tears down DOM nodes and cleans up listeners |

---

### `$$mount`

```typescript
function $$mount(
  target: HTMLElement,
  componentFn: (target: HTMLElement) => ComponentInstance,
): ComponentInstance
```

Mounts a compiled component onto a target DOM node by invoking `componentFn`
with the target. Returns the `ComponentInstance` for later updates/teardown.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `target` | `HTMLElement` | DOM node to mount into |
| `componentFn` | `(target: HTMLElement) => ComponentInstance` | Compiled component factory |

**Returns** `ComponentInstance`

**Example**

```typescript
import { $$mount, $$destroy } from "@vaisx/runtime";
import { MyComponent } from "./MyComponent.js";

const instance = $$mount(document.getElementById("app")!, MyComponent);

// Later, unmount:
$$destroy(instance);
```

---

### `$$destroy`

```typescript
function $$destroy(instance: ComponentInstance | null | undefined): void
```

Destroys a component instance by calling its `$$destroy` method. Safe to call
with `null` or `undefined`.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `instance` | `ComponentInstance \| null \| undefined` | Instance to destroy |

**Example**

```typescript
import { $$mount, $$destroy } from "@vaisx/runtime";
import { MyComponent } from "./MyComponent.js";

const instance = $$mount(document.getElementById("app")!, MyComponent);
$$destroy(instance);
```

---

## Signals

Runtime reactive primitives. The compiler generates direct variable tracking
where possible; these functions are the dynamic fallback.

### `Signal<T>`

```typescript
interface Signal<T> {
  (): T;           // call to read the current value (tracks dependencies)
  set(value: T): void; // update the value and notify subscribers
}
```

---

### `createSignal`

```typescript
function createSignal<T>(initialValue: T): Signal<T>
```

Creates a reactive signal. Reading the signal inside a `createComputed` or
`createEffect` callback automatically registers it as a dependency.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `initialValue` | `T` | Initial value |

**Returns** `Signal<T>`

**Example**

```typescript
import { createSignal } from "@vaisx/runtime";

const count = createSignal(0);

console.log(count()); // 0
count.set(1);
console.log(count()); // 1
```

---

### `createComputed`

```typescript
function createComputed<T>(fn: () => T): Signal<T>
```

Creates a derived signal that re-evaluates `fn` whenever any signal read
inside `fn` changes.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `fn` | `() => T` | Computation function |

**Returns** `Signal<T>` — a read-only derived signal.

**Example**

```typescript
import { createSignal, createComputed } from "@vaisx/runtime";

const price = createSignal(10);
const qty = createSignal(3);
const total = createComputed(() => price() * qty());

console.log(total()); // 30
price.set(20);
console.log(total()); // 60
```

---

### `createEffect`

```typescript
function createEffect(fn: () => void | (() => void)): () => void
```

Runs `fn` immediately, tracks any signals read during execution, and
re-runs `fn` whenever a dependency changes. `fn` may return a cleanup
function that is called before the next run.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `fn` | `() => void \| (() => void)` | Effect function; optionally returns a cleanup |

**Returns** `() => void` — call to stop the effect.

**Example**

```typescript
import { createSignal, createEffect } from "@vaisx/runtime";

const name = createSignal("Alice");

const stop = createEffect(() => {
  console.log("Hello,", name());
  return () => console.log("cleanup");
});
// logs: Hello, Alice

name.set("Bob");
// logs: cleanup
// logs: Hello, Bob

stop();
```

---

### `track`

```typescript
function track<T>(fn: () => T, subscriber: () => void): T
```

Runs `fn` while registering `subscriber` as the current tracker for any
signal reads that occur inside `fn`. Used internally by `createComputed`
and `createEffect`.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `fn` | `() => T` | Function to run while tracking |
| `subscriber` | `() => void` | Callback registered as a dependency subscriber |

**Returns** `T` — the return value of `fn`.

> **Note:** `track` is a low-level primitive. Prefer `createComputed` and
> `createEffect` for application code.
