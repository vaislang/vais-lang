# @vaisx/cli

Command-line interface and programmatic API for scaffolding, developing,
and building VaisX applications.

## Installation

```bash
pnpm add -D @vaisx/cli
# or globally
pnpm add -g @vaisx/cli
```

---

## CLI Commands

### `vaisx dev`

Start a development server with file watching and Hot Module Replacement (HMR).

```bash
vaisx dev [options]
```

**Options**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--src <dir>` | `string` | from config or `"src"` | Source directory |
| `--out <dir>` | `string` | from config or `"dist"` | Output directory |
| `--port <port>` | `number` | `5173` | Development server port |
| `--host <host>` | `string` | `"localhost"` | Development server host |

**Behavior**

1. Loads `vaisx.config.ts` (or `.js`) from the current directory.
2. Runs an initial compilation of all `.vaisx` files.
3. Starts an HTTP server with file watching and HMR.
4. Shuts down cleanly on `SIGINT` / `SIGTERM`.

**Example**

```bash
# Start on the default port
vaisx dev

# Custom port and host
vaisx dev --port 3000 --host 0.0.0.0

# Specify a custom source directory
vaisx dev --src packages/app/src
```

---

### `vaisx build`

Compile `.vaisx` files and bundle for production.

```bash
vaisx build [options]
```

**Options**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--src <dir>` | `string` | from config or `"src"` | Source directory |
| `--out <dir>` | `string` | from config or `"dist"` | Output directory |
| `--dev` | `boolean` | `false` | Enable dev mode (extra debug info, no minification) |
| `--source-map` | `boolean` | `false` | Generate source maps alongside output files |
| `--target <target>` | `string` | `"es2022"` | esbuild compilation target |

**Behavior**

1. Loads and merges `vaisx.config.ts` with CLI flags.
2. Compiles all `.vaisx` components in `--src`.
3. Bundles with esbuild at the specified `--target`.
4. Exits with code `1` if any compilation errors occur.

**Example**

```bash
# Production build
vaisx build

# Dev build with source maps
vaisx build --dev --source-map

# Custom directories
vaisx build --src src --out public/dist

# Target older browsers
vaisx build --target es2019
```

---

### `vaisx new`

Create a new VaisX project from a template.

```bash
vaisx new <project-name> [options]
```

**Arguments**

| Argument | Description |
|---|---|
| `<project-name>` | Directory name for the new project |

**Options**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--template <name>` | `string` | `"default"` | Project template to use |
| `--no-install` | `boolean` | `false` | Skip automatic `pnpm install` after scaffolding |

**Behavior**

1. Copies the chosen template into `<project-name>/`.
2. Runs `pnpm install` unless `--no-install` is passed.
3. Prints next steps to the console.

**Example**

```bash
# Create a default project
vaisx new my-app

# Use a specific template without installing dependencies
vaisx new my-app --template minimal --no-install

# Then install and start manually
cd my-app
pnpm install
pnpm dev
```

---

### `vaisx start`

> **Note:** `vaisx start` serves the production build output produced by
> `vaisx build`. It is provided by the active adapter (e.g. `@vaisx/adapter-node`)
> rather than the CLI itself. Refer to your adapter's documentation for usage.

---

## Programmatic API

The CLI also exposes a programmatic interface for use in build scripts or
custom tooling.

### `build`

```typescript
import { build } from "@vaisx/cli";
import type { BuildResult } from "@vaisx/cli";
```

```typescript
function build(root: string, config: VaisxConfig): Promise<BuildResult>
```

Runs the full build pipeline programmatically.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `root` | `string` | Absolute path to the project root |
| `config` | `VaisxConfig` | Resolved build configuration |

**Returns** `Promise<BuildResult>`

**`BuildResult`**

```typescript
interface BuildResult {
  errors: string[];
  // additional output metadata (files emitted, timing, etc.)
}
```

**Example**

```typescript
import { build, loadConfig } from "@vaisx/cli";

const root = process.cwd();
const config = await loadConfig(root);
const result = await build(root, config);

