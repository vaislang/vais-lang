/**
 * Check gzipped size of the runtime bundle.
 * Budget: < 3KB gzipped total.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distFile = resolve(__dirname, "../dist/lib.js");

try {
  const source = readFileSync(distFile);
  const gzipped = gzipSync(source);
  const sizeKB = (gzipped.length / 1024).toFixed(2);
  const budget = 3;

  console.log(`Bundle: ${source.length} bytes (raw)`);
  console.log(`Gzipped: ${gzipped.length} bytes (${sizeKB} KB)`);
  console.log(`Budget: ${budget} KB`);

  if (gzipped.length / 1024 > budget) {
    console.error(`FAIL: ${sizeKB} KB exceeds ${budget} KB budget`);
    process.exit(1);
  } else {
    console.log(`PASS: ${sizeKB} KB within ${budget} KB budget`);
  }
} catch (e) {
  console.error("Error: Could not read dist/index.js. Run `npm run build` first.");
  console.error(e.message);
  process.exit(1);
}
