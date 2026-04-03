/**
 * @vaisx/federation — federated router tests
 *
 * Covers:
 *  - createFederatedRouter: addRoute, removeRoute, resolve, loadRoute, generateManifest
 *  - matchRoute: static, dynamic (:param), catch-all (*wildcard) patterns
 *  - RouteManifest: serialization and parsing
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createFederatedRouter,
  matchRoute,
  serializeManifest,
  parseManifest,
} from "../router.js";
import type {
  FederatedRouteConfig,
  RouteManifest,
} from "../router.js";
import type { RemoteConfig } from "../types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const shopRemote: RemoteConfig = {
  name: "shop",
  url: "https://shop.example.com",
  modules: ["./App", "./Cart", "./Product"],
};

const authRemote: RemoteConfig = {
  name: "auth",
  url: "https://auth.example.com",
  modules: ["./Login", "./Register", "./Profile"],
};

const docsRemote: RemoteConfig = {
  name: "docs",
  url: "https://docs.example.com",
  modules: ["./Page", "./Sidebar"],
};

const shopRoute: FederatedRouteConfig = {
  path: "/shop",
  remote: shopRemote,
  module: "./App",
};

const shopProductRoute: FederatedRouteConfig = {
  path: "/shop/:id",
  remote: shopRemote,
  module: "./Product",
};

const authLoginRoute: FederatedRouteConfig = {
  path: "/auth/login",
  remote: authRemote,
  module: "./Login",
};

const docsRoute: FederatedRouteConfig = {
  path: "/docs/*rest",
  remote: docsRemote,
  module: "./Page",
};

// ─── matchRoute — static segments ─────────────────────────────────────────────

describe("matchRoute — static segments", () => {
  const routes = [shopRoute, authLoginRoute];

  it("1. matches an exact static path", () => {
    const result = matchRoute(routes, "/shop");
    expect(result).not.toBeNull();
    expect(result!.route.path).toBe("/shop");
  });

  it("2. matches a deeper static path", () => {
    const result = matchRoute(routes, "/auth/login");
    expect(result).not.toBeNull();
    expect(result!.route.path).toBe("/auth/login");
  });

  it("3. returns null when no route matches", () => {
    expect(matchRoute(routes, "/not-found")).toBeNull();
  });

  it("4. match result carries the original URL", () => {
    const result = matchRoute(routes, "/shop");
    expect(result!.url).toBe("/shop");
  });

  it("5. static match has empty params object", () => {
    const result = matchRoute(routes, "/shop");
    expect(result!.params).toEqual({});
  });

  it("6. first-match wins when multiple patterns could match", () => {
    const genericRoute: FederatedRouteConfig = {
      path: "/shop",
      remote: authRemote,
      module: "./Login",
    };
    const result = matchRoute([shopRoute, genericRoute], "/shop");
    expect(result!.route.remote.name).toBe("shop");
  });
});

// ─── matchRoute — dynamic parameters ─────────────────────────────────────────

describe("matchRoute — dynamic :param segments", () => {
  const routes = [shopProductRoute, shopRoute];

  it("7. matches a route with a single dynamic segment", () => {
    const result = matchRoute(routes, "/shop/42");
    expect(result).not.toBeNull();
    expect(result!.route.path).toBe("/shop/:id");
  });

  it("8. extracts the dynamic parameter value", () => {
    const result = matchRoute(routes, "/shop/42");
    expect(result!.params).toEqual({ id: "42" });
  });

  it("9. extracts a string slug as the parameter", () => {
    const result = matchRoute(routes, "/shop/amazing-product");
    expect(result!.params).toEqual({ id: "amazing-product" });
  });

  it("10. multiple dynamic segments are all extracted", () => {
    const multiRoute: FederatedRouteConfig = {
      path: "/org/:orgId/repo/:repoId",
      remote: shopRemote,
      module: "./App",
    };
    const result = matchRoute([multiRoute], "/org/acme/repo/web");
    expect(result!.params).toEqual({ orgId: "acme", repoId: "web" });
  });

  it("11. does not match when segment count differs", () => {
    const result = matchRoute([shopProductRoute], "/shop/42/extra");
    expect(result).toBeNull();
  });
});

// ─── matchRoute — catch-all wildcards ─────────────────────────────────────────

describe("matchRoute — catch-all *wildcard segments", () => {
  const routes = [docsRoute];

  it("12. matches a wildcard path capturing one segment", () => {
    const result = matchRoute(routes, "/docs/intro");
    expect(result).not.toBeNull();
    expect(result!.params).toEqual({ rest: "intro" });
  });

  it("13. catches multiple nested segments", () => {
    const result = matchRoute(routes, "/docs/guide/getting-started");
    expect(result!.params).toEqual({ rest: "guide/getting-started" });
  });

  it("14. matches root wildcard path (empty capture)", () => {
    const rootRoute: FederatedRouteConfig = {
      path: "/*all",
      remote: shopRemote,
      module: "./App",
    };
    const result = matchRoute([rootRoute], "/anything/goes/here");
    expect(result!.params).toEqual({ all: "anything/goes/here" });
  });
});

// ─── createFederatedRouter — addRoute / removeRoute ───────────────────────────

describe("createFederatedRouter — addRoute and removeRoute", () => {
  it("15. addRoute registers a route that can then be resolved", () => {
    const router = createFederatedRouter();
    router.addRoute(shopRoute);
    expect(router.resolve("/shop")).not.toBeNull();
  });

  it("16. removeRoute unregisters a route so it no longer resolves", () => {
    const router = createFederatedRouter({ routes: [shopRoute] });
    router.removeRoute("/shop");
    expect(router.resolve("/shop")).toBeNull();
  });

  it("17. addRoute with duplicate path replaces the existing entry", () => {
    const router = createFederatedRouter({ routes: [shopRoute] });
    const replacement: FederatedRouteConfig = {
      path: "/shop",
      remote: authRemote,
      module: "./Login",
    };
    router.addRoute(replacement);
    const result = router.resolve("/shop");
    expect(result!.route.remote.name).toBe("auth");
    expect(router.getRoutes()).toHaveLength(1);
  });

  it("18. removeRoute on unknown path is a no-op", () => {
    const router = createFederatedRouter({ routes: [shopRoute] });
    expect(() => router.removeRoute("/not-registered")).not.toThrow();
    expect(router.getRoutes()).toHaveLength(1);
  });

  it("19. getRoutes returns a copy — mutating it does not affect the router", () => {
    const router = createFederatedRouter({ routes: [shopRoute] });
    const snapshot = router.getRoutes();
    snapshot.push(authLoginRoute);
    expect(router.getRoutes()).toHaveLength(1);
  });
});

// ─── createFederatedRouter — resolve ─────────────────────────────────────────

describe("createFederatedRouter — resolve", () => {
  it("20. resolve returns null for an unregistered URL", () => {
    const router = createFederatedRouter({ routes: [shopRoute] });
    expect(router.resolve("/no-match")).toBeNull();
  });

  it("21. resolve strips query string before matching", () => {
    const router = createFederatedRouter({ routes: [shopRoute] });
    const result = router.resolve("/shop?ref=campaign");
    expect(result).not.toBeNull();
    expect(result!.route.path).toBe("/shop");
  });

  it("22. resolve handles absolute URLs by extracting pathname", () => {
    const router = createFederatedRouter({ routes: [shopRoute] });
    const result = router.resolve("https://shell.example.com/shop");
    expect(result).not.toBeNull();
    expect(result!.route.path).toBe("/shop");
  });

  it("23. resolve extracts params from dynamic URL", () => {
    const router = createFederatedRouter({ routes: [shopProductRoute] });
    const result = router.resolve("/shop/99");
    expect(result!.params).toEqual({ id: "99" });
  });
});

// ─── createFederatedRouter — loadRoute ────────────────────────────────────────

describe("createFederatedRouter — loadRoute", () => {
  it("24. loadRoute resolves with module exports", async () => {
    const router = createFederatedRouter({ routes: [shopRoute] });
    const loaded = await router.loadRoute("/shop");
    expect(loaded.exports).toBeDefined();
    expect(loaded.exports.__remote).toBe("shop");
    expect(loaded.exports.__module).toBe("./App");
  });

  it("25. loadRoute sets usedFallback to false on primary success", async () => {
    const router = createFederatedRouter({ routes: [shopRoute] });
    const loaded = await router.loadRoute("/shop");
    expect(loaded.usedFallback).toBe(false);
  });

  it("26. loadRoute throws when no route matches", async () => {
    const router = createFederatedRouter({ routes: [shopRoute] });
    await expect(router.loadRoute("/missing")).rejects.toThrow(
      'No route matched for URL: "/missing"',
    );
  });

  it("27. loadRoute uses fallback when primary module is not exposed", async () => {
    const fallbackRoute: FederatedRouteConfig = {
      path: "/shop/cart",
      remote: shopRemote,
      module: "./NonExistent",
      fallback: "./Cart",
    };
    const router = createFederatedRouter({ routes: [fallbackRoute] });
    const loaded = await router.loadRoute("/shop/cart");
    expect(loaded.usedFallback).toBe(true);
    expect(loaded.exports.__module).toBe("./Cart");
  });

  it("28. loadRoute throws when both primary and fallback modules fail", async () => {
    const badRoute: FederatedRouteConfig = {
      path: "/bad",
      remote: shopRemote,
      module: "./NonExistent",
      fallback: "./AlsoNonExistent",
    };
    const router = createFederatedRouter({ routes: [badRoute] });
    await expect(router.loadRoute("/bad")).rejects.toThrow();
  });

  it("29. loadRoute includes the RouteMatch in the result", async () => {
    const router = createFederatedRouter({ routes: [shopProductRoute] });
    const loaded = await router.loadRoute("/shop/777");
    expect(loaded.match.params).toEqual({ id: "777" });
    expect(loaded.match.route.path).toBe("/shop/:id");
  });
});

// ─── generateManifest & RouteManifest serialization ──────────────────────────

describe("generateManifest and RouteManifest serialization", () => {
  let router: ReturnType<typeof createFederatedRouter>;

  beforeEach(() => {
    router = createFederatedRouter({
      routes: [shopRoute, authLoginRoute, docsRoute],
    });
  });

  it("30. generateManifest returns a manifest with version '1.0.0'", () => {
    const manifest = router.generateManifest();
    expect(manifest.version).toBe("1.0.0");
  });

  it("31. manifest.routes length matches registered routes", () => {
    const manifest = router.generateManifest();
    expect(manifest.routes).toHaveLength(3);
  });

  it("32. manifest route entries contain path, remote, remoteUrl, and module", () => {
    const manifest = router.generateManifest();
    const shopEntry = manifest.routes.find((r) => r.path === "/shop");
    expect(shopEntry).toBeDefined();
    expect(shopEntry!.remote).toBe("shop");
    expect(shopEntry!.remoteUrl).toBe("https://shop.example.com");
    expect(shopEntry!.module).toBe("./App");
  });

  it("33. manifest includes fallback when configured", () => {
    const fallbackRoute: FederatedRouteConfig = {
      path: "/fallback",
      remote: shopRemote,
      module: "./App",
      fallback: "./Cart",
    };
    router.addRoute(fallbackRoute);
    const manifest = router.generateManifest();
    const entry = manifest.routes.find((r) => r.path === "/fallback");
    expect(entry!.fallback).toBe("./Cart");
  });

  it("34. manifest omits fallback field when not configured", () => {
    const manifest = router.generateManifest();
    const shopEntry = manifest.routes.find((r) => r.path === "/shop");
    expect(shopEntry!.fallback).toBeUndefined();
  });

  it("35. serializeManifest produces valid JSON that round-trips via parseManifest", () => {
    const manifest = router.generateManifest();
    const json = serializeManifest(manifest);
    const parsed = parseManifest(json);
    expect(parsed.version).toBe(manifest.version);
    expect(parsed.routes).toHaveLength(manifest.routes.length);
  });

  it("36. parseManifest throws on invalid JSON structure", () => {
    expect(() => parseManifest('{"version":"1.0.0"}')).toThrow(
      "Invalid RouteManifest",
    );
  });

  it("37. manifest generatedAt is a valid ISO date string", () => {
    const manifest = router.generateManifest();
    expect(() => new Date(manifest.generatedAt)).not.toThrow();
    expect(new Date(manifest.generatedAt).toISOString()).toBe(manifest.generatedAt);
  });
});

// ─── Integration: multiple remotes & route ordering ───────────────────────────

describe("Integration — multiple remotes and route ordering", () => {
  it("38. specific static path takes precedence over dynamic segment when registered first", () => {
    const specificRoute: FederatedRouteConfig = {
      path: "/shop/featured",
      remote: authRemote,
      module: "./Login",
    };
    const router = createFederatedRouter({
      routes: [specificRoute, shopProductRoute],
    });
    const result = router.resolve("/shop/featured");
    expect(result!.route.remote.name).toBe("auth");
  });

  it("39. router supports routing to three different remotes correctly", () => {
    const router = createFederatedRouter({
      routes: [shopRoute, authLoginRoute, docsRoute],
    });
    expect(router.resolve("/shop")!.route.remote.name).toBe("shop");
    expect(router.resolve("/auth/login")!.route.remote.name).toBe("auth");
    expect(router.resolve("/docs/overview")!.route.remote.name).toBe("docs");
  });

  it("40. dynamic and static routes coexist independently", () => {
    const router = createFederatedRouter({
      routes: [shopRoute, shopProductRoute],
    });
    const staticResult = router.resolve("/shop");
    const dynamicResult = router.resolve("/shop/123");
    expect(staticResult!.route.path).toBe("/shop");
    expect(dynamicResult!.route.path).toBe("/shop/:id");
    expect(dynamicResult!.params.id).toBe("123");
  });
});
