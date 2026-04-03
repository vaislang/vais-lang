/**
 * @vaisx/federation — FederationHost tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFederationHost } from "../src/host.js";
import type { FederationConfig, RemoteConfig } from "../src/types.js";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const shopRemote: RemoteConfig = {
  name: "shop",
  url: "https://shop.example.com",
  modules: ["./Cart", "./ProductList", "./Checkout"],
};

const authRemote: RemoteConfig = {
  name: "auth",
  url: "https://auth.example.com",
  modules: ["./Login", "./Register"],
};

const baseConfig: FederationConfig = {
  name: "shell",
  remotes: [shopRemote, authRemote],
  shared: {
    react: { singleton: true, requiredVersion: "^18.0.0", eager: true },
    "react-dom": { singleton: true, requiredVersion: "^18.0.0" },
    lodash: { singleton: false, requiredVersion: "^4.0.0" },
  },
};

function createHost(config: FederationConfig = baseConfig) {
  return createFederationHost(config);
}

// ─── createFederationHost ─────────────────────────────────────────────────

describe("createFederationHost — initialisation", () => {
  it("exposes the host name from config", () => {
    const host = createHost();
    expect(host.name).toBe("shell");
  });

  it("pre-populates the remote registry from config", () => {
    const host = createHost();
    expect(host.remotes.size).toBe(2);
    expect(host.remotes.has("shop")).toBe(true);
    expect(host.remotes.has("auth")).toBe(true);
  });

  it("remote config in registry matches the supplied config", () => {
    const host = createHost();
    const shop = host.remotes.get("shop");
    expect(shop).toEqual(shopRemote);
  });

  it("starts with an empty module cache", () => {
    const host = createHost();
    expect(host.moduleCache.size).toBe(0);
  });

  it("exposes an events bus", () => {
    const host = createHost();
    expect(typeof host.events.on).toBe("function");
    expect(typeof host.events.emit).toBe("function");
  });

  it("creates a host with no remotes when config.remotes is empty", () => {
    const host = createHost({ name: "empty", remotes: [], shared: {} });
    expect(host.remotes.size).toBe(0);
  });
});

// ─── registerRemote ───────────────────────────────────────────────────────

describe("FederationHost — registerRemote", () => {
  let host: ReturnType<typeof createHost>;
  beforeEach(() => {
    host = createHost({ name: "shell", remotes: [], shared: {} });
  });

  it("adds a remote to the registry", () => {
    host.registerRemote(shopRemote);
    expect(host.remotes.has("shop")).toBe(true);
  });

  it("registered remote can be retrieved with correct config", () => {
    host.registerRemote(shopRemote);
    expect(host.remotes.get("shop")).toEqual(shopRemote);
  });

  it("emits 'remote:registered' event with the remote config", () => {
    const handler = vi.fn();
    host.events.on("remote:registered", handler);
    host.registerRemote(shopRemote);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(shopRemote);
  });

  it("overwriting an existing remote updates the registry entry", () => {
    host.registerRemote(shopRemote);
    const updated = { ...shopRemote, url: "https://shop-v2.example.com" };
    host.registerRemote(updated);
    expect(host.remotes.get("shop")?.url).toBe("https://shop-v2.example.com");
  });

  it("multiple remotes can be registered sequentially", () => {
    host.registerRemote(shopRemote);
    host.registerRemote(authRemote);
    expect(host.remotes.size).toBe(2);
  });
});

// ─── getShared ────────────────────────────────────────────────────────────

describe("FederationHost — getShared", () => {
  let host: ReturnType<typeof createHost>;
  beforeEach(() => {
    host = createHost();
  });

  it("returns the config for a registered shared dependency", () => {
    const config = host.getShared("react");
    expect(config).toEqual({ singleton: true, requiredVersion: "^18.0.0", eager: true });
  });

  it("returns undefined for an unknown dependency", () => {
    expect(host.getShared("unknown-pkg")).toBeUndefined();
  });

  it("returns a copy — mutating it does not affect the registry", () => {
    const config = host.getShared("react");
    if (config) config.singleton = false;
    expect(host.getShared("react")?.singleton).toBe(true);
  });

  it("emits 'shared:resolved' when a dependency is found", () => {
    const handler = vi.fn();
    host.events.on("shared:resolved", handler);
    host.getShared("lodash");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      name: "lodash",
      config: { singleton: false, requiredVersion: "^4.0.0" },
    });
  });

  it("does NOT emit 'shared:resolved' for unknown dependencies", () => {
    const handler = vi.fn();
    host.events.on("shared:resolved", handler);
    host.getShared("nonexistent");
    expect(handler).not.toHaveBeenCalled();
  });
});

// ─── loadRemote ───────────────────────────────────────────────────────────

describe("FederationHost — loadRemote (success)", () => {
  let host: ReturnType<typeof createHost>;
  beforeEach(() => {
    host = createHost();
  });

  it("resolves with a module exports object", async () => {
    const exports = await host.loadRemote("shop", "./Cart");
    expect(exports).toBeDefined();
    expect(typeof exports).toBe("object");
  });

  it("resolved exports contain provenance metadata", async () => {
    const exports = await host.loadRemote("shop", "./Cart");
    expect(exports.__remote).toBe("shop");
    expect(exports.__module).toBe("./Cart");
    expect(exports.__url).toBe("https://shop.example.com");
  });

  it("caches the module after the first load", async () => {
    await host.loadRemote("shop", "./Cart");
    expect(host.moduleCache.has("shop/./Cart")).toBe(true);
  });

  it("returns the cached result on subsequent loads (same object reference)", async () => {
    const first = await host.loadRemote("shop", "./Cart");
    const second = await host.loadRemote("shop", "./Cart");
    expect(first).toBe(second);
  });

  it("emits 'remote:loading' before resolution", async () => {
    const handler = vi.fn();
    host.events.on("remote:loading", handler);
    await host.loadRemote("shop", "./Cart");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: "shop", modulePath: "./Cart" }),
    );
  });

  it("emits 'remote:loaded' after successful resolution", async () => {
    const handler = vi.fn();
    host.events.on("remote:loaded", handler);
    await host.loadRemote("shop", "./Cart");
    expect(handler).toHaveBeenCalledOnce();
    const payload = handler.mock.calls[0][0];
    expect(payload.name).toBe("shop");
    expect(payload.loaded).toBe(true);
  });

  it("different modules from the same remote are cached separately", async () => {
    await host.loadRemote("shop", "./Cart");
    await host.loadRemote("shop", "./ProductList");
    expect(host.moduleCache.size).toBe(2);
  });

  it("same module path from different remotes are cached separately", async () => {
    host.registerRemote({ name: "other", url: "https://other.example.com", modules: ["./Cart"] });
    await host.loadRemote("shop", "./Cart");
    await host.loadRemote("other", "./Cart");
    expect(host.moduleCache.size).toBe(2);
  });
});

// ─── loadRemote errors ────────────────────────────────────────────────────

describe("FederationHost — loadRemote (errors)", () => {
  let host: ReturnType<typeof createHost>;
  beforeEach(() => {
    host = createHost();
  });

  it("throws when the remote name is not registered", async () => {
    await expect(host.loadRemote("unknown-remote", "./Foo")).rejects.toThrow(
      /unknown remote "unknown-remote"/,
    );
  });

  it("throws when the module path is not declared by the remote", async () => {
    await expect(host.loadRemote("shop", "./Nonexistent")).rejects.toThrow(
      /does not expose module "\.\/Nonexistent"/,
    );
  });

  it("emits 'remote:error' when the remote is unknown", async () => {
    const handler = vi.fn();
    host.events.on("remote:error", handler);
    await host.loadRemote("ghost", "./Foo").catch(() => {});
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].name).toBe("ghost");
  });

  it("emits 'remote:error' when the module is not exposed", async () => {
    const handler = vi.fn();
    host.events.on("remote:error", handler);
    await host.loadRemote("shop", "./Undeclared").catch(() => {});
    expect(handler).toHaveBeenCalledOnce();
  });

  it("a remote registered at runtime can be loaded successfully", async () => {
    host.registerRemote({ name: "newRemote", url: "https://new.example.com", modules: ["./Foo"] });
    const exports = await host.loadRemote("newRemote", "./Foo");
    expect(exports.__remote).toBe("newRemote");
  });
});
