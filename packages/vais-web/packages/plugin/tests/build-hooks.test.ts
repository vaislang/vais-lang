import { describe, it, expect, vi } from "vitest";
import { PluginContainer } from "../src/container.js";
import { BuildPipeline } from "../src/build-hooks.js";
import type { VaisXPlugin } from "../src/types.js";

// ── resolveAndLoad tests ───────────────────────────────────────────────────

describe("BuildPipeline - resolveAndLoad", () => {
  it("resolveId transforms the source path into a resolved id", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "resolver",
        resolveId(source) {
          if (source === "my-module") return "/abs/path/my-module.js";
          return null;
        },
        load(id) {
          if (id === "/abs/path/my-module.js") return "export default 42;";
          return null;
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    const { id, code } = await pipeline.resolveAndLoad("my-module");

    expect(id).toBe("/abs/path/my-module.js");
    expect(code).toBe("export default 42;");
  });

  it("falls back to original source when resolveId returns null", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "loader",
        load(id) {
          return `// loaded: ${id}`;
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    const { id, code } = await pipeline.resolveAndLoad("./src/app.ts");

    expect(id).toBe("./src/app.ts");
    expect(code).toBe("// loaded: ./src/app.ts");
  });

  it("load returns code from the plugin", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "code-loader",
        resolveId() {
          return "/resolved/entry.js";
        },
        load() {
          return { code: "const answer = 42;", map: null };
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    const { id, code } = await pipeline.resolveAndLoad("entry");

    expect(id).toBe("/resolved/entry.js");
    expect(code).toBe("const answer = 42;");
  });

  it("returns empty string when load returns null", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "no-loader",
        resolveId() {
          return "/some/id.js";
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    const { id, code } = await pipeline.resolveAndLoad("something");

    expect(id).toBe("/some/id.js");
    expect(code).toBe("");
  });

  it("passes importer to resolveId", async () => {
    const resolveIdFn = vi.fn().mockReturnValue(null);
    const plugins: VaisXPlugin[] = [{ name: "spy", resolveId: resolveIdFn }];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    await pipeline.resolveAndLoad("./dep", "/project/main.ts");

    expect(resolveIdFn).toHaveBeenCalledWith("./dep", "/project/main.ts");
  });

  it("supports object result from resolveId", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "object-resolver",
        resolveId() {
          return { id: "/object/resolved.js", external: false };
        },
        load() {
          return "export {};";
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    const { id } = await pipeline.resolveAndLoad("anything");

    expect(id).toBe("/object/resolved.js");
  });
});

// ── transformCode tests ────────────────────────────────────────────────────

describe("BuildPipeline - transformCode", () => {
  it("transform chain transforms the code", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "step-1",
        transform(code) {
          return code.replace("foo", "bar");
        },
      },
      {
        name: "step-2",
        transform(code) {
          return code + " // transformed";
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    const result = await pipeline.transformCode("foo()", "file.js");

    expect(result).toBe("bar() // transformed");
  });

  it("returns original code when no plugin transforms", async () => {
    const plugins: VaisXPlugin[] = [{ name: "no-transform" }];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    const original = "const x = 1;";
    const result = await pipeline.transformCode(original, "file.js");

    expect(result).toBe(original);
  });

  it("supports object result from transform", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "object-transform",
        transform(code) {
          return { code: code + " // mapped", map: "{}" };
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    const result = await pipeline.transformCode("const x = 1;", "file.js");

    expect(result).toBe("const x = 1; // mapped");
  });
});

// ── run (full pipeline) tests ──────────────────────────────────────────────

describe("BuildPipeline - run", () => {
  it("executes buildStart → resolve → load → transform → buildEnd in order", async () => {
    const callOrder: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "order-tracker",
        buildStart() {
          callOrder.push("buildStart");
        },
        buildEnd() {
          callOrder.push("buildEnd");
        },
        resolveId(source) {
          callOrder.push("resolveId");
          return `/resolved/${source}`;
        },
        load() {
          callOrder.push("load");
          return "export default 1;";
        },
        transform(code) {
          callOrder.push("transform");
          return code + " // done";
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    await pipeline.run(["entry.ts"]);

    expect(callOrder).toEqual([
      "buildStart",
      "resolveId",
      "load",
      "transform",
      "buildEnd",
    ]);
  });

  it("processes multiple entry points and returns all modules", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "multi-entry",
        resolveId(source) {
          return `/abs/${source}`;
        },
        load(id) {
          return `// code for ${id}`;
        },
        transform(code) {
          return code + " // tx";
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    const output = await pipeline.run(["a.ts", "b.ts", "c.ts"]);

    expect(output.modules.size).toBe(3);

    const moduleA = output.modules.get("a.ts");
    expect(moduleA?.id).toBe("/abs/a.ts");
    expect(moduleA?.code).toBe("// code for /abs/a.ts");
    expect(moduleA?.transformedCode).toBe("// code for /abs/a.ts // tx");

    const moduleB = output.modules.get("b.ts");
    expect(moduleB?.id).toBe("/abs/b.ts");

    const moduleC = output.modules.get("c.ts");
    expect(moduleC?.id).toBe("/abs/c.ts");
  });

  it("stores original code and transformed code separately", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "code-tracker",
        resolveId(source) {
          return `/resolved/${source}`;
        },
        load() {
          return "original code";
        },
        transform(code) {
          return "transformed: " + code;
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    const output = await pipeline.run(["main.ts"]);
    const mod = output.modules.get("main.ts");

    expect(mod?.code).toBe("original code");
    expect(mod?.transformedCode).toBe("transformed: original code");
  });

  it("passes error to buildEnd when pipeline throws", async () => {
    let receivedError: Error | undefined;

    const plugins: VaisXPlugin[] = [
      {
        name: "error-spy",
        buildEnd(error) {
          receivedError = error;
        },
        resolveId() {
          throw new Error("resolve failed");
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    await expect(pipeline.run(["entry.ts"])).rejects.toThrow("resolve failed");
    expect(receivedError).toBeInstanceOf(Error);
    expect(receivedError?.message).toBe("resolve failed");
  });

  it("calls buildEnd even when an error occurs during processing", async () => {
    const buildEndFn = vi.fn();

    const plugins: VaisXPlugin[] = [
      {
        name: "faulty",
        buildEnd: buildEndFn,
        load() {
          throw new Error("load error");
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const pipeline = new BuildPipeline(container);

    await expect(pipeline.run(["entry.ts"])).rejects.toThrow("load error");
    expect(buildEndFn).toHaveBeenCalledOnce();
    expect(buildEndFn).toHaveBeenCalledWith(expect.any(Error));
  });

  it("run with no plugins produces empty-code modules", async () => {
    const container = new PluginContainer([]);
    const pipeline = new BuildPipeline(container);

    const output = await pipeline.run(["entry.ts"]);

    expect(output.modules.size).toBe(1);
    const mod = output.modules.get("entry.ts");
    expect(mod?.id).toBe("entry.ts");
    expect(mod?.code).toBe("");
    expect(mod?.transformedCode).toBe("");
  });
});
