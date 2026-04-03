import { describe, it, expect } from 'vitest';
import { getDiagnostics } from '../src/diagnostics.js';
import { DiagnosticSeverity } from '../src/lsp-types.js';

const VALID_DOC = `<script lang="ts">
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

describe('getDiagnostics — valid file', () => {
  it('returns no errors for a well-formed file', () => {
    const diags = getDiagnostics(VALID_DOC);
    const errors = diags.filter(d => d.severity === DiagnosticSeverity.Error);
    expect(errors).toHaveLength(0);
  });
});

describe('getDiagnostics — parse errors', () => {
  it('reports error for unclosed block', () => {
    const doc = `<script lang="ts">\n  let x = 1;\n\n<template>\n</template>`;
    const diags = getDiagnostics(doc);
    expect(diags.some(d => d.code === 'unclosed-block')).toBe(true);
  });

  it('reports error for duplicate script block', () => {
    const doc = `<script>\nlet a = 1;\n</script>\n<script>\nlet b = 2;\n</script>\n<template></template>`;
    const diags = getDiagnostics(doc);
    expect(diags.some(d => d.code === 'duplicate-block')).toBe(true);
  });
});

describe('getDiagnostics — missing template', () => {
  it('warns when template block is absent', () => {
    const doc = `<script>\nlet x = 1;\n</script>`;
    const diags = getDiagnostics(doc);
    expect(diags.some(d => d.code === 'missing-template')).toBe(true);
  });
});

describe('getDiagnostics — accessibility warnings', () => {
  it('warns about img without alt', () => {
    const doc = `<script>\nlet x = 1;\n</script>\n<template>\n  <img src="photo.jpg">\n</template>`;
    const diags = getDiagnostics(doc);
    expect(diags.some(d => d.code === 'a11y-img-alt')).toBe(true);
  });

  it('does not warn about img with alt', () => {
    const doc = `<script>\nlet x = 1;\n</script>\n<template>\n  <img src="photo.jpg" alt="A photo">\n</template>`;
    const diags = getDiagnostics(doc);
    expect(diags.some(d => d.code === 'a11y-img-alt')).toBe(false);
  });

  it('warns about anchor without href', () => {
    const doc = `<script>\nlet x = 1;\n</script>\n<template>\n  <a>click me</a>\n</template>`;
    const diags = getDiagnostics(doc);
    expect(diags.some(d => d.code === 'a11y-anchor-href')).toBe(true);
  });
});

describe('getDiagnostics — v-for key warning', () => {
  it('warns about v-for without :key', () => {
    const doc = `<script>\nlet x = 1;\n</script>\n<template>\n  <li v-for="item in items">{{ item }}</li>\n</template>`;
    const diags = getDiagnostics(doc);
    expect(diags.some(d => d.code === 'v-for-no-key')).toBe(true);
  });

  it('does not warn about v-for with :key', () => {
    const doc = `<script>\nlet x = 1;\n</script>\n<template>\n  <li v-for="item in items" :key="item.id">{{ item }}</li>\n</template>`;
    const diags = getDiagnostics(doc);
    expect(diags.some(d => d.code === 'v-for-no-key')).toBe(false);
  });
});

describe('getDiagnostics — interpolation errors', () => {
  it('reports error for unclosed interpolation', () => {
    const doc = `<script>\nlet x = 1;\n</script>\n<template>\n  <p>{{ x </p>\n</template>`;
    const diags = getDiagnostics(doc);
    expect(diags.some(d => d.code === 'unclosed-interpolation')).toBe(true);
  });
});

describe('getDiagnostics — severity', () => {
  it('unclosed block is an error', () => {
    const doc = `<script lang="ts">\n  let x = 1;\n\n<template>\n</template>`;
    const diags = getDiagnostics(doc);
    const err = diags.find(d => d.code === 'unclosed-block');
    expect(err?.severity).toBe(DiagnosticSeverity.Error);
  });

  it('a11y warnings are severity Warning', () => {
    const doc = `<script>\nlet x = 1;\n</script>\n<template>\n  <img src="x.png">\n</template>`;
    const diags = getDiagnostics(doc);
    const warn = diags.find(d => d.code === 'a11y-img-alt');
    expect(warn?.severity).toBe(DiagnosticSeverity.Warning);
  });
});
