# @vaisx/hmr

VaisX Hot Module Replacement — client-side HMR runtime and dev-server integration for fast, state-preserving reloads.

## Installation

```bash
npm install -D @vaisx/hmr
```

## Usage

### Server

```ts
import { createHmrServer } from '@vaisx/hmr'

const hmr = createHmrServer({ port: 24678 })
hmr.send({ type: 'update', path: '/src/App.vaisx' })
```

### Client

```ts
import { setupHmrClient } from '@vaisx/hmr/client'

setupHmrClient({ port: 24678 })
```

## License

[MIT](./LICENSE) © 2026 VaisX Contributors
