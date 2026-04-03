/**
 * diagnostics.ts
 *
 * Diagnostic provider for .vaisx files.
 * Reports:
 *  - Parse errors (unclosed blocks, duplicate blocks)
 *  - Type errors (basic checks on reactivity API usage)
 *  - Unused variable warnings
 *  - Accessibility warnings in templates
 */

import {
  Diagnostic,
  DiagnosticSeverity,
} from './lsp-types.js';
import type { Range } from './lsp-types.js';
import {
  parseVaisxFile,
  extractVariables,
  type VaisxBlock,
} from './parser-bridge.js';

const SOURCE = 'vaisx';

/**
 * Compute all diagnostics for a .vaisx document.
 */
export function getDiagnostics(documentText: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const parsed = parseVaisxFile(documentText);

  // 1. Parser-level errors (unclosed/duplicate blocks)
  for (const err of parsed.errors) {
    diagnostics.push({
      range: err.range,
      severity: DiagnosticSeverity.Error,
      code: err.code,
      source: SOURCE,
      message: err.message,
    });
  }

  // 2. Missing required blocks
  if (!parsed.template) {
    diagnostics.push({
      range: makeRange(0, 0, 0, 0),
      severity: DiagnosticSeverity.Warning,
      code: 'missing-template',
      source: SOURCE,
      message: '.vaisx file is missing a <template> block.',
    });
  }

  // 3. Script-level diagnostics
  if (parsed.script) {
    const scriptDiags = analyzeScript(parsed.script);
    diagnostics.push(...scriptDiags);
  }

  // 4. Template-level diagnostics
  if (parsed.template) {
    const templateDiags = analyzeTemplate(parsed.template, parsed.script?.content ?? '');
    diagnostics.push(...templateDiags);
  }

  return diagnostics;
}

/** Analyze the script block for type errors and unused variables */
function analyzeScript(block: VaisxBlock): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { content, startLine } = block;
  const lines = content.split('\n');

  // Check for __vx_state / __vx_derived / __vx_effect usage
  checkReactivityCalls(content, lines, startLine, diagnostics);

  // Check for unused variables
  checkUnusedVariables(content, lines, startLine, diagnostics);

  return diagnostics;
}

