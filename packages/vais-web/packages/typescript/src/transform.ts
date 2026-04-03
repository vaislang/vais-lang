/**
 * transform.ts
 *
 * TypeScript → JavaScript transpilation pipeline using esbuild's transform API.
 * esbuild is used because it is extremely fast and already present as a
 * devDependency in the monorepo.
 */

import { transform as esbuildTransform, type TransformOptions as EsbuildTransformOptions } from "esbuild";
import { parseScriptBlocks } from "./parser.js";

// ─── Public types ────────────────────────────────────────────────────────────

export interface TransformOptions {
  /** Original filename — passed to esbuild for better error messages. */
  filename: string;
  /** Raw .vaisx file source OR a bare TypeScript source string. */
  source: string;
  /**
   * ECMAScript target for the emitted code.
   * Defaults to "es2022".
   */
  target?: "es2020" | "es2022" | "esnext";
  /**
   * When `true` the input `source` is treated as a raw TypeScript string
   * instead of a full .vaisx file.  Defaults to `false`.
   */
  rawTs?: boolean;
}

export interface TransformResult {
  /** Transpiled JavaScript code. */
  code: string;
  /** Inline source-map string (if esbuild emitted one). */
  map?: string;
  /** Warnings reported by esbuild. */
  warnings: string[];
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Transpile TypeScript extracted from a `.vaisx` file (or a raw TS string)
 * to JavaScript using esbuild's transform API.
 *
 * @throws When esbuild reports a hard transform error.
 */
export async function transformTypeScript(
  options: TransformOptions
): Promise<TransformResult> {
  const { filename, source, target = "es2022", rawTs = false } = options;

  // Step 1 – obtain the TS source to feed into esbuild.
  let tsSource: string;

  if (rawTs) {
    tsSource = source;
  } else {
    const { scriptBlocks, hasTypeScript } = parseScriptBlocks(source);
    if (!hasTypeScript) {
      return { code: "", warnings: ['No <script lang="ts"> block found in source.'] };
    }
    tsSource = scriptBlocks.map((b) => b.source).join("\n");
  }

  // Step 2 – run esbuild transform.
  const esbuildOpts: EsbuildTransformOptions = {
    loader: "ts",
    target,
    sourcemap: "inline",
    sourcefile: filename,
    // Remove TypeScript-only constructs without altering runtime behaviour.
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  };

  const result = await esbuildTransform(tsSource, esbuildOpts);

  // Strip the inline source-map comment and decode it separately.
  const sourceMapCommentRe =
    /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/;
  const mapMatch = result.code.match(sourceMapCommentRe);
  let map: string | undefined;
  if (mapMatch) {
    map = Buffer.from(mapMatch[1], "base64").toString("utf8");
  }
  const code = result.code.replace(sourceMapCommentRe, "").trimEnd();

  const warnings = result.warnings.map(
    (w) =>
      `${w.location?.file ?? filename}:${w.location?.line ?? "?"} – ${w.text}`
  );

  return { code, map, warnings };
}

/**
 * Synchronous variant — delegates to esbuild's transformSync API.
 * Useful in build-tool plugins where top-level await is unavailable.
 */
export function transformTypeScriptSync(
  options: TransformOptions
): TransformResult {
  // In an ESM context we fall back to the async version's synchronous sibling
  // that esbuild ships in its own package.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const esbuild = (globalThis as Record<string, unknown>)["__esbuild_sync__"] as typeof import("esbuild") | undefined;
  if (!esbuild) {
    throw new Error(
      "transformTypeScriptSync requires esbuild to be pre-loaded via __esbuild_sync__. " +
        "Use transformTypeScript (async) instead."
    );
  }

  const { filename, source, target = "es2022", rawTs = false } = options;

  let tsSource: string;
  if (rawTs) {
    tsSource = source;
  } else {
    const { scriptBlocks, hasTypeScript } = parseScriptBlocks(source);
    if (!hasTypeScript) {
      return { code: "", warnings: ['No <script lang="ts"> block found in source.'] };
    }
    tsSource = scriptBlocks.map((b) => b.source).join("\n");
  }

  const result = esbuild.transformSync(tsSource, {
    loader: "ts",
    target,
    sourcefile: filename,
  });

  const warnings = result.warnings.map(
    (w) =>
      `${w.location?.file ?? filename}:${w.location?.line ?? "?"} – ${w.text}`
  );

  return { code: result.code, warnings };
}
