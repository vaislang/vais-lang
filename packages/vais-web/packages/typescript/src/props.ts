/**
 * props.ts
 *
 * Generic Props type inference — extracts prop definitions from
 * `defineProps<T>()` call expressions in TypeScript source blocks.
 *
 * The extraction is intentionally implemented as a lightweight regex/string
 * parser to avoid requiring the TypeScript compiler API at runtime.  For
 * full fidelity type-checking the `typecheck` module should be used.
 */

import { parseScriptBlocks } from "./parser.js";

// ─── Public types ────────────────────────────────────────────────────────────

export interface PropDefinition {
  /** Name of the prop (camelCase as written in the interface). */
  name: string;
  /** TypeScript type string for the prop value. */
  type: string;
  /** Whether the prop is required (no `?` modifier and no default). */
  required: boolean;
  /** Default value expression as a string, if present. */
  default?: string;
}

export interface PropsExtractionResult {
  /** All prop definitions extracted from the script block. */
  props: PropDefinition[];
  /**
   * The raw generic argument string passed to defineProps<...>(), e.g.
   * `{ title: string; count?: number }`.
   */
  rawGeneric: string | null;
  /** Name of the TypeScript interface/type alias referenced, if any. */
  referencedType: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Locate the generic type argument of a `defineProps<T>()` call.
 *
 * We need to balance `<` / `>` because the generic argument can itself
 * contain nested generics (e.g. `Record<string, string[]>`).
 */
function extractGenericArgument(source: string): string | null {
  const callIdx = source.search(/defineProps\s*</);
  if (callIdx === -1) return null;

  // Find the opening `<` of the generic.
  const ltIdx = source.indexOf("<", callIdx + "defineProps".length);
  if (ltIdx === -1) return null;

  let depth = 1;
  let i = ltIdx + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "<") depth++;
    else if (source[i] === ">") depth--;
    i++;
  }

  return depth === 0 ? source.slice(ltIdx + 1, i - 1).trim() : null;
}

/**
 * Determine if the generic argument is a simple type reference (single
 * identifier without braces) such as `defineProps<MyProps>()`.
 */
function extractReferencedTypeName(generic: string): string | null {
  const trimmed = generic.trim();
  // A simple identifier contains only word characters and optional namespace dots.
  if (/^[\w.]+$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Parse an inline object-literal type such as
 * `{ title: string; count?: number; label?: string }` into PropDefinitions.
 *
 * This covers the most common single-level cases.  Nested object types are
 * returned as opaque type strings.
 */
function parseInlineObjectType(
  objectType: string,
  defaults: Map<string, string>
): PropDefinition[] {
  // Strip surrounding braces.
  const inner = objectType.replace(/^\s*\{\s*/, "").replace(/\s*\}\s*$/, "");
  if (!inner) return [];

  const props: PropDefinition[] = [];

  // Split on ; or newline — but skip commas/semicolons inside nested generics.
  const entries = splitTypeMembers(inner);

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    // Match:  name?  :  type
    const memberRe = /^(\w+)(\??):\s*([\s\S]+)$/;
    const m = memberRe.exec(trimmed);
    if (!m) continue;

    const name = m[1];
    const optional = m[2] === "?";
    const type = m[3].trim().replace(/;$/, "").trim();
    const defaultVal = defaults.get(name);

    props.push({
      name,
      type,
      required: !optional && defaultVal === undefined,
      default: defaultVal,
    });
  }

  return props;
}

/**
 * Split a type member list on `;` or newlines while respecting nested `<>`,
 * `{}`, and `()` brackets.
 */
function splitTypeMembers(source: string): string[] {
  const members: string[] = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "<" || ch === "{" || ch === "(") depth++;
    else if (ch === ">" || ch === "}" || ch === ")") depth--;

    if (depth === 0 && (ch === ";" || ch === "\n")) {
      if (current.trim()) members.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) members.push(current.trim());
  return members;
}

/**
 * Extract default values from a `withDefaults(defineProps<T>(), { ... })`
 * call.  Returns a map of propName → default-value-string.
 */
function extractDefaults(source: string): Map<string, string> {
  const defaults = new Map<string, string>();

  const withDefaultsRe = /withDefaults\s*\(\s*defineProps\s*<[^>]*>\s*\(\s*\)\s*,\s*\{/;
  const startMatch = withDefaultsRe.exec(source);
  if (!startMatch) return defaults;

  // Find the opening brace of the defaults object.
  const braceStart = source.indexOf("{", startMatch.index + startMatch[0].length - 1);
  if (braceStart === -1) return defaults;

  let depth = 1;
  let i = braceStart + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }

  const defaultsBody = source.slice(braceStart + 1, i - 1).trim();
  // Parse simple key: value pairs (handles basic expressions).
  const pairRe = /(\w+)\s*:\s*([^,}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(defaultsBody)) !== null) {
    defaults.set(m[1], m[2].trim());
  }

  return defaults;
}

/**
 * Find and parse an `interface` or `type` declaration in the source that
 * matches the given name.
 */
function findTypeDeclaration(
  source: string,
  typeName: string
): string | null {
  // interface Foo { ... }
  const interfaceRe = new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?interface\\s+${typeName}\\s*(extends[^{]*)?\{`,
    "m"
  );
  const typeRe = new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?type\\s+${typeName}\\s*=\\s*\\{`,
    "m"
  );

  const interfaceMatch = interfaceRe.exec(source);
  const typeMatch = typeRe.exec(source);
  const match = interfaceMatch ?? typeMatch;
  if (!match) return null;

  const braceStart = source.indexOf("{", match.index + match[0].length - 1);
  if (braceStart === -1) return null;

  let depth = 1;
  let i = braceStart + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }

  // Return as an inline object type with braces.
  return source.slice(braceStart, i);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Extract `defineProps<T>()` prop definitions from a .vaisx source or a raw
 * TypeScript string.
 *
 * @param source  - Raw .vaisx file content or bare TypeScript source.
 * @param rawTs   - When `true`, `source` is treated as raw TypeScript.
 */
export function extractProps(
  source: string,
  rawTs = false
): PropsExtractionResult {
  const tsSource = rawTs
    ? source
    : parseScriptBlocks(source)
        .scriptBlocks.map((b) => b.source)
        .join("\n");

  const rawGeneric = extractGenericArgument(tsSource);
  if (!rawGeneric) {
    return { props: [], rawGeneric: null, referencedType: null };
  }

  const defaults = extractDefaults(tsSource);
  const referencedType = extractReferencedTypeName(rawGeneric);

  let objectTypeStr: string | null = null;

  if (referencedType) {
    // Try to resolve the referenced type in the same source.
    objectTypeStr = findTypeDeclaration(tsSource, referencedType);
  } else if (rawGeneric.trim().startsWith("{")) {
    objectTypeStr = rawGeneric;
  }

  const props = objectTypeStr
    ? parseInlineObjectType(objectTypeStr, defaults)
    : [];

  return { props, rawGeneric, referencedType };
}

/**
 * Build a map of prop names → PropDefinition for quick lookup.
 */
export function buildPropsMap(
  source: string,
  rawTs = false
): Map<string, PropDefinition> {
  const { props } = extractProps(source, rawTs);
  return new Map(props.map((p) => [p.name, p]));
}
