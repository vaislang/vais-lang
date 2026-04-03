/**
 * Tests for the TextMate grammar JSON structure.
 * Validates that the grammar file is valid JSON and contains required patterns.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const GRAMMAR_PATH = resolve(
  import.meta.dirname ?? __dirname,
  '../syntaxes/vaisx.tmLanguage.json',
);

let grammar: Record<string, unknown>;

beforeAll(() => {
  const raw = readFileSync(GRAMMAR_PATH, 'utf8');
  grammar = JSON.parse(raw) as Record<string, unknown>;
});

describe('vaisx.tmLanguage.json structure', () => {
  it('has scopeName source.vaisx', () => {
    expect(grammar.scopeName).toBe('source.vaisx');
  });

  it('has top-level patterns array', () => {
    expect(Array.isArray(grammar.patterns)).toBe(true);
    expect((grammar.patterns as unknown[]).length).toBeGreaterThan(0);
  });

  it('includes script-block pattern', () => {
    const patterns = grammar.patterns as Array<{ include: string }>;
    expect(patterns.some(p => p.include === '#script-block')).toBe(true);
  });

  it('includes template-block pattern', () => {
    const patterns = grammar.patterns as Array<{ include: string }>;
    expect(patterns.some(p => p.include === '#template-block')).toBe(true);
  });

  it('includes style-block pattern', () => {
    const patterns = grammar.patterns as Array<{ include: string }>;
    expect(patterns.some(p => p.include === '#style-block')).toBe(true);
  });

  it('has a repository with expected entries', () => {
    const repo = grammar.repository as Record<string, unknown>;
    expect(repo).toBeDefined();
    expect(repo['script-block']).toBeDefined();
    expect(repo['template-block']).toBeDefined();
    expect(repo['style-block']).toBeDefined();
    expect(repo['vaisx-directives']).toBeDefined();
    expect(repo['vaisx-apis']).toBeDefined();
    expect(repo['interpolation']).toBeDefined();
    expect(repo['builtin-components']).toBeDefined();
    expect(repo['comments']).toBeDefined();
  });

  it('vaisx-directives pattern covers v-if', () => {
    const repo = grammar.repository as Record<string, { patterns: Array<{ match: string }> }>;
    const dirPatterns = repo['vaisx-directives'].patterns;
    const combined = dirPatterns.map(p => p.match ?? '').join('|');
    expect(combined).toContain('v-if');
  });

  it('vaisx-directives pattern covers v-for', () => {
    const repo = grammar.repository as Record<string, { patterns: Array<{ match: string }> }>;
    const dirPatterns = repo['vaisx-directives'].patterns;
    const combined = dirPatterns.map(p => p.match ?? '').join('|');
    expect(combined).toContain('v-for');
  });

  it('vaisx-apis pattern covers __vx_state', () => {
    const repo = grammar.repository as Record<string, { patterns: Array<{ match: string }> }>;
    const apiPatterns = repo['vaisx-apis'].patterns;
    const combined = apiPatterns.map(p => p.match ?? '').join('|');
    expect(combined).toContain('__vx_state');
  });

  it('builtin-components pattern covers Button', () => {
    const repo = grammar.repository as Record<string, { patterns: Array<{ match: string }> }>;
    const patterns = repo['builtin-components'].patterns;
    const combined = patterns.map(p => p.match ?? '').join('|');
    expect(combined).toContain('Button');
  });

  it('interpolation pattern uses {{ and }}', () => {
    const repo = grammar.repository as Record<string, { begin: string; end: string }>;
    const interp = repo['interpolation'];
    expect(interp.begin).toContain('{');
    expect(interp.end).toContain('}');
  });

  it('file has name VaisX', () => {
    expect(grammar.name).toBe('VaisX');
  });
});

describe('language-configuration.json structure', () => {
  let config: Record<string, unknown>;

  beforeAll(() => {
    const configPath = resolve(
      import.meta.dirname ?? __dirname,
      '../language-configuration.json',
    );
    const raw = readFileSync(configPath, 'utf8');
    config = JSON.parse(raw) as Record<string, unknown>;
  });

  it('has comments configuration', () => {
    expect(config.comments).toBeDefined();
  });

  it('has brackets configuration', () => {
    expect(Array.isArray(config.brackets)).toBe(true);
  });

  it('has autoClosingPairs configuration', () => {
    expect(Array.isArray(config.autoClosingPairs)).toBe(true);
  });

  it('has surroundingPairs configuration', () => {
    expect(Array.isArray(config.surroundingPairs)).toBe(true);
  });

  it('auto-closes curly braces', () => {
    const pairs = config.autoClosingPairs as Array<{ open: string; close: string }>;
    expect(pairs.some(p => p.open === '{' && p.close === '}')).toBe(true);
  });
});
