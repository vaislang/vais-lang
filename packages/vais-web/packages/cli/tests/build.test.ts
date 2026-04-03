import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { VaisxConfig } from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/config.js";

// Mock esbuild
vi.mock("esbuild", () => ({
  build: vi.fn().mockResolvedValue({}),
}));

// Mock the compiler
vi.mock("../src/compiler.js", () => ({
  compileFile: vi.fn((filePath: string, options?: Record<string, unknown>) => {
    const source = fs.readFileSync(filePath, "utf-8");
    if (source.includes("ERROR")) {
      return { ok: false, error: "Compilation error", offset: 0 };
    }
    const name = path.basename(filePath, ".vaisx");
    return {
      ok: true,
      js: `// compiled ${name}\nexport default function ${name}() {}`,
      sourceMap: null,
      warnings: source.includes("WARN") ? ["Test warning"] : [],
    };
  }),
}));

const { build } = await import("../src/build.js");

describe("build", () => {
  let tmpDir: string;
  let config: VaisxConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaisx-build-"));
    config = { ...DEFAULT_CONFIG };

    // Create src directory with .vaisx files
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("compiles .vaisx files to outDir", async () => {
    const srcDir = path.join(tmpDir, "src");
    fs.writeFileSync(
      path.join(srcDir, "App.vaisx"),
      "<script>count := $state(0)</script>",
    );

    const result = await build(tmpDir, config);

    expect(result.compiledCount).toBe(1);
    expect(result.errors).toHaveLength(0);

    const outFile = path.join(tmpDir, "dist", "App.js");
    expect(fs.existsSync(outFile)).toBe(true);
    expect(fs.readFileSync(outFile, "utf-8")).toContain("compiled App");
  });

  it("preserves directory structure", async () => {
    const srcDir = path.join(tmpDir, "src");
    const subDir = path.join(srcDir, "components");
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, "Button.vaisx"),
      "<script></script>",
    );

    const result = await build(tmpDir, config);

    expect(result.compiledCount).toBe(1);
    const outFile = path.join(tmpDir, "dist", "components", "Button.js");
    expect(fs.existsSync(outFile)).toBe(true);
  });

  it("reports warnings", async () => {
    const srcDir = path.join(tmpDir, "src");
    fs.writeFileSync(path.join(srcDir, "Warn.vaisx"), "WARN content");

    const result = await build(tmpDir, config);

    expect(result.compiledCount).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.file).toBe("Warn.vaisx");
  });

  it("reports errors without crashing", async () => {
    const srcDir = path.join(tmpDir, "src");
    fs.writeFileSync(path.join(srcDir, "Bad.vaisx"), "ERROR content");
    fs.writeFileSync(
      path.join(srcDir, "Good.vaisx"),
      "<script></script>",
    );

    const result = await build(tmpDir, config);

    expect(result.compiledCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.file).toBe("Bad.vaisx");
  });

  it("returns empty result when no files found", async () => {
    // Empty src directory — no .vaisx files
    const result = await build(tmpDir, config);

    expect(result.compiledCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("respects custom srcDir and outDir", async () => {
    const customSrc = path.join(tmpDir, "app");
    fs.mkdirSync(customSrc, { recursive: true });
    fs.writeFileSync(
      path.join(customSrc, "Page.vaisx"),
      "<script></script>",
    );

    config.srcDir = "app";
    config.outDir = "build";

    const result = await build(tmpDir, config);

    expect(result.compiledCount).toBe(1);
    const outFile = path.join(tmpDir, "build", "Page.js");
    expect(fs.existsSync(outFile)).toBe(true);
  });
});
