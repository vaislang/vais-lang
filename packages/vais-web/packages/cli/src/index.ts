/**
 * @vaisx/cli — Public API
 *
 * Re-exports core modules for programmatic use.
 */

export { build } from "./build.js";
export type { BuildResult } from "./build.js";

export { loadConfig, DEFAULT_CONFIG } from "./config.js";
export type { VaisxConfig } from "./config.js";

export { compileSource, compileFile, loadWasm } from "./compiler.js";
export type { CompileOutput, CompileResult, CompileError, CompileOptions } from "./compiler.js";

export { createDevServer } from "./dev.js";
export type { DevServer, DevServerOptions } from "./dev.js";

export { scaffold } from "./scaffold.js";
export type { ScaffoldOptions, ScaffoldResult } from "./scaffold.js";
