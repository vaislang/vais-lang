import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// We mock the WASM module since it requires the actual WASM binary
vi.mock("node:module", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:module")>();
  return {
    ...original,
    createRequire: (url: string) => {
      const realRequire = original.createRequire(url);
      return (id: string) => {
        if (id.includes("vaisx_wasm")) {
          // Return mock WASM module
          return {
            compile(source: string, optionsJson?: string | null): string {
              if (source === "") {
                return JSON.stringify({
                  ok: true,
                  js: "// empty component",
                  sourceMap: null,
                  warnings: [],
                });
              }
              if (source.includes("INVALID")) {
                return JSON.stringify({
                  ok: false,
                  error: "Parse error",
                  offset: 0,
                });
              }
              const options = optionsJson ? JSON.parse(optionsJson) : {};
              return JSON.stringify({
                ok: true,
                js: `// compiled: ${options.componentName ?? "Anonymous"}`,
                sourceMap: null,
                warnings: [],
              });
            },
            parse(source: string): string {
              return JSON.stringify({ ok: true, ast: {} });
            },
            parseWithRecovery(source: string): string {
              return JSON.stringify({ ast: {}, errors: [] });
            },
          };
        }
        return realRequire(id);
      };
    },
  };
});

// Dynamic import after mock setup
const { compileSource, compileFile } = await import("../src/compiler.js");

describe("compileSource", () => {
  it("compiles empty source successfully", () => {
    const result = compileSource("");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.js).toBe("// empty component");
    }
  });

  it("compiles with options", () => {
    const result = compileSource("<script></script>", {
      componentName: "Counter",
      devMode: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.js).toContain("Counter");
    }
  });

  it("returns error for invalid source", () => {
    const result = compileSource("INVALID");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Parse error");
    }
  });
});

describe("compileFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaisx-compile-"));
  });

  it("reads file and derives component name", () => {
    const filePath = path.join(tmpDir, "MyButton.vaisx");
    fs.writeFileSync(filePath, "<script></script>");

    const result = compileFile(filePath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.js).toContain("MyButton");
    }
  });

  it("uses custom component name when provided", () => {
    const filePath = path.join(tmpDir, "widget.vaisx");
    fs.writeFileSync(filePath, "<script></script>");

    const result = compileFile(filePath, { componentName: "CustomWidget" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.js).toContain("CustomWidget");
    }
  });
});
