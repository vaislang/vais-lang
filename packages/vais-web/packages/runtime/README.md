# @vaisx/runtime

VaisX minimal runtime — the reactive core of the VaisX framework, under 3KB gzipped.

Provides the signal-based reactivity engine, component lifecycle management, and DOM reconciliation used by all VaisX applications.

## Installation

```bash
npm install @vaisx/runtime
```

## Usage

```ts
import { signal, effect, mount } from '@vaisx/runtime'

const count = signal(0)

effect(() => {
  console.log('count:', count.value)
})

count.value = 1 // logs: count: 1
```

## License

[MIT](./LICENSE) © 2026 VaisX Contributors
