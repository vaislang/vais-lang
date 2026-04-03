/**
 * parser-bridge.ts
 *
 * Bridge to the VaisX parser for extracting script/template/style blocks from .vaisx files.
 * Parses the SFC-like structure without requiring the Rust parser binary at runtime.
 */

import type { Range, Position } from './lsp-types.js';

export interface VaisxBlock {
  type: 'script' | 'template' | 'style';
  lang?: string;
  content: string;
  /** 0-based line where the opening tag starts */
  startLine: number;
  /** 0-based line where the closing tag ends */
  endLine: number;
  /** Character offset of content start within the full document */
  contentOffset: number;
  range: Range;
}

export interface ParsedVaisxFile {
  script?: VaisxBlock;
  template?: VaisxBlock;
  style?: VaisxBlock;
  /** Raw parse errors found during block extraction */
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  range: Range;
  code: string;
}

export interface ComponentInfo {
  name: string;
  props: PropInfo[];
}

export interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

/** Regex patterns for block extraction */
const BLOCK_OPEN_RE =
  /^<(script|template|style)(?:\s+lang="([^"]*)")?(?:\s+[^>]*)?\s*>/;
const BLOCK_CLOSE_RE = (type: string) =>
  new RegExp(`^</${type}\\s*>`);

/**
 * Parse a .vaisx file and extract its top-level blocks.
 */
export function parseVaisxFile(source: string): ParsedVaisxFile {
  const lines = source.split('\n');
  const result: ParsedVaisxFile = {
    errors: [],
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = BLOCK_OPEN_RE.exec(line.trim());
    if (!match) {
      i++;
      continue;
    }

    const blockType = match[1] as 'script' | 'template' | 'style';
    const lang = match[2];
    const startLine = i;

    // Find content start — text after the opening tag on the same line (if any)
    const openTagEnd = line.indexOf('>') + 1;
    const contentLines: string[] = [];
    const inlineContent = line.slice(openTagEnd);
    let endLine = i;
    let found = false;

    // Check if closed on the same line
    const closeRe = BLOCK_CLOSE_RE(blockType);
    if (closeRe.test(inlineContent.trim())) {
      // Entire block on one line (rare but valid)
      found = true;
      endLine = i;
    } else {
      if (inlineContent.trim()) {
        contentLines.push(inlineContent);
      }
      i++;
      while (i < lines.length) {
        if (closeRe.test(lines[i].trim())) {
          endLine = i;
          found = true;
          break;
        }
        contentLines.push(lines[i]);
        i++;
      }
    }

    if (!found) {
      result.errors.push({
        message: `Unclosed <${blockType}> block`,
        range: makeRange(startLine, 0, startLine, line.length),
        code: 'unclosed-block',
      });
      i++;
      continue;
    }

    const content = contentLines.join('\n');

    // Calculate character offset for the content
    let contentOffset = 0;
    for (let l = 0; l < startLine; l++) {
      contentOffset += lines[l].length + 1; // +1 for \n
    }
    contentOffset += openTagEnd;

    const block: VaisxBlock = {
      type: blockType,
      lang,
      content,
      startLine,
      endLine,
      contentOffset,
      range: makeRange(startLine, 0, endLine, lines[endLine].length),
    };

    if (blockType === 'script') {
      if (result.script) {
        result.errors.push({
          message: 'Duplicate <script> block',
          range: block.range,
          code: 'duplicate-block',
        });
      } else {
        result.script = block;
      }
    } else if (blockType === 'template') {
      if (result.template) {
        result.errors.push({
          message: 'Duplicate <template> block',
          range: block.range,
          code: 'duplicate-block',
        });
      } else {
        result.template = block;
      }
    } else {
      if (result.style) {
        result.errors.push({
          message: 'Duplicate <style> block',
          range: block.range,
          code: 'duplicate-block',
        });
      } else {
        result.style = block;
      }
    }

    i++;
  }

  return result;
}

/**
 * Extract component imports and definitions from a script block.
 */
export function extractComponents(scriptContent: string): ComponentInfo[] {
  const components: ComponentInfo[] = [];

  // Match: import ComponentName from '...'
  const importRe =
    /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"][^'"]+['"]/g;
  let m: RegExpExecArray | null;

  while ((m = importRe.exec(scriptContent)) !== null) {
    const named = m[1];
    const defaultImport = m[2];

    if (defaultImport && /^[A-Z]/.test(defaultImport)) {
      components.push({ name: defaultImport, props: [] });
    }
    if (named) {
      for (const part of named.split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()!.trim();
        if (/^[A-Z]/.test(name)) {
          components.push({ name, props: [] });
        }
      }
    }
  }

  return components;
}

/**
 * Extract variable declarations from a script block (used for diagnostics).
 */
export function extractVariables(scriptContent: string): string[] {
  const vars: string[] = [];
  // let / const / var declarations
  const declRe = /\b(?:let|const|var)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(scriptContent)) !== null) {
    vars.push(m[1]);
  }
  // Function declarations
  const fnRe = /\bfunction\s+(\w+)/g;
  while ((m = fnRe.exec(scriptContent)) !== null) {
    vars.push(m[1]);
  }
  return vars;
}

/**
 * Determine which block the cursor position is in.
 */
export function getBlockAtPosition(
  parsed: ParsedVaisxFile,
  position: Position,
): VaisxBlock | null {
  const blocks = [parsed.script, parsed.template, parsed.style].filter(
    Boolean,
  ) as VaisxBlock[];

  for (const block of blocks) {
    if (
      position.line >= block.startLine &&
      position.line <= block.endLine
    ) {
      return block;
    }
  }
  return null;
}

function makeRange(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
): Range {
  return {
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
  };
}
