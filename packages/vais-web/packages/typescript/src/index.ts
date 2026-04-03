/**
 * @vaisx/typescript — public API surface
 *
 * Re-exports all public types and functions from the sub-modules so that
 * consumers only need a single import path:
 *
 *   import { parseScriptBlocks, transformTypeScript, extractProps, generateDts } from '@vaisx/typescript';
 */

// ── Parser ────────────────────────────────────────────────────────────────────
export {
  parseScriptBlocks,
  extractTypeScriptSource,
} from "./parser.js";
export type { ScriptBlock, ParseResult } from "./parser.js";

// ── Transform ─────────────────────────────────────────────────────────────────
export { transformTypeScript, transformTypeScriptSync } from "./transform.js";
export type { TransformOptions, TransformResult } from "./transform.js";

// ── Type check ────────────────────────────────────────────────────────────────
export { typeCheck } from "./typecheck.js";
export type {
  TypeCheckOptions,
  TypeCheckResult,
  TypeCheckDiagnostic,
} from "./typecheck.js";

// ── Props inference ───────────────────────────────────────────────────────────
export { extractProps, buildPropsMap } from "./props.js";
export type { PropDefinition, PropsExtractionResult } from "./props.js";

// ── .d.ts generation ─────────────────────────────────────────────────────────
export { generateDts, generatePropsDeclaration } from "./dts.js";
export type { DtsGenerationOptions, DtsGenerationResult } from "./dts.js";
