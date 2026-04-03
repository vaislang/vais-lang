/**
 * parser.ts
 *
 * Detects and extracts `<script lang="ts">` blocks from .vaisx source files.
 */

export interface ScriptBlock {
  /** Raw TypeScript source extracted from the block (without the script tags). */
  source: string;
  /** The lang attribute value found on the opening tag, e.g. "ts" | "typescript". */
  lang: string;
  /** Character offset at which the opening `<script` tag starts in the full source. */
  startOffset: number;
  /** Character offset immediately after the closing `</script>` tag. */
  endOffset: number;
  /** Line number (1-based) of the opening tag. */
  startLine: number;
  /** Line number (1-based) of the closing tag. */
  endLine: number;
  /** Whether this block is marked as `setup` (i.e. `<script lang="ts" setup>`). */
  setup: boolean;
}

export interface ParseResult {
  /** All `<script>` blocks with a `lang` attribute of "ts" or "typescript". */
  scriptBlocks: ScriptBlock[];
  /** Whether any TypeScript script block was found. */
  hasTypeScript: boolean;
}

/**
 * A regex that matches an opening `<script` tag with any attributes, followed
 * by the tag body up to the matching `</script>`.  The regex is written to be
 * non-greedy so that adjacent blocks are handled correctly.
 *
 * Capture groups:
 *  1 – the full attribute string of the opening tag
 *  2 – the content between the tags
 */
const SCRIPT_BLOCK_RE =
  /<script(\s[^>]*)?>(\s*[\s\S]*?)<\/script>/gi;

/**
 * Extracts the value of a specific attribute from an attribute string.
 * Returns `null` when the attribute is absent.
 */
function getAttribute(attrs: string, name: string): string | null {
  // Handles both quoted (single/double) and unquoted attribute values.
  const re = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s/>]*))`,
    "i"
  );
  const m = re.exec(attrs);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? "";
}

/**
 * Returns true when the attribute string contains a bare boolean attribute
 * (e.g. `setup` without a value).
 */
function hasAttribute(attrs: string, name: string): boolean {
  const re = new RegExp(`(?:^|\\s)${name}(?:\\s|>|$|/)`, "i");
  return re.test(attrs);
}

/**
 * Counts the number of newlines that appear before `offset` inside `source`,
 * giving the 1-based line number of that offset.
 */
function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

const TS_LANGS = new Set(["ts", "typescript"]);

/**
 * Parse a `.vaisx` source string and return all TypeScript script blocks.
 *
 * @param source - The raw content of a .vaisx file.
 */
export function parseScriptBlocks(source: string): ParseResult {
  const scriptBlocks: ScriptBlock[] = [];

  SCRIPT_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SCRIPT_BLOCK_RE.exec(source)) !== null) {
    const fullMatch = match[0];
    const attrStr = match[1] ?? "";
    const content = match[2] ?? "";

    const lang = getAttribute(attrStr, "lang");
    if (!lang || !TS_LANGS.has(lang.toLowerCase())) continue;

    const startOffset = match.index;
    const endOffset = startOffset + fullMatch.length;

    scriptBlocks.push({
      source: content,
      lang,
      startOffset,
      endOffset,
      startLine: lineAt(source, startOffset),
      endLine: lineAt(source, endOffset - 1),
      setup: hasAttribute(attrStr, "setup"),
    });
  }

  return {
    scriptBlocks,
    hasTypeScript: scriptBlocks.length > 0,
  };
}

/**
 * Convenience helper — returns the concatenated TypeScript source from all
 * detected script blocks in declaration order.
 */
export function extractTypeScriptSource(source: string): string {
  const { scriptBlocks } = parseScriptBlocks(source);
  return scriptBlocks.map((b) => b.source).join("\n");
}
