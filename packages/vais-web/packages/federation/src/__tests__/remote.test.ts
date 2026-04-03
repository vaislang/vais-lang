/**
 * @vaisx/federation — remote module loading tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  semverSatisfies,
  loadRemoteModule,
  clearModuleCache,
  createSharedDependencyManager,
  createRemoteContainer,
  createRemoteLoader,
} from "../remote.js";
import type { RemoteConfig } from "../types.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

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

// ─── semverSatisfies ─────────────────────────────────────────────────────────

describe("semverSatisfies — exact match", () => {
  it("returns true for identical versions", () => {
    expect(semverSatisfies("1.2.3", "1.2.3")).toBe(true);
  });

  it("returns false when versions differ", () => {
    expect(semverSatisfies("1.2.4", "1.2.3")).toBe(false);
  });

  it("returns false when major differs", () => {
    expect(semverSatisfies("2.0.0", "1.0.0")).toBe(false);
  });
});

describe("semverSatisfies — caret (^) range", () => {
  it("same version satisfies ^ range", () => {
    expect(semverSatisfies("18.2.0", "^18.0.0")).toBe(true);
  });

  it("higher minor satisfies ^", () => {
    expect(semverSatisfies("18.3.0", "^18.0.0")).toBe(true);
  });

  it("higher patch satisfies ^", () => {
    expect(semverSatisfies("18.0.1", "^18.0.0")).toBe(true);
  });

  it("different major does NOT satisfy ^", () => {
    expect(semverSatisfies("19.0.0", "^18.0.0")).toBe(false);
  });

  it("lower minor does NOT satisfy ^", () => {
    expect(semverSatisfies("18.0.0", "^18.1.0")).toBe(false);
  });

  it("lower major does NOT satisfy ^", () => {
    expect(semverSatisfies("17.9.9", "^18.0.0")).toBe(false);
  });
});

describe("semverSatisfies — tilde (~) range", () => {
  it("same version satisfies ~ range", () => {
    expect(semverSatisfies("4.17.21", "~4.17.0")).toBe(true);
  });

  it("higher patch satisfies ~", () => {
    expect(semverSatisfies("4.17.5", "~4.17.0")).toBe(true);
  });

  it("different minor does NOT satisfy ~", () => {
    expect(semverSatisfies("4.18.0", "~4.17.0")).toBe(false);
  });

  it("different major does NOT satisfy ~", () => {
    expect(semverSatisfies("5.0.0", "~4.17.0")).toBe(false);
  });

  it("lower patch does NOT satisfy ~", () => {
    expect(semverSatisfies("4.17.0", "~4.17.1")).toBe(false);
  });
});

// ─── loadRemoteModule ────────────────────────────────────────────────────────

describe("loadRemoteModule", () => {
  beforeEach(() => {
    clearModuleCache();
  });

  it("resolves with an exports object", async () => {
    const exports = await loadRemoteModule(shopRemote, "./Cart");
    expect(typeof exports).toBe("object");
    expect(exports).not.toBeNull();
  });

  it("exports contain provenance metadata", async () => {
    const exports = await loadRemoteModule(shopRemote, "./Cart");
    expect(exports.__remote).toBe("shop");
    expect(exports.__module).toBe("./Cart");
  });

  it("exports contain a resolved module URL", async () => {
    const exports = await loadRemoteModule(shopRemote, "./Cart");
    expect(typeof exports.__url).toBe("string");
    expect((exports.__url as string).startsWith("https://shop.example.com")).toBe(true);
  });

  it("caches the module — second call returns the same reference", async () => {
    const first = await loadRemoteModule(shopRemote, "./Cart");
    const second = await loadRemoteModule(shopRemote, "./Cart");
    expect(first).toBe(second);
  });

  it("different modules are cached independently", async () => {
    const cart = await loadRemoteModule(shopRemote, "./Cart");
    const product = await loadRemoteModule(shopRemote, "./ProductList");
    expect(cart).not.toBe(product);
    expect(cart.__module).toBe("./Cart");
    expect(product.__module).toBe("./ProductList");
  });

  it("throws when the module path is not exposed by the remote", async () => {
    await expect(loadRemoteModule(shopRemote, "./Nonexistent")).rejects.toThrow(
      /does not expose module "\.\/Nonexistent"/,
    );
  });

  it("clearModuleCache forces a fresh load", async () => {
    const first = await loadRemoteModule(shopRemote, "./Cart");
    clearModuleCache();
    const second = await loadRemoteModule(shopRemote, "./Cart");
    // Both are equivalent objects but different references after cache clear.
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

// ─── SharedDependencyManager ─────────────────────────────────────────────────

describe("SharedDependencyManager — register / resolve", () => {
  it("resolves a registered dependency without a version range", () => {
    const mgr = createSharedDependencyManager();
    const mod = { version: "18.2.0" };
    mgr.register("react", "18.2.0", mod);
    expect(mgr.resolve("react")).toBe(mod);
  });

  it("resolves when version satisfies ^ range", () => {
    const mgr = createSharedDependencyManager();
    const mod = {};
    mgr.register("react", "18.2.0", mod);
    expect(mgr.resolve("react", "^18.0.0")).toBe(mod);
  });

  it("returns undefined when version does NOT satisfy range", () => {
    const mgr = createSharedDependencyManager();
    mgr.register("react", "17.0.0", {});
    expect(mgr.resolve("react", "^18.0.0")).toBeUndefined();
  });

  it("returns undefined for an unregistered package", () => {
    const mgr = createSharedDependencyManager();
    expect(mgr.resolve("unknown-pkg")).toBeUndefined();
  });

  it("resolves satisfying version when multiple versions are registered", () => {
    const mgr = createSharedDependencyManager();
    const v17 = { v: 17 };
    const v18 = { v: 18 };
    mgr.register("react", "17.0.0", v17);
    mgr.register("react", "18.2.0", v18);
    expect(mgr.resolve("react", "^18.0.0")).toBe(v18);
    expect(mgr.resolve("react", "^17.0.0")).toBe(v17);
  });

  it("re-registering the same version replaces the entry", () => {
    const mgr = createSharedDependencyManager();
    const old = { version: "old" };
    const newer = { version: "newer" };
    mgr.register("react", "18.2.0", old);
    mgr.register("react", "18.2.0", newer);
    expect(mgr.resolve("react")).toBe(newer);
    expect(mgr.getVersions("react")).toHaveLength(1);
  });
});

describe("SharedDependencyManager — getVersions", () => {
  it("returns all registered versions in order", () => {
    const mgr = createSharedDependencyManager();
    mgr.register("lodash", "4.17.20", {});
    mgr.register("lodash", "4.17.21", {});
    expect(mgr.getVersions("lodash")).toEqual(["4.17.20", "4.17.21"]);
  });

  it("returns an empty array for unknown packages", () => {
    const mgr = createSharedDependencyManager();
    expect(mgr.getVersions("unknown")).toEqual([]);
  });
});

describe("SharedDependencyManager — getSingleton", () => {
  it("returns the singleton instance", () => {
    const mgr = createSharedDependencyManager();
    const mod = { singleton: true };
    mgr.register("react", "18.2.0", mod, { singleton: true });
    expect(mgr.getSingleton("react")).toBe(mod);
  });

  it("returns undefined when no singleton is registered", () => {
    const mgr = createSharedDependencyManager();
    mgr.register("lodash", "4.17.21", {});
    expect(mgr.getSingleton("lodash")).toBeUndefined();
  });

  it("returns undefined for an unknown package", () => {
    const mgr = createSharedDependencyManager();
    expect(mgr.getSingleton("nonexistent")).toBeUndefined();
  });
});

// ─── RemoteContainer ──────────────────────────────────────────────────────────

describe("RemoteContainer", () => {
  it("exposes the remote name", () => {
    const container = createRemoteContainer(shopRemote);
    expect(container.name).toBe("shop");
  });

  it("get returns a factory function", () => {
    const container = createRemoteContainer(shopRemote);
    const factory = container.get("./Cart");
    expect(typeof factory).toBe("function");
  });

  it("factory resolves with module exports", async () => {
    const container = createRemoteContainer(shopRemote);
    const factory = container.get("./Cart");
    const exports = await factory();
    expect(exports.__remote).toBe("shop");
    expect(exports.__module).toBe("./Cart");
  });

  it("factory caches the result — repeated calls return same reference", async () => {
    const container = createRemoteContainer(shopRemote);
    const factory = container.get("./Cart");
    const first = await factory();
    const second = await factory();
    expect(first).toBe(second);
  });

  it("init passes shared scope into loaded modules", async () => {
    const container = createRemoteContainer(shopRemote);
    const reactMod = { version: "18.2.0" };
    container.init({ react: reactMod });
    const factory = container.get("./Cart");
    const exports = await factory();
    expect((exports.__shared as Record<string, unknown>)["react"]).toBe(reactMod);
  });

  it("throws when the module path is not exposed", () => {
    const container = createRemoteContainer(shopRemote);
    expect(() => container.get("./Nonexistent")).toThrow(
      /does not expose module "\.\/Nonexistent"/,
    );
  });
});

// ─── createRemoteLoader ───────────────────────────────────────────────────────

describe("createRemoteLoader", () => {
  it("exposes the host URL", () => {
    const loader = createRemoteLoader("https://shell.example.com");
    expect(loader.host).toBe("https://shell.example.com");
  });

  it("load resolves with module exports", async () => {
    const loader = createRemoteLoader("https://shell.example.com");
    const exports = await loader.load(shopRemote, "./Cart");
    expect(exports.__remote).toBe("shop");
    expect(exports.__module).toBe("./Cart");
  });

  it("load caches results — second call returns same reference", async () => {
    const loader = createRemoteLoader("https://shell.example.com");
    const first = await loader.load(shopRemote, "./Cart");
    const second = await loader.load(shopRemote, "./Cart");
    expect(first).toBe(second);
  });

  it("load throws for unexposed module paths", async () => {
    const loader = createRemoteLoader("https://shell.example.com");
    await expect(loader.load(shopRemote, "./Missing")).rejects.toThrow(
      /does not expose module "\.\/Missing"/,
    );
  });

  it("preload pre-warms the manifest cache", async () => {
    const loader = createRemoteLoader("https://shell.example.com");
    await loader.preload(shopRemote);
    // Subsequent load should succeed without errors (manifest already cached).
    const exports = await loader.load(shopRemote, "./Checkout");
    expect(exports.__module).toBe("./Checkout");
  });

  it("invalidate removes cached entries for a remote", async () => {
    const loader = createRemoteLoader("https://shell.example.com");
    const first = await loader.load(shopRemote, "./Cart");
    loader.invalidate("shop");
    const second = await loader.load(shopRemote, "./Cart");
    // Different references after invalidation.
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it("invalidate does not affect other remotes", async () => {
    const loader = createRemoteLoader("https://shell.example.com");
    const auth = await loader.load(authRemote, "./Login");
    loader.invalidate("shop");
    const authAgain = await loader.load(authRemote, "./Login");
    expect(auth).toBe(authAgain);
  });

  it("two loaders with different hosts maintain independent caches", async () => {
    const loaderA = createRemoteLoader("https://shell-a.example.com");
    const loaderB = createRemoteLoader("https://shell-b.example.com");
    const a = await loaderA.load(shopRemote, "./Cart");
    const b = await loaderB.load(shopRemote, "./Cart");
    // Independent caches — not the same object reference.
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
