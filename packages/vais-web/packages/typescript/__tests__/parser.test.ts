import { describe, it, expect } from "vitest";
import { parseScriptBlocks, extractTypeScriptSource } from "../src/parser.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SIMPLE_VAISX = `
<template>
  <div>{{ count }}</div>
</template>

<script lang="ts">
import { ref } from '@vaisx/runtime';
const count = ref(0);
</script>
`;

const TYPESCRIPT_LANG_ALIAS = `
<script lang="typescript">
const x: number = 1;
</script>
`;

const PLAIN_JS_VAISX = `
<script lang="js">
const x = 1;
</script>
`;

const NO_SCRIPT_VAISX = `
<template><div>hello</div></template>
`;

const SETUP_VAISX = `
<script lang="ts" setup>
const msg = 'hello';
</script>
`;

const MULTIPLE_BLOCKS = `
<script lang="ts">
type A = string;
</script>

<script lang="ts" setup>
const x: A = 'ok';
</script>
`;

const MIXED_BLOCKS = `
<script lang="js">
const ignored = true;
</script>

<script lang="ts">
const included: number = 42;
</script>
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("parseScriptBlocks — basic detection", () => {
  it("detects a single <script lang=\"ts\"> block", () => {
    const result = parseScriptBlocks(SIMPLE_VAISX);
    expect(result.hasTypeScript).toBe(true);
    expect(result.scriptBlocks).toHaveLength(1);
  });

  it("accepts lang=\"typescript\" as an alias", () => {
    const result = parseScriptBlocks(TYPESCRIPT_LANG_ALIAS);
    expect(result.hasTypeScript).toBe(true);
    expect(result.scriptBlocks[0].lang).toBe("typescript");
  });

  it("ignores <script lang=\"js\"> blocks", () => {
    const result = parseScriptBlocks(PLAIN_JS_VAISX);
    expect(result.hasTypeScript).toBe(false);
    expect(result.scriptBlocks).toHaveLength(0);
  });

  it("returns hasTypeScript=false when there is no script tag", () => {
    const result = parseScriptBlocks(NO_SCRIPT_VAISX);
    expect(result.hasTypeScript).toBe(false);
  });
});

describe("parseScriptBlocks — source extraction", () => {
  it("extracts the TypeScript source (without the script tags)", () => {
    const result = parseScriptBlocks(SIMPLE_VAISX);
    const src = result.scriptBlocks[0].source;
    expect(src).toContain("import { ref }");
    expect(src).toContain("const count = ref(0)");
    expect(src).not.toContain("<script");
    expect(src).not.toContain("</script>");
  });

  it("detects the setup attribute correctly", () => {
    const result = parseScriptBlocks(SETUP_VAISX);
    expect(result.scriptBlocks[0].setup).toBe(true);
  });

  it("setup is false when the attribute is absent", () => {
    const result = parseScriptBlocks(SIMPLE_VAISX);
    expect(result.scriptBlocks[0].setup).toBe(false);
  });
});

describe("parseScriptBlocks — multiple blocks", () => {
  it("collects all TS blocks when there are multiple", () => {
    const result = parseScriptBlocks(MULTIPLE_BLOCKS);
    expect(result.scriptBlocks).toHaveLength(2);
  });

  it("ignores non-TS blocks when mixed", () => {
    const result = parseScriptBlocks(MIXED_BLOCKS);
    expect(result.scriptBlocks).toHaveLength(1);
    expect(result.scriptBlocks[0].source).toContain("included: number");
  });
});

describe("parseScriptBlocks — offsets and line numbers", () => {
  it("sets startOffset < endOffset", () => {
    const result = parseScriptBlocks(SIMPLE_VAISX);
    const block = result.scriptBlocks[0];
    expect(block.startOffset).toBeGreaterThanOrEqual(0);
    expect(block.endOffset).toBeGreaterThan(block.startOffset);
  });

  it("sets startLine ≤ endLine", () => {
    const result = parseScriptBlocks(SIMPLE_VAISX);
    const block = result.scriptBlocks[0];
    expect(block.startLine).toBeGreaterThanOrEqual(1);
    expect(block.endLine).toBeGreaterThanOrEqual(block.startLine);
  });
});

describe("extractTypeScriptSource", () => {
  it("returns concatenated source from all TS blocks", () => {
    const src = extractTypeScriptSource(MULTIPLE_BLOCKS);
    expect(src).toContain("type A = string");
    expect(src).toContain("const x: A = 'ok'");
  });

  it("returns empty string when no TS blocks exist", () => {
    const src = extractTypeScriptSource(NO_SCRIPT_VAISX);
    expect(src).toBe("");
  });
});
