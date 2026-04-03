import { describe, it, expect } from "vitest";
import { cssPlugin } from "../src/builtins/css-plugin.js";
import { imagePlugin } from "../src/builtins/image-plugin.js";
import { jsonPlugin } from "../src/builtins/json-plugin.js";
import type { TransformResult, LoadResult } from "../src/types.js";

// ── helpers ────────────────────────────────────────────────────────────────

function getCode(result: TransformResult | null | undefined): string {
  if (result == null) throw new Error("Expected non-null result");
  if (typeof result === "string") return result;
  return result.code;
}

function getLoadCode(result: LoadResult | null | undefined): string {
  if (result == null) throw new Error("Expected non-null result");
  if (typeof result === "string") return result;
  return result.code;
}

// ── CSS plugin ─────────────────────────────────────────────────────────────

describe("cssPlugin", () => {
  it("transforms a .css file into a JS module with export default", async () => {
    const plugin = cssPlugin();
    const css = "body { color: red; }";
    const result = await plugin.transform!(css, "/project/src/styles.css");

    const code = getCode(result);
    expect(code).toContain("export default");
    expect(code).toContain("body { color: red; }");
  });

  it("includes a scope ID in the output for plain .css", async () => {
    const plugin = cssPlugin();
    const result = await plugin.transform!("h1 {}", "/project/src/app.css");

    const code = getCode(result);
    expect(code).toContain("__scopeId");
    expect(code).toMatch(/data-v-[0-9a-f]+/);
  });

  it("returns null for non-CSS files", async () => {
    const plugin = cssPlugin();
    const result = await plugin.transform!("const x = 1;", "/project/src/main.ts");
    expect(result).toBeNull();
  });

  it("transforms .module.css with hashed class names", async () => {
    const plugin = cssPlugin();
    const css = ".container { display: flex; } .title { font-size: 2rem; }";
    const result = await plugin.transform!(css, "/project/src/App.module.css");

    const code = getCode(result);
    // The mapping object should be the default export
    expect(code).toContain("export default __cssModules");
    // Each class should appear as a key in the mapping
    expect(code).toContain('"container"');
    expect(code).toContain('"title"');
    // Hashed values should be present (format: <className>_<hash>)
    expect(code).toMatch(/container_[0-9a-f]+/);
    expect(code).toMatch(/title_[0-9a-f]+/);
  });

  it("different files produce different scope IDs", async () => {
    const plugin = cssPlugin();
    const r1 = await plugin.transform!("a{}", "/project/src/a.css");
    const r2 = await plugin.transform!("a{}", "/project/src/b.css");

    const c1 = getCode(r1);
    const c2 = getCode(r2);

    // Extract scope IDs
    const match1 = c1.match(/data-v-([0-9a-f]+)/);
    const match2 = c2.match(/data-v-([0-9a-f]+)/);

    expect(match1).not.toBeNull();
    expect(match2).not.toBeNull();
    expect(match1![1]).not.toBe(match2![1]);
  });

  it("resolves virtual:css/... module IDs", () => {
    const plugin = cssPlugin();
    const resolved = plugin.resolveId!("virtual:css/theme");
    expect(resolved).toBe("virtual:css/theme");
  });

  it("returns null for non-virtual resolveId calls", () => {
    const plugin = cssPlugin();
    const result = plugin.resolveId!("./styles.css");
    expect(result).toBeNull();
  });
});

// ── Image plugin ───────────────────────────────────────────────────────────

