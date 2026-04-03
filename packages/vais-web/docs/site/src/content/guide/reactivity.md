# Reactivity — In Depth

VaisX uses a fine-grained reactive system inspired by SolidJS and Vue 3 signals.
Understanding how it works under the hood lets you write faster, more predictable
components.

## Dependency graph

When a `computed` or `effect` runs, VaisX records every signal that is **read**
during that execution. These reads create directed edges in an internal dependency
graph: signals are source nodes, computed values and effects are subscriber nodes.

```
signal(count) ──► computed(doubled) ──► effect(log)
                                    └──► DOM patch
```

When a signal's value changes, VaisX walks the graph from that node outward,
marking each subscriber as **dirty**. Dirty computeds are re-evaluated lazily on
next read; dirty effects are queued for the next flush.

### Pull vs. push

- **Signals** push a "dirty" notification downstream immediately on write.
- **Computed values** pull a fresh value only when someone reads them (lazy).
- **Effects** are pushed into a microtask queue and executed in topological order.

This hybrid pull/push design means unchanged branches of the graph are never
re-evaluated — only the minimal set of computeds between a changed signal and an
active effect will rerun.

## Internal primitives

### `__vx_state`

Every `signal()` call creates a `__vx_state` object:

```typescript
interface __vx_state<T> {
  _value: T;
  _subscribers: Set<__vx_derived | __vx_effect>;
  read(): T;   // tracks the current observer
  write(v: T): void; // marks subscribers dirty, schedules flush
}
```

`read()` checks the global `_activeObserver` stack. If an observer is currently
executing, it adds itself to that observer's `_deps` set and adds the observer to
its own `_subscribers` set.

### `__vx_derived`

A `computed()` call returns a `__vx_derived` node:

```typescript
interface __vx_derived<T> {
  _dirty: boolean;
  _value: T | undefined;
  _deps: Set<__vx_state | __vx_derived>;
  _fn: () => T;
  read(): T; // re-runs _fn if dirty, otherwise returns cached _value
}
```

When a dependency marks `__vx_derived` dirty, the derived node does **not**
immediately recompute. It defers until its `read()` is called, making diamonds in
the dependency graph safe with a single pass.

### `__vx_effect`

An `effect()` call creates a `__vx_effect` node that is executed eagerly and
re-queued whenever any dependency changes:

```typescript
interface __vx_effect {
  _deps: Set<__vx_state | __vx_derived>;
  _fn: () => (() => void) | void; // may return a cleanup function
  _cleanup: (() => void) | null;
  schedule(): void; // enqueues this effect for the next flush
  dispose(): void;  // removes all subscriptions
}
```

Cleanup functions returned from an effect are called **before** the effect
reruns and when `dispose()` is invoked.

```typescript
import { signal, effect } from "@vaisx/runtime";

const visible = signal(true);

effect(() => {
  const handler = () => console.log("scroll");
  window.addEventListener("scroll", handler);

  // cleanup runs before the next execution
  return () => window.removeEventListener("scroll", handler);
});
```

## Batched updates — `$$schedule` and `$$flush`

By default, every signal write is processed through VaisX's scheduler to avoid
cascading synchronous DOM updates.

### `$$schedule`

```typescript
// internal
function $$schedule(effect: __vx_effect): void {
  pendingEffects.add(effect);
  if (!flushPending) {
    flushPending = true;
    queueMicrotask($$flush);
  }
}
```

Multiple writes in the same synchronous block accumulate in `pendingEffects`
before the microtask fires, so the DOM is only updated once:

```typescript
import { signal, effect } from "@vaisx/runtime";

const x = signal(0);
const y = signal(0);

effect(() => console.log(x.value, y.value));

// Both writes are batched — effect runs once, not twice
x.value = 1;
y.value = 2;
// console output: "1 2"
```

### `$$flush`

```typescript
function $$flush(): void {
  flushPending = false;
  // Sort by topological depth so parents run before children
  const sorted = [...pendingEffects].sort((a, b) => a._depth - b._depth);
  pendingEffects.clear();
  for (const eff of sorted) {
    if (!eff._disposed) eff._run();
  }
}
```

`$$flush` is called automatically via `queueMicrotask`. You can also call it
manually in tests to assert state synchronously:

```typescript
import { signal, effect, $$flush } from "@vaisx/runtime";

const count = signal(0);
let last = 0;
effect(() => { last = count.value; });

count.value = 42;
$$flush();
console.log(last); // 42
```

### Manual batching with `batch`

For cases where you need to defer even the microtask queue, wrap multiple writes
in `batch`:

```typescript
import { batch, signal } from "@vaisx/runtime";

const a = signal(0);
const b = signal(0);

batch(() => {
  a.value = 10;
  b.value = 20;
  // effects are not flushed until batch exits
});
// effects flush here
```

## Performance optimization tips

### 1. Keep signals granular

Prefer many small signals over a single large object signal. VaisX tracks reads
at the signal level — a single large signal means all consumers re-render whenever
any property changes.

```typescript
// Avoid — any change re-renders all consumers
const state = signal({ name: "Alice", age: 30, theme: "dark" });

// Prefer — consumers subscribe to only what they need
const name  = signal("Alice");
const age   = signal(30);
const theme = signal("dark");
```

### 2. Derive expensive values with `computed`

`computed` values are cached and only recomputed when their dependencies change.
Place expensive calculations inside `computed` instead of repeating them in
effects or templates.

```typescript
import { signal, computed } from "@vaisx/runtime";

const items = signal<number[]>([]);

// Computed caches the result between updates
const total = computed(() => items.value.reduce((s, n) => s + n, 0));
```

### 3. Avoid reading signals inside loops without memoization

Reading a signal inside a tight loop re-subscribes the observer on every
iteration. Cache the read once:

```typescript
effect(() => {
  const list = items.value; // single subscription
  for (const item of list) {
    process(item);
  }
});
```

### 4. Dispose effects when components unmount

Long-lived effects that are never disposed leak memory. VaisX component
lifecycle automatically disposes effects, but if you create effects outside a
component boundary call `dispose()`:

```typescript
const stop = effect(() => {
  console.log("tracking:", count.value);
});

// later
stop();
```

### 5. Use `untrack` to read without subscribing

When you need a signal's current value without creating a dependency, use
`untrack`:

```typescript
import { signal, effect, untrack } from "@vaisx/runtime";

const trigger = signal(0);
const data    = signal("hello");

effect(() => {
  trigger.value; // this effect re-runs when trigger changes
  // data is read but NOT tracked — change to data alone won't rerun this effect
  const snapshot = untrack(() => data.value);
  console.log(snapshot);
});
```
