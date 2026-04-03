import { describe, it, expect, vi } from "vitest";
import { PluginContainer } from "../src/container.js";
import { DevServerHooks } from "../src/server-hooks.js";
import type { DevServer, HotUpdateContext } from "../src/server-hooks.js";
import type { VaisXPlugin } from "../src/types.js";

/**
 * Helper to create a minimal DevServer mock.
 */
function createMockServer(): DevServer & { middlewares: Array<(req: unknown, res: unknown, next: () => void) => void> } {
  return {
    middlewares: [],
    ws: {
      send: vi.fn(),
    },
  };
}

// ── configureServer tests ──────────────────────────────────────────────────

describe("DevServerHooks - configureServer", () => {
  it("calls configureServer on all plugins", async () => {
    const calls: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "plugin-a",
        configureServer() {
          calls.push("a");
        },
      },
      {
        name: "plugin-b",
        configureServer() {
          calls.push("b");
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const server = createMockServer();

    await hooks.configureServer(server);

    expect(calls).toEqual(["a", "b"]);
  });

  it("adds middleware to server.middlewares when plugin pushes to it", async () => {
    const middleware = vi.fn();

    const plugins: VaisXPlugin[] = [
      {
        name: "middleware-plugin",
        configureServer(server: any) {
          server.middlewares.push(middleware);
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const server = createMockServer();

    await hooks.configureServer(server);

    expect(server.middlewares).toHaveLength(1);
    expect(server.middlewares[0]).toBe(middleware);
  });

  it("executes post-hooks after all plugins are configured", async () => {
    const order: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "plugin-a",
        configureServer() {
          order.push("configure-a");
          return () => {
            order.push("post-a");
          };
        },
      },
      {
        name: "plugin-b",
        configureServer() {
          order.push("configure-b");
          return () => {
            order.push("post-b");
          };
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const server = createMockServer();

    await hooks.configureServer(server);

    // All configure hooks run first, then all post hooks
    expect(order).toEqual(["configure-a", "configure-b", "post-a", "post-b"]);
  });

  it("only collects post-hooks from plugins that return a function", async () => {
    const postHookCalled = vi.fn();
    const order: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "no-post",
        configureServer() {
          order.push("no-post");
          // returns void
        },
      },
      {
        name: "with-post",
        configureServer() {
          order.push("with-post");
          return postHookCalled;
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const server = createMockServer();

    await hooks.configureServer(server);

    expect(order).toEqual(["no-post", "with-post"]);
    expect(postHookCalled).toHaveBeenCalledOnce();
  });

  it("awaits async configureServer hooks", async () => {
    const log: string[] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "async-plugin",
        async configureServer() {
          await Promise.resolve();
          log.push("async-done");
        },
      },
      {
        name: "sync-plugin",
        configureServer() {
          log.push("sync-done");
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const server = createMockServer();

    await hooks.configureServer(server);

    expect(log).toEqual(["async-done", "sync-done"]);
  });

  it("works with no plugins", async () => {
    const container = new PluginContainer([]);
    const hooks = new DevServerHooks(container);
    const server = createMockServer();

    await expect(hooks.configureServer(server)).resolves.toBeUndefined();
    expect(server.middlewares).toHaveLength(0);
  });
});

// ── handleHotUpdate tests ──────────────────────────────────────────────────

describe("DevServerHooks - handleHotUpdate", () => {
  function makeCtx(modules: string[]): HotUpdateContext {
    return {
      file: "/src/app.ts",
      timestamp: Date.now(),
      modules,
    };
  }

  it("returns original modules when no plugin has handleHotUpdate", async () => {
    const plugins: VaisXPlugin[] = [{ name: "no-hmr" }];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const ctx = makeCtx(["/src/a.ts", "/src/b.ts"]);

    const result = await hooks.handleHotUpdate(ctx);

    expect(result).toEqual(["/src/a.ts", "/src/b.ts"]);
  });

  it("returns original modules when plugin returns void", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "void-hmr",
        handleHotUpdate() {
          // returns void
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const ctx = makeCtx(["/src/a.ts"]);

    const result = await hooks.handleHotUpdate(ctx);

    expect(result).toEqual(["/src/a.ts"]);
  });

  it("filters modules when plugin returns an array", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "filter-plugin",
        handleHotUpdate(ctx: any) {
          return ctx.modules.filter((m: string) => m.endsWith(".ts"));
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const ctx = makeCtx(["/src/a.ts", "/src/b.css", "/src/c.ts"]);

    const result = await hooks.handleHotUpdate(ctx);

    expect(result).toEqual(["/src/a.ts", "/src/c.ts"]);
  });

  it("chains multiple plugins — each receives updated modules", async () => {
    const receivedModules: string[][] = [];

    const plugins: VaisXPlugin[] = [
      {
        name: "plugin-a",
        handleHotUpdate(ctx: any) {
          receivedModules.push([...ctx.modules]);
          return ctx.modules.filter((m: string) => !m.includes("skip"));
        },
      },
      {
        name: "plugin-b",
        handleHotUpdate(ctx: any) {
          receivedModules.push([...ctx.modules]);
          return ctx.modules.map((m: string) => m + "?v=1");
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const ctx = makeCtx(["/src/a.ts", "/src/skip-me.ts", "/src/c.ts"]);

    const result = await hooks.handleHotUpdate(ctx);

    // plugin-a received the original modules
    expect(receivedModules[0]).toEqual(["/src/a.ts", "/src/skip-me.ts", "/src/c.ts"]);
    // plugin-b received the filtered modules from plugin-a
    expect(receivedModules[1]).toEqual(["/src/a.ts", "/src/c.ts"]);
    // final result has the version suffix from plugin-b
    expect(result).toEqual(["/src/a.ts?v=1", "/src/c.ts?v=1"]);
  });

  it("awaits async handleHotUpdate hooks", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "async-hmr",
        async handleHotUpdate(ctx: any) {
          await Promise.resolve();
          return ctx.modules.slice(0, 1);
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const ctx = makeCtx(["/src/a.ts", "/src/b.ts"]);

    const result = await hooks.handleHotUpdate(ctx);

    expect(result).toEqual(["/src/a.ts"]);
  });

  it("works with empty modules list", async () => {
    const plugins: VaisXPlugin[] = [
      {
        name: "hmr-plugin",
        handleHotUpdate(ctx: any) {
          return ctx.modules;
        },
      },
    ];

    const container = new PluginContainer(plugins);
    const hooks = new DevServerHooks(container);
    const ctx = makeCtx([]);

    const result = await hooks.handleHotUpdate(ctx);

    expect(result).toEqual([]);
  });
});
