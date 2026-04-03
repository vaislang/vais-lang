# @vaisx/plugin

VaisX plugin API — types and interfaces for authoring first-party and third-party VaisX plugins.

## Installation

```bash
npm install @vaisx/plugin
```

## Usage

```ts
import type { VaisxPlugin, TransformContext } from '@vaisx/plugin'

const myPlugin: VaisxPlugin = {
  name: 'my-vaisx-plugin',
  transform(code, id, ctx: TransformContext) {
    if (!id.endsWith('.vaisx')) return
    // transform .vaisx source
    return { code, map: null }
  },
}

export default myPlugin
```

## License

[MIT](./LICENSE) © 2026 VaisX Contributors
