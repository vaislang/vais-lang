import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { RouteSegment, SpecialFile } from "../types.js";

export interface ScannedFile {
  /** Absolute path to the file */
  absolutePath: string;
  /** Path relative to appDir */
  relativePath: string;
  /** The special file name */
  fileName: SpecialFile;
  /** Parsed route segments from the directory path */
  segments: RouteSegment[];
}

const SPECIAL_FILES: SpecialFile[] = [
  "page.vaisx",
  "layout.vaisx",
  "loading.vaisx",
  "error.vaisx",
  "route.vais",
  "middleware.vais",
];

/**
 * Parse a directory name into a route segment.
 * - `(group)` → { type: "group", value: "group" }
 * - `[...rest]` → { type: "catch-all", value: "rest" }
 * - `[slug]`    → { type: "dynamic", value: "slug" }
 * - `about`     → { type: "static", value: "about" }
 */
export function parseDirSegment(dirName: string): RouteSegment {
  if (dirName.startsWith("(") && dirName.endsWith(")")) {
    return { type: "group", value: dirName.slice(1, -1) };
  }
  if (dirName.startsWith("[...") && dirName.endsWith("]")) {
    return { type: "catch-all", value: dirName.slice(4, -1) };
  }
  if (dirName.startsWith("[") && dirName.endsWith("]")) {
    return { type: "dynamic", value: dirName.slice(1, -1) };
  }
  return { type: "static", value: dirName };
}

/**
 * Recursively scan an app directory and return a flat list of all
 * discovered special files with their segment information.
 */
export async function scanAppDir(appDir: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];

  async function walk(dir: string, segments: RouteSegment[]): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        const segment = parseDirSegment(entry);
        await walk(fullPath, [...segments, segment]);
      } else if (SPECIAL_FILES.includes(entry as SpecialFile)) {
        results.push({
          absolutePath: fullPath,
          relativePath: relative(appDir, fullPath),
          fileName: entry as SpecialFile,
          segments,
        });
      }
    }
  }

  await walk(appDir, []);
  return results;
}
