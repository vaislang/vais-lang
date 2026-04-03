/**
 * VaisX config file loading.
 *
 * Supports `vaisx.config.ts` and `vaisx.config.js` in the project root.
 */

import { pathToFileURL } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";

export interface VaisxConfig {
  /** Root directory for .vaisx source files. Default: "src" */
  srcDir: string;

  /** Output directory for compiled JS. Default: "dist" */
  outDir: string;

  /** Enable dev mode (extra debug info in compiled output). Default: false */
  devMode: boolean;

  /** Enable source maps. Default: false */
  sourceMap: boolean;

  /** esbuild target for bundling. Default: "es2022" */
  target: string;

  /** External packages to exclude from bundle. Default: ["@vaisx/runtime"] */
  external: string[];

  /** Additional esbuild options passed to the bundler. */
  esbuild: Record<string, unknown>;
}

export const DEFAULT_CONFIG: VaisxConfig = {
  srcDir: "src",
  outDir: "dist",
  devMode: false,
  sourceMap: false,
  target: "es2022",
  external: ["@vaisx/runtime"],
  esbuild: {},
};

const CONFIG_FILES = ["vaisx.config.ts", "vaisx.config.js", "vaisx.config.mjs"];

/**
 * Load the VaisX config from the project root, merging with defaults.
 */
export async function loadConfig(root: string): Promise<VaisxConfig> {
  for (const filename of CONFIG_FILES) {
    const configPath = path.resolve(root, filename);
    if (!fs.existsSync(configPath)) continue;

    try {
      // Use dynamic import for both .ts (via tsx/jiti) and .js/.mjs
      const fileUrl = pathToFileURL(configPath).href;
      const mod = await import(fileUrl) as { default?: Partial<VaisxConfig> };
      const userConfig = mod.default ?? {};

      return {
        ...DEFAULT_CONFIG,
        ...userConfig,
        external: userConfig.external ?? DEFAULT_CONFIG.external,
        esbuild: { ...DEFAULT_CONFIG.esbuild, ...userConfig.esbuild },
      };
    } catch {
      // If import fails (e.g., .ts without a loader), fall through
    }
  }

  return { ...DEFAULT_CONFIG };
}

/**
 * Resolve a config-relative path against the project root.
 */
export function resolveConfigPath(root: string, configPath: string): string {
  return path.resolve(root, configPath);
}
