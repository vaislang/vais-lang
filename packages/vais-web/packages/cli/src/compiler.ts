/**
 * WASM compiler wrapper.
 *
 * Loads the vaisx-wasm module and provides typed interfaces
 * for parsing and compiling .vaisx files.
 */

import { createRequire } from "node:module";
import * as path from "node:path";
import * as fs from "node:fs";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface CompileResult {
  ok: true;
  js: string;
  sourceMap: string | null;
  warnings: string[];
}

export interface CompileError {
  ok: false;
  error: string;
  offset: number | null;
}

export type CompileOutput = CompileResult | CompileError;

export interface CompileOptions {
  componentName?: string;
  sourceMap?: boolean;
  devMode?: boolean;
}

// ---------------------------------------------------------------------------
// WASM module interface
// ---------------------------------------------------------------------------

interface WasmModule {
  compile(source: string, optionsJson?: string | null): string;
  parse(source: string): string;
  parseWithRecovery(source: string): string;
}

let wasmModule: WasmModule | null = null;

/**
 * Resolve the path to the vaisx-wasm package.
 *
 * Searches for the WASM pkg in the monorepo structure first,
 * then falls back to node_modules resolution.
 */
function resolveWasmPath(): string {
  // Monorepo: crates/vaisx-wasm/pkg relative to project root
  // Walk up from this file (packages/cli/dist or packages/cli/src) to find repo root.
  let dir = path.dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "crates", "vaisx-wasm", "pkg", "vaisx_wasm.js");
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }

  throw new Error(
    "Could not locate vaisx-wasm package. " +
    "Ensure the WASM module is built (`wasm-pack build crates/vaisx-wasm --target nodejs`)."
  );
}

/**
 * Load and cache the WASM compiler module.
 */
export function loadWasm(): WasmModule {
  if (wasmModule) return wasmModule;

  const wasmPath = resolveWasmPath();

  // The vaisx_wasm.js is a CJS module that synchronously loads the WASM binary.
  // Use createRequire to load CJS from an ESM context.
  const require = createRequire(import.meta.url);
  const mod = require(wasmPath) as WasmModule;

  wasmModule = mod;
  return mod;
}

/**
 * Compile a single .vaisx source string to JavaScript.
 */
export function compileSource(
  source: string,
  options?: CompileOptions,
): CompileOutput {
  const wasm = loadWasm();
  const optionsJson = options ? JSON.stringify(options) : undefined;
  const resultJson = wasm.compile(source, optionsJson ?? null);
  return JSON.parse(resultJson) as CompileOutput;
}

/**
 * Compile a .vaisx file by path.
 */
export function compileFile(
  filePath: string,
  options?: CompileOptions,
): CompileOutput {
  const source = fs.readFileSync(filePath, "utf-8");
  const componentName =
    options?.componentName ??
    path.basename(filePath, ".vaisx").replace(/[^a-zA-Z0-9_$]/g, "_");

  return compileSource(source, { ...options, componentName });
}
