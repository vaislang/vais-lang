import { describe, it, expect } from 'vitest';
import {
  getHover,
  getWordAtPosition,
  isDirective,
  isBuiltinComponent,
  isVaisxApi,
} from '../src/hover.js';

const SAMPLE_DOC = `<script lang="ts">
  let count = __vx_state(0);
  let doubled = __vx_derived(count * 2);
</script>

<template>
  <div>
    <Button variant="primary">Click</Button>
    <p v-if="count > 0">{{ count }}</p>
  </div>
</template>`;

describe('getHover — directives', () => {
  it('returns hover for v-if', () => {
    // Line 8: "    <p v-if="count > 0">{{ count }}</p>"
    const hover = getHover({
      documentText: SAMPLE_DOC,
      position: { line: 8, character: 10 },
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('v-if');
  });
});

describe('getHover — built-in components', () => {
  it('returns hover for Button component', () => {
    // Line 7: "    <Button variant="primary">Click</Button>"
    const hover = getHover({
      documentText: SAMPLE_DOC,
      position: { line: 7, character: 6 },
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('Button');
  });
});

describe('getHover — reactivity APIs', () => {
  it('returns hover for __vx_state', () => {
    // Line 1: "  let count = __vx_state(0);"
    const hover = getHover({
      documentText: SAMPLE_DOC,
      position: { line: 1, character: 16 },
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('__vx_state');
  });

  it('returns hover for __vx_derived', () => {
    const hover = getHover({
      documentText: SAMPLE_DOC,
      position: { line: 2, character: 18 },
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('__vx_derived');
  });
});

describe('getHover — unknown word', () => {
  it('returns null for unknown word', () => {
    const hover = getHover({
      documentText: SAMPLE_DOC,
      position: { line: 0, character: 1 }, // '<' character
    });
    expect(hover).toBeNull();
  });
});

describe('getWordAtPosition', () => {
  it('extracts simple word', () => {
    expect(getWordAtPosition('  let count = 0;', 6)).toBe('count');
  });

  it('extracts directive with hyphen', () => {
    expect(getWordAtPosition('  <p v-if="x">', 7)).toBe('v-if');
  });

  it('returns null when on whitespace between words', () => {
    // Position 3 in "let  x" is in the double-space gap
    const result = getWordAtPosition('let  x', 4);
    // "let" ends at index 2, "x" starts at index 5 — position 4 is gap
    expect(result).toBeNull();
  });
});

describe('isDirective', () => {
  it('recognises VaisX directives', () => {
    expect(isDirective('v-if')).toBe(true);
    expect(isDirective('v-for')).toBe(true);
    expect(isDirective('v-model')).toBe(true);
  });

  it('rejects non-directives', () => {
    expect(isDirective('class')).toBe(false);
    expect(isDirective('v-unknown')).toBe(false);
  });
});

describe('isBuiltinComponent', () => {
  it('recognises built-in components', () => {
    expect(isBuiltinComponent('Button')).toBe(true);
    expect(isBuiltinComponent('Modal')).toBe(true);
  });

  it('rejects unknown components', () => {
    expect(isBuiltinComponent('MyCustomComp')).toBe(false);
  });
});

describe('isVaisxApi', () => {
  it('recognises VaisX APIs', () => {
    expect(isVaisxApi('__vx_state')).toBe(true);
    expect(isVaisxApi('__vx_derived')).toBe(true);
  });

  it('rejects non-APIs', () => {
    expect(isVaisxApi('useState')).toBe(false);
  });
});
