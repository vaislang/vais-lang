/**
 * VaisX build pipeline.
 *
 * 1. Glob .vaisx files from srcDir
 * 2. Compile each via WASM compiler -> JS
 * 3. Write compiled JS to outDir (preserving directory structure)
 * 4. Bundle with esbuild
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import * as esbuild from "esbuild";

import type { VaisxConfig } from "./config.js";
import { compileFile } from "./compiler.js";
import type { CompileResult } from "./compiler.js";
import * as logger from "./logger.js";

export interface BuildResult {
  /** Number of .vaisx files compiled. */
  compiledCount: number;
  /** Total warnings across all files. */
  warnings: Array<{ file: string; warnings: string[] }>;
  /** Files that failed to compile. */
  errors: Array<{ file: string; error: string }>;
  /** Time in milliseconds. */
  elapsed: number;
}

/**
 * Run the full build pipeline.
 */
export async function build(
  root: string,
  config: VaisxConfig,
): Promise<BuildResult> {
  const start = performance.now();
  const srcDir = path.resolve(root, config.srcDir);
  const outDir = path.resolve(root, config.outDir);

  // 1. Find all .vaisx files
  const pattern = path.join(srcDir, "**/*.vaisx").replace(/\\/g, "/");
  const files = await glob(pattern, { nodir: true });

  if (files.length === 0) {
    logger.warn(`No .vaisx files found in ${config.srcDir}/`);
    return { compiledCount: 0, warnings: [], errors: [], elapsed: 0 };
  }

  logger.info(`Found ${files.length} .vaisx file${files.length > 1 ? "s" : ""}`);

  // 2. Compile each file
  const compiledFiles: Array<{ srcPath: string; outPath: string; js: string }> = [];
  const warnings: BuildResult["warnings"] = [];
  const errors: BuildResult["errors"] = [];

  for (const file of files) {
    const relativePath = path.relative(srcDir, file);
    const outPath = path.join(
      outDir,
      relativePath.replace(/\.vaisx$/, ".js"),
    );

    const result = compileFile(file, {
      sourceMap: config.sourceMap,
      devMode: config.devMode,
    });

    if (!result.ok) {
      errors.push({ file: relativePath, error: result.error });
      logger.error(`${relativePath}: ${result.error}`);
      continue;
    }

    const compileResult = result as CompileResult;
    compiledFiles.push({ srcPath: file, outPath, js: compileResult.js });

    if (compileResult.warnings.length > 0) {
      warnings.push({ file: relativePath, warnings: compileResult.warnings });
      for (const w of compileResult.warnings) {
        logger.warn(`${relativePath}: ${w}`);
      }
    }
  }

  if (errors.length > 0 && compiledFiles.length === 0) {
    logger.error("All files failed to compile");
    return {
      compiledCount: 0,
      warnings,
      errors,
      elapsed: performance.now() - start,
    };
  }

  // 3. Write compiled JS files to outDir
  for (const { outPath, js } of compiledFiles) {
    const dir = path.dirname(outPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, js, "utf-8");
  }

  logger.info(
    `Compiled ${compiledFiles.length} file${compiledFiles.length > 1 ? "s" : ""} -> ${config.outDir}/`,
  );

  // 4. Copy non-.vaisx source files (JS, TS, CSS, etc.) to outDir
  const otherFiles = await glob(
    path.join(srcDir, "**/*.{js,ts,mjs,mts,css,json}").replace(/\\/g, "/"),
    { nodir: true },
  );
  for (const file of otherFiles) {
    const relativePath = path.relative(srcDir, file);
    const outPath = path.join(outDir, relativePath);
    const dir = path.dirname(outPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, outPath);
  }

  // 5. Bundle with esbuild (if there are entry points)
  const entryPoints = compiledFiles.map((f) => f.outPath);

  if (entryPoints.length > 0) {
    try {
      await esbuild.build({
        entryPoints,
        bundle: true,
        outdir: outDir,
        format: "esm",
        target: config.target,
        external: config.external,
        sourcemap: config.sourceMap,
        allowOverwrite: true,
        logLevel: "warning",
        ...config.esbuild,
      });
      logger.success("Bundle complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`esbuild bundle failed: ${msg}`);
      errors.push({ file: "(bundle)", error: msg });
    }
  }

  const elapsed = performance.now() - start;
  logger.success(`Build finished in ${logger.formatMs(elapsed)}`);

  return {
    compiledCount: compiledFiles.length,
    warnings,
    errors,
    elapsed,
  };
}