/** Check for common reactivity API misuse */
function checkReactivityCalls(
  content: string,
  lines: string[],
  startLine: number,
  diagnostics: Diagnostic[],
): void {
  // __vx_derived must reference at least one reactive variable — simple heuristic:
  // if it contains a literal (number/string) only, warn
  const derivedRe = /__vx_derived\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = derivedRe.exec(content)) !== null) {
    const expr = m[1].trim();
    if (/^[\d"'`]+$/.test(expr)) {
      const pos = getPositionFromOffset(content, m.index, startLine);
      diagnostics.push({
        range: makeRange(pos.line, pos.character, pos.line, pos.character + m[0].length),
        severity: DiagnosticSeverity.Warning,
        code: 'static-derived',
        source: SOURCE,
        message: '__vx_derived() with a static value has no reactive dependencies.',
      });
    }
  }

  // Detect __vx_state() calls not assigned to a variable
  const stateRe = /(?<!\w)\s*__vx_state\(/g;
  while ((m = stateRe.exec(content)) !== null) {
    const linesBefore = content.slice(0, m.index).split('\n');
    const lineContent = lines[linesBefore.length - 1] ?? '';
    if (!/(?:let|const|var)\s+\w/.test(lineContent)) {
      const pos = getPositionFromOffset(content, m.index, startLine);
      diagnostics.push({
        range: makeRange(pos.line, pos.character, pos.line, pos.character + m[0].length),
        severity: DiagnosticSeverity.Warning,
        code: 'unassigned-state',
        source: SOURCE,
        message: '__vx_state() result should be assigned to a variable.',
      });
    }
  }
}

/** Detect variables declared but not used elsewhere in script+template */
function checkUnusedVariables(
  content: string,
  _lines: string[],
  startLine: number,
  diagnostics: Diagnostic[],
): void {
  const vars = extractVariables(content);
  const usageContent = content;

  for (const varName of vars) {
    // Count occurrences — first occurrence is the declaration, any extra are usages
    const occurrences = countOccurrences(usageContent, varName);
    if (occurrences <= 1) {
      // Find declaration position
      const declRe = new RegExp(`\\b(?:let|const|var)\\s+(${varName})\\b`);
      const match = declRe.exec(content);
      if (match) {
        const offset = match.index + match[0].indexOf(match[1]);
        const pos = getPositionFromOffset(content, offset, startLine);
        diagnostics.push({
          range: makeRange(pos.line, pos.character, pos.line, pos.character + varName.length),
          severity: DiagnosticSeverity.Hint,
          code: 'unused-variable',
          source: SOURCE,
          message: `Variable '${varName}' is declared but never used.`,
        });
      }
    }
  }
}

/** Analyze the template block for accessibility issues and directive errors */
function analyzeTemplate(
  block: VaisxBlock,
  _scriptContent: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { content, startLine } = block;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const absoluteLine = startLine + 1 + i; // +1 for the opening tag line

    // Accessibility: <img> without alt attribute
    if (/<img\b[^>]*>/.test(line) && !/\balt=/.test(line)) {
      const col = line.indexOf('<img');
      diagnostics.push({
        range: makeRange(absoluteLine, col, absoluteLine, col + 4),
        severity: DiagnosticSeverity.Warning,
        code: 'a11y-img-alt',
        source: SOURCE,
        message: '<img> elements must have an alt attribute for accessibility.',
      });
    }

    // Accessibility: <a> without href
    if (/<a\b(?![^>]*\bhref=)[^>]*>/.test(line)) {
      const col = line.indexOf('<a');
      if (col !== -1) {
        diagnostics.push({
          range: makeRange(absoluteLine, col, absoluteLine, col + 2),
          severity: DiagnosticSeverity.Warning,
          code: 'a11y-anchor-href',
          source: SOURCE,
          message: '<a> elements should have an href attribute.',
        });
      }
    }

    // Detect v-for without v-key (simplified heuristic)
    if (/\bv-for\b/.test(line) && !/\bv-bind:key\b|\b:key\b|\bkey=/.test(line)) {
      const col = line.indexOf('v-for');
      diagnostics.push({
        range: makeRange(absoluteLine, col, absoluteLine, col + 5),
        severity: DiagnosticSeverity.Warning,
        code: 'v-for-no-key',
        source: SOURCE,
        message: 'v-for should include a :key binding for efficient rendering.',
      });
    }

    // Detect interpolation syntax errors: {{ without closing }}
    const openInterps = (line.match(/\{\{/g) ?? []).length;
    const closeInterps = (line.match(/\}\}/g) ?? []).length;
    if (openInterps !== closeInterps) {
      const col = line.lastIndexOf('{{');
      diagnostics.push({
        range: makeRange(absoluteLine, col, absoluteLine, col + 2),
        severity: DiagnosticSeverity.Error,
        code: 'unclosed-interpolation',
        source: SOURCE,
        message: 'Interpolation `{{` is not closed with `}}`.',
      });
    }
  }

  return diagnostics;
}

/** Count non-overlapping occurrences of a word in a string */
function countOccurrences(text: string, word: string): number {
  const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
  return (text.match(re) ?? []).length;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Convert a character offset within block content to a document-absolute position */
function getPositionFromOffset(
  content: string,
  offset: number,
  blockStartLine: number,
): { line: number; character: number } {
  const before = content.slice(0, offset);
  const lines = before.split('\n');
  const line = blockStartLine + 1 + (lines.length - 1); // +1 for opening tag
  const character = lines[lines.length - 1].length;
  return { line, character };
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
