import type { VaisXPlugin } from "../types.js";

/**
 * Checks whether a string is a valid JS identifier so we can emit
 * `export const <name> = ...` named exports.
 */
function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

/**
 * JSON plugin factory.
 *
 * - transform: converts .json files into ES modules
 *   - Each top-level key that is a valid identifier becomes a named export
 *   - The full parsed object is also available as `export default`
 * - Returns null for non-.json files.
 */
export function jsonPlugin(): VaisXPlugin {
  return {
    name: "vaisx:json",

    async transform(code: string, id: string) {
      if (!id.endsWith(".json")) {
        return null;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(code);
      } catch (err) {
        throw new Error(`[vaisx:json] Failed to parse JSON file: ${id}\n${String(err)}`);
      }

      const lines: string[] = [];

      // Named exports for each top-level key (when the value is serialisable)
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        for (const [key, value] of Object.entries(obj)) {
          if (isValidIdentifier(key)) {
            lines.push(`export const ${key} = ${JSON.stringify(value)};`);
          }
        }
      }

      // Default export — the full JSON value
      lines.push(`export default ${JSON.stringify(parsed)};`);

      return { code: lines.join("\n"), map: null };
    },
  };
}
