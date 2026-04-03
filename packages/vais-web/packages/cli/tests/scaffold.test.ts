import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { scaffold } from "../src/scaffold.js";

describe("scaffold", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaisx-scaffold-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates project directory with default template", () => {
    const result = scaffold({
      projectName: "my-app",
      parentDir: tmpDir,
      install: false,
    });

    expect(result.projectDir).toBe(path.join(tmpDir, "my-app"));
    expect(result.fileCount).toBe(5);
    expect(result.installed).toBe(false);

    // Verify files exist
    expect(fs.existsSync(path.join(result.projectDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(result.projectDir, "vaisx.config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(result.projectDir, "src", "App.vaisx"))).toBe(true);
    expect(fs.existsSync(path.join(result.projectDir, "public", "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(result.projectDir, ".gitignore"))).toBe(true);
  });

  it("generates valid package.json with project name", () => {
    const result = scaffold({
      projectName: "test-project",
      parentDir: tmpDir,
      install: false,
    });

    const pkg = JSON.parse(
      fs.readFileSync(path.join(result.projectDir, "package.json"), "utf-8"),
    );
    expect(pkg.name).toBe("test-project");
    expect(pkg.scripts.dev).toBe("vaisx dev");
    expect(pkg.scripts.build).toBe("vaisx build");
    expect(pkg.dependencies["@vaisx/runtime"]).toBeDefined();
    expect(pkg.devDependencies["@vaisx/cli"]).toBeDefined();
  });

  it("generates App.vaisx with counter example", () => {
    const result = scaffold({
      projectName: "counter-app",
      parentDir: tmpDir,
      install: false,
    });

    const appContent = fs.readFileSync(
      path.join(result.projectDir, "src", "App.vaisx"),
      "utf-8",
    );
    expect(appContent).toContain("$state(0)");
    expect(appContent).toContain("increment");
    expect(appContent).toContain("<button");
  });

  it("generates index.html with project name in title", () => {
    const result = scaffold({
      projectName: "titled-app",
      parentDir: tmpDir,
      install: false,
    });

    const html = fs.readFileSync(
      path.join(result.projectDir, "public", "index.html"),
      "utf-8",
    );
    expect(html).toContain("<title>titled-app</title>");
    expect(html).toContain('<div id="app">');
  });

  it("throws on invalid project name", () => {
    expect(() =>
      scaffold({ projectName: "bad name!", parentDir: tmpDir, install: false }),
    ).toThrow("Invalid project name");
  });

  it("throws if directory already exists", () => {
    fs.mkdirSync(path.join(tmpDir, "existing"));
    expect(() =>
      scaffold({ projectName: "existing", parentDir: tmpDir, install: false }),
    ).toThrow("Directory already exists");
  });

  it("throws on unknown template", () => {
    expect(() =>
      scaffold({
        projectName: "app",
        parentDir: tmpDir,
        install: false,
        template: "unknown",
      }),
    ).toThrow("Unknown template");
  });
});
