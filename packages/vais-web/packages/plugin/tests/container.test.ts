import { describe, it, expect, vi } from "vitest";
import { PluginContainer } from "../src/container.js";
import type { VaisXPlugin } from "../src/types.js";

// ── Plugin sorting tests ───────────────────────────────────────────────────

describe("PluginContainer - plugin sorting", () => {
  it("sorts plugins: pre → normal → post", () => {
    const order: string[] = [];

    const prePlugin: VaisXPlugin = {
      name: "pre-plugin",
      enforce: "pre",
      buildStart() {
        order.push("pre");
      },
    };

    const normalPlugin: VaisXPlugin = {
      name: "normal-plugin",
      buildStart() {
        order.push("normal");
      },
    };

    const postPlugin: VaisXPlugin = {
      name: "post-plugin",
      enforce: "post",
      buildStart() {
        order.push("post");
      },
    };

    // Intentionally pass in reverse order to verify sorting
    const container = new PluginContainer([postPlugin, normalPlugin, prePlugin]);

    expect(container.plugins[0].name).toBe("pre-plugin");
    expect(container.plugins[1].name).toBe("normal-plugin");
    expect(container.plugins[2].name).toBe("post-plugin");
  });

  it("preserves relative order within the same enforce tier", () => {
    const plugins: VaisXPlugin[] = [
      { name: "pre-a", enforce: "pre" },
      { name: "pre-b", enforce: "pre" },
      { name: "normal-a" },
      { name: "normal-b" },
      { name: "post-a", enforce: "post" },
      { name: "post-b", enforce: "post" },
    ];

    const container = new PluginContainer(plugins);
    const names = container.plugins.map((p) => p.name);

    expect(names).toEqual(["pre-a", "pre-b", "normal-a", "normal-b", "post-a", "post-b"]);
  });

  it("works with only pre plugins", () => {
    const plugins: VaisXPlugin[] = [
      { name: "pre-a", enforce: "pre" },
      { name: "pre-b", enforce: "pre" },
    ];
    const container = new PluginContainer(plugins);
    expect(container.plugins.map((p) => p.name)).toEqual(["pre-a", "pre-b"]);
  });

  it("works with only post plugins", () => {
    const plugins: VaisXPlugin[] = [
      { name: "post-a", enforce: "post" },
      { name: "post-b", enforce: "post" },
    ];
    const container = new PluginContainer(plugins);
    expect(container.plugins.map((p) => p.name)).toEqual(["post-a", "post-b"]);
  });

  it("works with empty plugin list", () => {
    const container = new PluginContainer([]);
    expect(container.plugins).toHaveLength(0);
  });
});

// ── resolveId tests ────────────────────────────────────────────────────────

describe("PluginContainer - resolveId", () => {
  it("returns first non-null result", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "first",
        resolveId(source) {
          if (source === "foo") return "/resolved/foo.js";
          return null;
        },
      },
      {
        name: "second",
        resolveId() {
          return "/resolved/fallback.js";
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const result = await container.resolveId("foo");

    expect(result).toBe("/resolved/foo.js");
  });

  it("skips plugins that return null and falls through to next", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "skip",
        resolveId() {
          return null;
        },
      },
      {
        name: "resolve",
        resolveId(source) {
          return `/resolved/${source}`;
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const result = await container.resolveId("bar");

    expect(result).toBe("/resolved/bar");
  });

  it("returns null when no plugin resolves", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "no-op",
        resolveId() {
          return null;
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const result = await container.resolveId("unknown");

    expect(result).toBeNull();
  });

  it("passes importer to resolveId", async () => {
    const resolveIdFn = vi.fn().mockReturnValue(null);
    const plugins: VaisXPlugin[] = [{ name: "spy", resolveId: resolveIdFn }];

    const container = new PluginContainer(plugins);
    await container.resolveId("./dep", "/project/main.ts");

    expect(resolveIdFn).toHaveBeenCalledWith("./dep", "/project/main.ts");
  });

  it("respects enforce order for resolveId", async () => {
    const order: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "post",
        enforce: "post",
        resolveId() {
          order.push("post");
          return null;
        },
      },
      {
        name: "pre",
        enforce: "pre",
        resolveId() {
          order.push("pre");
          return null;
        },
      },
      {
        name: "normal",
        resolveId() {
          order.push("normal");
          return null;
        },
      },
    ];

    const container = new PluginContainer(plugins);
    await container.resolveId("test");

    expect(order).toEqual(["pre", "normal", "post"]);
  });

  it("supports object result from resolveId", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "object-result",
        resolveId() {
          return { id: "/resolved/id.js", external: false };
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const result = await container.resolveId("foo");

    expect(result).toEqual({ id: "/resolved/id.js", external: false });
  });
});

// ── load tests ────────────────────────────────────────────────────────────

describe("PluginContainer - load", () => {
  it("returns first non-null result", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "first",
        load(id) {
          if (id === "/special.js") return "export const x = 1;";
          return null;
        },
      },
      {
        name: "second",
        load() {
          return "fallback code";
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const result = await container.load("/special.js");

    expect(result).toBe("export const x = 1;");
  });

  it("returns null when no plugin handles load", async () => {
    const container = new PluginContainer([{ name: "empty" }]);
    const result = await container.load("/unknown.js");

    expect(result).toBeNull();
  });
});

