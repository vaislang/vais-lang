import { describe, it, expect } from "vitest";
import {
  Next,
  type SpecialFile,
  type RouteSegment,
  type RouteDefinition,
  type RouteParams,
  type RouteMatch,
  type RouteManifest,
  type LoadContext,
  type PageData,
  type LayoutData,
  type LoadFunction,
  type ActionResult,
  type ActionFunction,
  type ActionOptions,
  type RenderMode,
  type RenderResult,
  type StreamRenderResult,
  type HydrationMarker,
  type NextToken,
  type MiddlewareFunction,
  type AdapterConfig,
  type AdapterBuildResult,
  type Adapter,
  type CookieStore,
  type CookieOptions,
  type VaisKitConfig,
} from "../src/index.js";

describe("@vaisx/kit exports", () => {
  it("exports Next symbol", () => {
    expect(typeof Next).toBe("symbol");
    expect(Next.toString()).toBe("Symbol(next)");
  });

  it("Next symbol is unique (each reference is the same singleton)", () => {
    // The same symbol imported twice should be reference-equal
    const a: NextToken = Next;
    const b: NextToken = Next;
    expect(a).toBe(b);
    expect(a === b).toBe(true);
  });

  it("Next symbol is distinct from other symbols with the same description", () => {
    const other = Symbol("next");
    expect(Next).not.toBe(other);
  });

  it("RouteDefinition can be constructed with required fields", () => {
    const route: RouteDefinition = {
      pattern: "/blog/[slug]",
      segments: [
        { type: "static", value: "blog" },
        { type: "dynamic", value: "slug" },
      ],
      middleware: [],
      children: [],
    };

    expect(route.pattern).toBe("/blog/[slug]");
    expect(route.segments).toHaveLength(2);
    expect(route.segments[0].type).toBe("static");
    expect(route.segments[1].type).toBe("dynamic");
    expect(route.middleware).toHaveLength(0);
    expect(route.children).toHaveLength(0);
  });

  it("RouteDefinition supports all optional fields", () => {
    const route: RouteDefinition = {
      pattern: "/",
      segments: [],
      page: "app/page.vaisx",
      layout: "app/layout.vaisx",
      error: "app/error.vaisx",
      loading: "app/loading.vaisx",
      apiRoute: "app/route.vais",
      middleware: ["app/middleware.vais"],
      children: [],
    };

    expect(route.page).toBe("app/page.vaisx");
    expect(route.layout).toBe("app/layout.vaisx");
    expect(route.error).toBe("app/error.vaisx");
    expect(route.loading).toBe("app/loading.vaisx");
    expect(route.apiRoute).toBe("app/route.vais");
    expect(route.middleware).toHaveLength(1);
  });

  it("RouteManifest can hold routes and modules map", () => {
    const manifest: RouteManifest = {
      routes: [
        {
          pattern: "/",
          segments: [],
          middleware: [],
          children: [],
        },
      ],
      modules: {
        "/": "./dist/pages/index.js",
      },
    };

    expect(manifest.routes).toHaveLength(1);
    expect(manifest.modules["/"]).toBe("./dist/pages/index.js");
  });

  it("ActionResult supports all status variants", () => {
    const success: ActionResult = { status: "success", data: { id: 1 } };
    const error: ActionResult = { status: "error", errors: { email: "Invalid email" } };
    const redirect: ActionResult = { status: "redirect", redirectTo: "/dashboard" };

    expect(success.status).toBe("success");
    expect(error.status).toBe("error");
    expect(error.errors?.["email"]).toBe("Invalid email");
    expect(redirect.status).toBe("redirect");
    expect(redirect.redirectTo).toBe("/dashboard");
  });

  it("RenderMode accepts ssr, ssg, and csr values", () => {
    const modes: RenderMode[] = ["ssr", "ssg", "csr"];
    expect(modes).toContain("ssr");
    expect(modes).toContain("ssg");
    expect(modes).toContain("csr");
    expect(modes).toHaveLength(3);
  });

  it("AdapterConfig supports all adapter types", () => {
    const nodeAdapter: AdapterConfig = { type: "node", port: 3000, host: "localhost" };
    const staticAdapter: AdapterConfig = { type: "static", fallback: "404.html" };
    const vercelAdapter: AdapterConfig = { type: "vercel" };
    const cfAdapter: AdapterConfig = { type: "cloudflare" };

    expect(nodeAdapter.type).toBe("node");
    expect(nodeAdapter.port).toBe(3000);
    expect(staticAdapter.fallback).toBe("404.html");
    expect(vercelAdapter.type).toBe("vercel");
    expect(cfAdapter.type).toBe("cloudflare");
  });

  it("VaisKitConfig can be constructed with required and optional fields", () => {
    const config: VaisKitConfig = {
      adapter: { type: "node" },
      appDir: "app",
      outDir: "dist",
      ssr: true,
    };

    expect(config.adapter.type).toBe("node");
    expect(config.appDir).toBe("app");
    expect(config.outDir).toBe("dist");
    expect(config.ssr).toBe(true);
  });

  it("CookieOptions supports all sameSite variants", () => {
    const strict: CookieOptions = { sameSite: "strict" };
    const lax: CookieOptions = { sameSite: "lax" };
    const none: CookieOptions = { sameSite: "none" };

    expect(strict.sameSite).toBe("strict");
    expect(lax.sameSite).toBe("lax");
    expect(none.sameSite).toBe("none");
  });

  it("RouteSegment supports all segment types", () => {
    const segments: RouteSegment[] = [
      { type: "static", value: "blog" },
      { type: "dynamic", value: "slug" },
      { type: "catch-all", value: "rest" },
      { type: "group", value: "marketing" },
    ];

    expect(segments[0].type).toBe("static");
    expect(segments[1].type).toBe("dynamic");
    expect(segments[2].type).toBe("catch-all");
    expect(segments[3].type).toBe("group");
  });

  it("HydrationMarker holds component hydration data", () => {
    const marker: HydrationMarker = {
      componentId: "counter-1",
      events: ["click", "input"],
      state: btoa(JSON.stringify({ count: 0 })),
    };

    expect(marker.componentId).toBe("counter-1");
    expect(marker.events).toContain("click");
    expect(marker.events).toContain("input");
    expect(typeof marker.state).toBe("string");
  });
});

// Compile-time type checks (these will cause TS errors if types are wrong)
// Verify SpecialFile union
const _sf1: SpecialFile = "page.vaisx";
const _sf2: SpecialFile = "layout.vaisx";
const _sf3: SpecialFile = "loading.vaisx";
const _sf4: SpecialFile = "error.vaisx";
const _sf5: SpecialFile = "route.vais";
const _sf6: SpecialFile = "middleware.vais";

// Verify LoadFunction signature
const _loadFn: LoadFunction = async (_ctx: LoadContext): Promise<PageData> => {
  return { title: "Hello" };
};

// Verify MiddlewareFunction can return Next
const _mw: MiddlewareFunction = (_req: Request) => {
  return Next;
};

// Suppress unused variable warnings at runtime (these are type-only checks)
void _sf1, _sf2, _sf3, _sf4, _sf5, _sf6, _loadFn, _mw;
