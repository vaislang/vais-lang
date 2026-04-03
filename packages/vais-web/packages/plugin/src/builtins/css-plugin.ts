import type { VaisXPlugin } from "../types.js";

/**
 * Simple hash function for generating scope IDs and class name hashes.
 * Returns a short hex string based on the input string.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Extracts class names from CSS content.
 * Returns an array of unique class name strings found in the CSS.
 */
function extractClassNames(css: string): string[] {
  const classPattern = /\.([a-zA-Z_][\w-]*)/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = classPattern.exec(css)) !== null) {
    names.add(match[1]);
  }
  return Array.from(names);
}

/**
 * CSS plugin factory.
 *
 * - transform: converts .css files into JS modules
 *   - Plain .css: wraps the CSS string as `export default "..."` and attaches a scope ID
 *   - CSS Modules (.module.css): hashes class names and exports a mapping object
 * - resolveId: handles virtual:css/... module specifiers
 */
export function cssPlugin(): VaisXPlugin {
  return {
    name: "vaisx:css",
    enforce: "pre",

    resolveId(source: string) {
      if (source.startsWith("virtual:css/")) {
        return source;
      }
      return null;
    },

    transform(code: string, id: string) {
      if (!id.endsWith(".css")) {
        return null;
      }

      const scopeId = `data-v-${simpleHash(id)}`;

      if (id.endsWith(".module.css")) {
        // CSS Modules: hash each class name
        const classNames = extractClassNames(code);
        const moduleHash = simpleHash(id).slice(0, 6);

        const mappingEntries = classNames
          .map((name) => `  ${JSON.stringify(name)}: ${JSON.stringify(`${name}_${moduleHash}`)}`)
          .join(",\n");

        const mappingObject = `{\n${mappingEntries}\n}`;

        const output = [
          `const __cssModules = ${mappingObject};`,
          `const __scopeId = ${JSON.stringify(scopeId)};`,
          `export default __cssModules;`,
          `export { __scopeId };`,
        ].join("\n");

        return { code: output, map: null };
      }

      // Plain CSS: export the raw string
      const escaped = JSON.stringify(code);
      const output = [
        `const __css = ${escaped};`,
        `const __scopeId = ${JSON.stringify(scopeId)};`,
        `export default __css;`,
        `export { __scopeId };`,
      ].join("\n");

      return { code: output, map: null };
    },
  };
}