// ── transform chain tests ──────────────────────────────────────────────────

describe("PluginContainer - transform chain", () => {
  it("chains transform output as input to next plugin", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "step-1",
        transform(code) {
          return code + " // step1";
        },
      },
      {
        name: "step-2",
        transform(code) {
          return code + " // step2";
        },
      },
      {
        name: "step-3",
        transform(code) {
          return code + " // step3";
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const result = await container.transform("const x = 1;", "file.js");

    expect(result).not.toBeNull();
    expect((result as { code: string }).code).toBe(
      "const x = 1; // step1 // step2 // step3"
    );
  });

  it("skips plugins that return null in the chain", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "active",
        transform(code) {
          return code.replace("foo", "bar");
        },
      },
      {
        name: "skip",
        transform() {
          return null;
        },
      },
      {
        name: "active-2",
        transform(code) {
          return code + " // done";
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const result = await container.transform("foo()", "file.js");

    expect(result).not.toBeNull();
    expect((result as { code: string }).code).toBe("bar() // done");
  });

  it("returns null when no plugin transforms", async () => {
    const container = new PluginContainer([{ name: "no-transform" }]);
    const result = await container.transform("const x = 1;", "file.js");

    expect(result).toBeNull();
  });

  it("supports object result with map from transform", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "with-map",
        transform(code) {
          return { code: code + " // mapped", map: "{}", meta: { custom: true } };
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const result = await container.transform("const x = 1;", "file.js");

    expect(result).toEqual({
      code: "const x = 1; // mapped",
      map: "{}",
      meta: { custom: true },
    });
  });

  it("respects enforce order in transform chain", async () => {
    const order: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "post",
        enforce: "post",
        transform(code) {
          order.push("post");
          return code;
        },
      },
      {
        name: "pre",
        enforce: "pre",
        transform(code) {
          order.push("pre");
          return code;
        },
      },
      {
        name: "normal",
        transform(code) {
          order.push("normal");
          return code;
        },
      },
    ];

    const container = new PluginContainer(plugins);
    await container.transform("code", "file.js");

    expect(order).toEqual(["pre", "normal", "post"]);
  });
});

// ── buildStart / buildEnd tests ────────────────────────────────────────────

describe("PluginContainer - buildStart / buildEnd", () => {
  it("calls buildStart on all plugins", async () => {
    const calls: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "a",
        buildStart() {
          calls.push("a");
        },
      },
      {
        name: "b",
        buildStart() {
          calls.push("b");
        },
      },
      {
        name: "c",
        buildStart() {
          calls.push("c");
        },
      },
    ];

    const container = new PluginContainer(plugins);
    await container.buildStart();

    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("calls buildEnd on all plugins", async () => {
    const calls: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "a",
        buildEnd() {
          calls.push("a");
        },
      },
      {
        name: "b",
        buildEnd() {
          calls.push("b");
        },
      },
    ];

    const container = new PluginContainer(plugins);
    await container.buildEnd();

    expect(calls).toEqual(["a", "b"]);
  });

  it("passes error to buildEnd", async () => {
    const receivedErrors: (Error | undefined)[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "spy",
        buildEnd(error) {
          receivedErrors.push(error);
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const err = new Error("build failed");
    await container.buildEnd(err);

    expect(receivedErrors[0]).toBe(err);
  });

  it("skips plugins without buildStart hook", async () => {
    const called = vi.fn();

    const plugins: VaisXPlugin[] = [
      { name: "no-hook" },
      {
        name: "with-hook",
        buildStart: called,
      },
    ];

    const container = new PluginContainer(plugins);
    await container.buildStart();

    expect(called).toHaveBeenCalledOnce();
  });

  it("calls buildStart/buildEnd in enforce order", async () => {
    const startOrder: string[] = [];
    const endOrder: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "post",
        enforce: "post",
        buildStart() {
          startOrder.push("post");
        },
        buildEnd() {
          endOrder.push("post");
        },
      },
      {
        name: "pre",
        enforce: "pre",
        buildStart() {
          startOrder.push("pre");
        },
        buildEnd() {
          endOrder.push("pre");
        },
      },
      {
        name: "normal",
        buildStart() {
          startOrder.push("normal");
        },
        buildEnd() {
          endOrder.push("normal");
        },
      },
    ];

    const container = new PluginContainer(plugins);
    await container.buildStart();
    await container.buildEnd();

    expect(startOrder).toEqual(["pre", "normal", "post"]);
    expect(endOrder).toEqual(["pre", "normal", "post"]);
  });

  it("awaits async buildStart hooks", async () => {
    const log: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "async-a",
        async buildStart() {
          await Promise.resolve();
          log.push("a");
        },
      },
      {
        name: "sync-b",
        buildStart() {
          log.push("b");
        },
      },
    ];

    const container = new PluginContainer(plugins);
    await container.buildStart();

    expect(log).toEqual(["a", "b"]);
  });
});