if (result.errors.length > 0) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}
```

---

### `loadConfig`

```typescript
import { loadConfig, DEFAULT_CONFIG } from "@vaisx/cli";
import type { VaisxConfig } from "@vaisx/cli";
```

```typescript
function loadConfig(root: string): Promise<VaisxConfig>
```

Reads and parses `vaisx.config.ts` (or `.js`) from the given project root.
Falls back to `DEFAULT_CONFIG` for any unset properties.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `root` | `string` | Absolute path to the project root |

**Returns** `Promise<VaisxConfig>`

**`VaisxConfig`**

```typescript
interface VaisxConfig {
  srcDir: string;
  outDir: string;
  devMode: boolean;
  sourceMap: boolean;
  target: string;
  // additional compiler options
}
```

**Example**

```typescript
import { loadConfig, DEFAULT_CONFIG } from "@vaisx/cli";

const config = await loadConfig(process.cwd());
// Override a value
config.outDir = "public/dist";
```

---

### `compileSource` / `compileFile`

```typescript
import { compileSource, compileFile, loadWasm } from "@vaisx/cli";
import type { CompileOutput, CompileResult, CompileError, CompileOptions } from "@vaisx/cli";
```

```typescript
function loadWasm(): Promise<void>
function compileSource(source: string, options?: CompileOptions): CompileResult
function compileFile(filePath: string, options?: CompileOptions): Promise<CompileResult>
```

Low-level compiler access. `loadWasm` must be called once before using
`compileSource` or `compileFile`.

**Types**

```typescript
interface CompileOptions {
  filename?: string;
  sourceMap?: boolean;
  devMode?: boolean;
}

interface CompileOutput {
  js: string;
  map?: string;
}

interface CompileError {
  message: string;
  line?: number;
  column?: number;
}

interface CompileResult {
  output?: CompileOutput;
  errors: CompileError[];
}
```

**Example**

```typescript
import { loadWasm, compileSource } from "@vaisx/cli";

await loadWasm();

const result = compileSource(`<p>Hello {name}</p>`, {
  filename: "Hello.vaisx",
  sourceMap: true,
});

if (result.errors.length === 0) {
  console.log(result.output!.js);
}
```

---

### `createDevServer`

```typescript
import { createDevServer } from "@vaisx/cli";
import type { DevServer, DevServerOptions } from "@vaisx/cli";
```

```typescript
function createDevServer(options: DevServerOptions): Promise<DevServer>
```

Creates and starts a development HTTP server with HMR support.

**`DevServerOptions`**

```typescript
interface DevServerOptions {
  root: string;
  config: VaisxConfig;
  port: number;
  host: string;
}
```

**`DevServer`**

```typescript
interface DevServer {
  close(): Promise<void>;
}
```

**Example**

```typescript
import { loadConfig, build, createDevServer } from "@vaisx/cli";

const root = process.cwd();
const config = await loadConfig(root);
config.devMode = true;

await build(root, config);

const server = await createDevServer({ root, config, port: 5173, host: "localhost" });

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
```

---

### `scaffold`

```typescript
import { scaffold } from "@vaisx/cli";
import type { ScaffoldOptions, ScaffoldResult } from "@vaisx/cli";
```

```typescript
function scaffold(options: ScaffoldOptions): ScaffoldResult
```

Generates a new project directory from a template. This is the programmatic
equivalent of `vaisx new`.

**`ScaffoldOptions`**

```typescript
interface ScaffoldOptions {
  projectName: string;
  template: string;
  install: boolean;
}
```

**`ScaffoldResult`**

```typescript
interface ScaffoldResult {
  projectDir: string;
  installed: boolean;
}
```

| Property | Type | Description |
|---|---|---|
| `projectDir` | `string` | Absolute path to the created project |
| `installed` | `boolean` | Whether `pnpm install` was executed |

**Example**

```typescript
import { scaffold } from "@vaisx/cli";

const result = scaffold({
  projectName: "my-app",
  template: "default",
  install: true,
});

console.log(`Project created at ${result.projectDir}`);
if (!result.installed) {
  console.log("Run `pnpm install` to install dependencies.");
}
```
