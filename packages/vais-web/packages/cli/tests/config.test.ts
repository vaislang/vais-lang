import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, DEFAULT_CONFIG } from "../src/config.js";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaisx-config-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", async () => {
    const config = await loadConfig(tmpDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("loads vaisx.config.mjs with custom values", async () => {
    const configContent = `export default { srcDir: "app", outDir: "build", devMode: true };`;
    fs.writeFileSync(path.join(tmpDir, "vaisx.config.mjs"), configContent);

    const config = await loadConfig(tmpDir);
    expect(config.srcDir).toBe("app");
    expect(config.outDir).toBe("build");
    expect(config.devMode).toBe(true);
    // Defaults preserved for unset fields
    expect(config.target).toBe("es2022");
    expect(config.external).toEqual(["@vaisx/runtime"]);
  });

  it("merges esbuild options", async () => {
    const configContent = `export default { esbuild: { minify: true } };`;
    fs.writeFileSync(path.join(tmpDir, "vaisx.config.mjs"), configContent);

    const config = await loadConfig(tmpDir);
    expect(config.esbuild).toEqual({ minify: true });
  });
});

describe("DEFAULT_CONFIG", () => {
  it("has expected shape", () => {
    expect(DEFAULT_CONFIG.srcDir).toBe("src");
    expect(DEFAULT_CONFIG.outDir).toBe("dist");
    expect(DEFAULT_CONFIG.devMode).toBe(false);
    expect(DEFAULT_CONFIG.sourceMap).toBe(false);
    expect(DEFAULT_CONFIG.target).toBe("es2022");
    expect(DEFAULT_CONFIG.external).toContain("@vaisx/runtime");
  });
});
