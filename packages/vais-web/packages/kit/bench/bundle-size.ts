/**
 * Bundle size measurement script.
 *
 * Reads the built dist/ files and reports:
 *   - Raw byte size per module
 *   - Gzip-estimated size per module (using zlib deflate heuristic)
 *   - Total raw and gzip sizes
 *
 * Run with:
 *   pnpm run bench:size
 *   (i.e., tsx bench/bundle-size.ts  or  node --loader tsx bench/bundle-size.ts)
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDir = join(__dirname, "..", "dist");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function pad(str: string, width: number): string {
  return str.padEnd(width, " ");
}

interface FileStat {
  path: string;
  raw: number;
  gzip: number;
}

async function collectFiles(dir: string): Promise<FileStat[]> {
  const results: FileStat[] = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    console.error(`dist/ directory not found at: ${dir}`);
    console.error("Run `pnpm run build` first to generate the dist files.");
    process.exit(1);
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const info = await stat(fullPath);

    if (info.isDirectory()) {
      const nested = await collectFiles(fullPath);
      results.push(...nested);
      continue;
    }

    // Only measure JS and declaration files
    if (!entry.endsWith(".js") && !entry.endsWith(".d.ts") && !entry.endsWith(".ts")) {
      continue;
    }

    const content = await readFile(fullPath);
    const gzipped = gzipSync(content);

    results.push({
      path: relative(distDir, fullPath),
      raw: content.length,
      gzip: gzipped.length,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const files = await collectFiles(distDir);

  if (files.length === 0) {
    console.error("No .js or .d.ts files found in dist/.");
    console.error("Run `pnpm run build` first.");
    process.exit(1);
  }

  // Sort by raw size descending
  files.sort((a, b) => b.raw - a.raw);

  const colFile = Math.max(40, ...files.map((f) => f.path.length + 2));
  const colRaw = 14;
  const colGzip = 14;

  const header =
    pad("File", colFile) +
    pad("Raw", colRaw) +
    pad("Gzip (est.)", colGzip);
  const divider = "-".repeat(colFile + colRaw + colGzip);

  console.log("\n@vaisx/kit — Bundle Size Report");
  console.log("=".repeat(colFile + colRaw + colGzip));
  console.log(header);
  console.log(divider);

  let totalRaw = 0;
  let totalGzip = 0;

  for (const f of files) {
    totalRaw += f.raw;
    totalGzip += f.gzip;

    console.log(
      pad(f.path, colFile) +
      pad(formatBytes(f.raw), colRaw) +
      pad(formatBytes(f.gzip), colGzip)
    );
  }

  console.log(divider);
  console.log(
    pad(`TOTAL (${files.length} files)`, colFile) +
    pad(formatBytes(totalRaw), colRaw) +
    pad(formatBytes(totalGzip), colGzip)
  );
  console.log();
}

main();
