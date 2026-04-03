import { describe, it, expect } from 'vitest';
import {
  parseVaisxFile,
  extractComponents,
  extractVariables,
  getBlockAtPosition,
} from '../src/parser-bridge.js';

const SAMPLE = `<script lang="ts">
  let count = __vx_state(0);
  let doubled = __vx_derived(count * 2);
</script>

<template>
  <div>
    <p v-if="count > 0">{{ count }}</p>
    <button v-on:click="count++">Increment</button>
  </div>
</template>

<style>
  p { color: blue; }
</style>`;

describe('parseVaisxFile', () => {
  it('extracts script block', () => {
    const result = parseVaisxFile(SAMPLE);
    expect(result.script).toBeDefined();
    expect(result.script?.lang).toBe('ts');
    expect(result.script?.content).toContain('__vx_state');
  });

  it('extracts template block', () => {
    const result = parseVaisxFile(SAMPLE);
    expect(result.template).toBeDefined();
    expect(result.template?.content).toContain('v-if');
  });

  it('extracts style block', () => {
    const result = parseVaisxFile(SAMPLE);
    expect(result.style).toBeDefined();
    expect(result.style?.content).toContain('color: blue');
  });

  it('returns no errors for valid file', () => {
    const result = parseVaisxFile(SAMPLE);
    expect(result.errors).toHaveLength(0);
  });

  it('reports error for unclosed block', () => {
    const invalid = `<script lang="ts">\n  let x = 1;\n\n<template>\n</template>`;
    const result = parseVaisxFile(invalid);
    expect(result.errors.some(e => e.code === 'unclosed-block')).toBe(true);
  });

  it('reports error for duplicate script block', () => {
    const dup = `<script>\nlet a = 1;\n</script>\n<script>\nlet b = 2;\n</script>`;
    const result = parseVaisxFile(dup);
    expect(result.errors.some(e => e.code === 'duplicate-block')).toBe(true);
  });

  it('correctly identifies block line numbers', () => {
    const result = parseVaisxFile(SAMPLE);
    expect(result.script?.startLine).toBe(0);
    expect(result.template?.startLine).toBeGreaterThan(0);
  });
});

describe('extractComponents', () => {
  it('extracts default import components', () => {
    const script = `import MyButton from './components/MyButton.js';\nimport { Link } from '@vaisx/components';`;
    const comps = extractComponents(script);
    expect(comps.some(c => c.name === 'MyButton')).toBe(true);
    expect(comps.some(c => c.name === 'Link')).toBe(true);
  });

  it('ignores lowercase imports (non-components)', () => {
    const script = `import utils from './utils.js';`;
    const comps = extractComponents(script);
    expect(comps).toHaveLength(0);
  });
});

describe('extractVariables', () => {
  it('extracts let/const/var declarations', () => {
    const script = `let count = 0;\nconst name = 'test';\nvar x = true;`;
    const vars = extractVariables(script);
    expect(vars).toContain('count');
    expect(vars).toContain('name');
    expect(vars).toContain('x');
  });

  it('extracts function declarations', () => {
    const script = `function handleClick() { return; }`;
    const vars = extractVariables(script);
    expect(vars).toContain('handleClick');
  });
});

describe('getBlockAtPosition', () => {
  it('returns script block for position inside script', () => {
    const result = parseVaisxFile(SAMPLE);
    const block = getBlockAtPosition(result, { line: 1, character: 5 });
    expect(block?.type).toBe('script');
  });

  it('returns template block for position inside template', () => {
    const result = parseVaisxFile(SAMPLE);
    const block = getBlockAtPosition(result, { line: 7, character: 5 });
    expect(block?.type).toBe('template');
  });

  it('returns null for position between blocks', () => {
    const result = parseVaisxFile(SAMPLE);
    const block = getBlockAtPosition(result, { line: 4, character: 0 });
    expect(block).toBeNull();
  });
});
