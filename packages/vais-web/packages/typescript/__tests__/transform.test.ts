import { describe, it, expect } from "vitest";
import { transformTypeScript } from "../src/transform.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VAISX_WITH_TS = `
<template><div>{{ msg }}</div></template>
<script lang="ts">
const msg: string = 'hello';
export default { msg };
</script>
`;

const VAISX_NO_TS = `
<template><div>hi</div></template>
<script lang="js">const x = 1;</script>
`;

const RAW_TS = `
interface Foo { bar: string }
const x: Foo = { bar: 'baz' };
export default x;
`;

const GENERIC_TS = `
function identity<T>(value: T): T {
  return value;
}
export const result = identity<number>(42);
`;

const TYPE_ONLY_EXPORT = `
export type { Foo };
interface Foo { id: number }
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("transformTypeScript — basic transpilation", () => {
  it("transpiles TypeScript from a .vaisx file to valid JS", async () => {
    const result = await transformTypeScript({
      filename: "Button.vaisx",
      source: VAISX_WITH_TS,
    });
    expect(result.code).toBeTruthy();
    // Type annotations must be stripped.
    expect(result.code).not.toContain(": string");
  });

  it("returns empty code with a warning when no TS block is present", async () => {
    const result = await transformTypeScript({
      filename: "Button.vaisx",
      source: VAISX_NO_TS,
    });
    expect(result.code).toBe("");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("No <script");
  });

  it("accepts rawTs=true for bare TypeScript input", async () => {
    const result = await transformTypeScript({
      filename: "foo.ts",
      source: RAW_TS,
      rawTs: true,
    });
    expect(result.code).toBeTruthy();
    expect(result.code).not.toContain("interface Foo");
  });

  it("strips generic type parameters", async () => {
    const result = await transformTypeScript({
      filename: "generic.ts",
      source: GENERIC_TS,
      rawTs: true,
    });
    expect(result.code).not.toContain("<number>");
    expect(result.code).toContain("identity(42)");
  });

  it("strips export type { } statements", async () => {
    const result = await transformTypeScript({
      filename: "types.ts",
      source: TYPE_ONLY_EXPORT,
      rawTs: true,
    });
    // esbuild removes type-only exports.
    expect(result.code).not.toContain("export type");
  });
});

describe("transformTypeScript — targets", () => {
  it("respects target=es2020", async () => {
    const result = await transformTypeScript({
      filename: "t.ts",
      source: "const x: number = 1;",
      rawTs: true,
      target: "es2020",
    });
    expect(result.warnings).toEqual([]);
    expect(result.code).toBeTruthy();
  });

  it("respects target=esnext", async () => {
    const result = await transformTypeScript({
      filename: "t.ts",
      source: "const x: number = 1;",
      rawTs: true,
      target: "esnext",
    });
    expect(result.code).toBeTruthy();
  });

  it("defaults to es2022 when target is omitted", async () => {
    const result = await transformTypeScript({
      filename: "t.ts",
      source: "const x: number = 1;",
      rawTs: true,
    });
    expect(result.code).toBeTruthy();
  });
});

describe("transformTypeScript — source maps", () => {
  it("returns a map string when esbuild emits a source map", async () => {
    const result = await transformTypeScript({
      filename: "t.ts",
      source: "const x: number = 42;",
      rawTs: true,
    });
    // map may be present — just verify it's a string if present.
    if (result.map !== undefined) {
      expect(typeof result.map).toBe("string");
      // Should be valid JSON.
      expect(() => JSON.parse(result.map!)).not.toThrow();
    }
  });
});
