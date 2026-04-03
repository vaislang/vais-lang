# @vaisx/devtools

VaisX DevTools — inspector protocol and WebSocket server for the VaisX browser devtools extension.

## Installation

```bash
npm install -D @vaisx/devtools
```

## Usage

```ts
import { createDevtoolsServer } from '@vaisx/devtools'

const devtools = createDevtoolsServer({ port: 7777 })

devtools.on('inspect', (payload) => {
  console.log('Inspecting component:', payload.id)
})

devtools.broadcast({ type: 'component-update', id: 'App' })
```

## License

[MIT](./LICENSE) © 2026 VaisX Contributors
