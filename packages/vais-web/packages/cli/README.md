# @vaisx/cli

VaisX CLI — build, dev server, and project scaffolding tools for `.vaisx` components.

## Installation

```bash
npm install -g @vaisx/cli
# or as a dev dependency
npm install -D @vaisx/cli
```

## Usage

```bash
# Start the development server
vaisx dev

# Build for production
vaisx build

# Create a new VaisX project
vaisx create my-app
```

### Programmatic API

```ts
import { build, createDevServer } from '@vaisx/cli'

await build({ outDir: 'dist' })
```

## License

[MIT](./LICENSE) © 2026 VaisX Contributors