describe("imagePlugin", () => {
  const IMAGE_FILES = [
    "/project/assets/logo.png",
    "/project/assets/photo.jpg",
    "/project/assets/photo.jpeg",
    "/project/assets/anim.gif",
    "/project/assets/icon.svg",
    "/project/assets/hero.webp",
  ];

  it.each(IMAGE_FILES)("load returns URL export for %s", async (filePath) => {
    const plugin = imagePlugin();
    const result = await plugin.load!(filePath);

    const code = getLoadCode(result);
    expect(code).toContain("export default");
    // The exported value should be a string URL
    expect(code).toMatch(/export default ["']/);
  });

  it("returns null for non-image files", async () => {
    const plugin = imagePlugin();
    const result = await plugin.load!("/project/src/main.ts");
    expect(result).toBeNull();
  });

  it("returns null for .css files", async () => {
    const plugin = imagePlugin();
    const result = await plugin.load!("/project/src/styles.css");
    expect(result).toBeNull();
  });

  it("dev mode: exports the original basename under /assets", async () => {
    const plugin = imagePlugin(); // default: isBuild = false
    const result = await plugin.load!("/project/assets/logo.png");

    const code = getLoadCode(result);
    expect(code).toContain("/assets/logo.png");
  });

  it("build mode: exports a hashed file name", async () => {
    const plugin = imagePlugin({ isBuild: true });
    const result = await plugin.load!("/project/assets/logo.png");

    const code = getLoadCode(result);
    // Should contain the original extension
    expect(code).toContain(".png");
    // Should NOT be the bare original name – must have a hash segment
    expect(code).toMatch(/logo\.[0-9a-f]+\.png/);
  });

  it("uses a custom publicDir when provided", async () => {
    const plugin = imagePlugin({ publicDir: "/static/images" });
    const result = await plugin.load!("/project/assets/banner.jpg");

    const code = getLoadCode(result);
    expect(code).toContain("/static/images/banner.jpg");
  });
});

// ── JSON plugin ────────────────────────────────────────────────────────────

describe("jsonPlugin", () => {
  it("transforms .json to named exports and default export", async () => {
    const plugin = jsonPlugin();
    const json = JSON.stringify({ name: "vaisx", version: "0.1.0", count: 42 });
    const result = await plugin.transform!(json, "/project/src/config.json");

    const code = getCode(result);

    expect(code).toContain("export const name");
    expect(code).toContain("export const version");
    expect(code).toContain("export const count");
    expect(code).toContain("export default");
    expect(code).toContain('"vaisx"');
    expect(code).toContain('"0.1.0"');
    expect(code).toContain("42");
  });

  it("returns null for non-.json files", async () => {
    const plugin = jsonPlugin();
    const result = await plugin.transform!("const x = 1;", "/project/src/main.ts");
    expect(result).toBeNull();
  });

  it("default export contains the full JSON object", async () => {
    const plugin = jsonPlugin();
    const data = { foo: "bar", nested: { a: 1 } };
    const result = await plugin.transform!(JSON.stringify(data), "/project/src/data.json");

    const code = getCode(result);
    expect(code).toContain("export default");
    // The stringified value should appear somewhere in the default export line
    expect(code).toContain('"foo"');
    expect(code).toContain('"nested"');
  });

  it("handles nested objects in named exports", async () => {
    const plugin = jsonPlugin();
    const json = JSON.stringify({ settings: { theme: "dark" }, enabled: true });
    const result = await plugin.transform!(json, "/project/src/app.json");

    const code = getCode(result);

    expect(code).toContain("export const settings");
    expect(code).toContain("export const enabled");
    // Nested value should be inlined
    expect(code).toContain('"theme"');
    expect(code).toContain('"dark"');
  });

  it("handles JSON arrays as default export without named exports", async () => {
    const plugin = jsonPlugin();
    const json = JSON.stringify([1, 2, 3]);
    const result = await plugin.transform!(json, "/project/src/list.json");

    const code = getCode(result);

    // Arrays don't produce named exports
    expect(code).not.toContain("export const");
    expect(code).toContain("export default [1,2,3]");
  });

  it("skips keys that are not valid JS identifiers", async () => {
    const plugin = jsonPlugin();
    const json = JSON.stringify({ "valid-key": 1, normalKey: 2, "123invalid": 3 });
    const result = await plugin.transform!(json, "/project/src/mixed.json");

    const code = getCode(result);

    expect(code).not.toContain("export const valid-key");
    expect(code).not.toContain("export const 123invalid");
    expect(code).toContain("export const normalKey");
  });

  it("throws a meaningful error for invalid JSON", async () => {
    const plugin = jsonPlugin();
    await expect(
      plugin.transform!("{ invalid json }", "/project/src/broken.json")
    ).rejects.toThrow("[vaisx:json]");
  });
});
