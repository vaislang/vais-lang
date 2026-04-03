import { describe, it, expect } from 'vitest';
import {
  getCompletions,
  getDirectiveCompletions,
  getPropsForComponent,
  isInsideOpenTag,
  getTagName,
} from '../src/completions.js';
import { BUILTIN_COMPONENTS, VAISX_DIRECTIVES } from '../src/lsp-types.js';

const SAMPLE_DOC = `<script lang="ts">
  let count = __vx_state(0);
</script>

<template>
  <div>
    <p v-if="count > 0">{{ count }}</p>
    <button v-on:click="count++">Increment</button>
  </div>
</template>`;

describe('getCompletions — template tag completions', () => {
  it('includes all built-in components in template', () => {
    const result = getCompletions({
      documentText: SAMPLE_DOC,
      position: { line: 6, character: 4 },
    });
    const labels = result.items.map(i => i.label);
    for (const comp of BUILTIN_COMPONENTS) {
      expect(labels).toContain(comp);
    }
  });

  it('includes HTML elements in template', () => {
    const result = getCompletions({
      documentText: SAMPLE_DOC,
      position: { line: 6, character: 4 },
    });
    const labels = result.items.map(i => i.label);
    expect(labels).toContain('div');
    expect(labels).toContain('span');
  });

  it('isIncomplete is false', () => {
    const result = getCompletions({
      documentText: SAMPLE_DOC,
      position: { line: 6, character: 4 },
    });
    expect(result.isIncomplete).toBe(false);
  });
});

describe('getCompletions — directive completions inside open tag', () => {
  // Position inside an open tag like <button |>
  const docWithOpenTag = `<script lang="ts">\n  let x = 1;\n</script>\n\n<template>\n  <button >\n  </button>\n</template>`;

  it('includes all directives when inside an open tag', () => {
    const result = getCompletions({
      documentText: docWithOpenTag,
      position: { line: 5, character: 10 }, // inside <button >
    });
    const labels = result.items.map(i => i.label);
    for (const dir of VAISX_DIRECTIVES) {
      expect(labels).toContain(dir);
    }
  });

  it('includes props for built-in Button component', () => {
    const docWithButton = `<script lang="ts">\n  let x = 1;\n</script>\n\n<template>\n  <Button >\n  </Button>\n</template>`;
    const result = getCompletions({
      documentText: docWithButton,
      position: { line: 5, character: 10 },
    });
    const labels = result.items.map(i => i.label);
    expect(labels).toContain('variant');
    expect(labels).toContain('disabled');
  });
});

describe('getDirectiveCompletions', () => {
  it('returns a completion item for each directive', () => {
    const items = getDirectiveCompletions();
    expect(items.length).toBe(VAISX_DIRECTIVES.length);
  });

  it('all items have Keyword kind', () => {
    const items = getDirectiveCompletions();
    expect(items.every(i => i.kind === 14 /* CompletionItemKind.Keyword */)).toBe(true);
  });
});

describe('getPropsForComponent', () => {
  it('returns props for Button', () => {
    const props = getPropsForComponent('Button');
    expect(props.length).toBeGreaterThan(0);
    expect(props.some(p => p.label === 'variant')).toBe(true);
  });

  it('returns empty array for unknown component', () => {
    const props = getPropsForComponent('UnknownComponent');
    expect(props).toHaveLength(0);
  });
});

describe('isInsideOpenTag', () => {
  it('returns true when cursor is inside an open tag', () => {
    expect(isInsideOpenTag('<div class=')).toBe(true);
    expect(isInsideOpenTag('<Button v-if')).toBe(true);
  });

  it('returns false when outside open tag', () => {
    expect(isInsideOpenTag('  some text')).toBe(false);
    expect(isInsideOpenTag('<div></div>')).toBe(false);
  });
});

describe('getTagName', () => {
  it('extracts tag name from open tag text', () => {
    expect(getTagName('<Button ')).toBe('Button');
    expect(getTagName('<input type=')).toBe('input');
  });

  it('returns null when no open tag', () => {
    expect(getTagName('some text')).toBeNull();
  });
});
