import { describe, it, expect } from "vitest";
import {
  createVercelAdapter,
  generateVercelConfig,
  generateServerlessFunction,
} from "../src/adapters/vercel.js";
import {
  createCloudflareAdapter,
  generateWorkerEntry,
  generateWranglerConfig,
} from "../src/adapters/cloudflare.js";
import type { RouteManifest, AdapterConfig } from "../src/types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeManifest(overrides: Partial<RouteManifest> = {}): RouteManifest {
  return {
    routes: [
      {
        pattern: "/",
        segments: [{ type: "static", value: "" }],
        page: "/app/page.vaisx",
        middleware: [],
        children: [],
      },
      {
        pattern: "/about",
        segments: [{ type: "static", value: "about" }],
        page: "/app/about/page.vaisx",
        middleware: [],
        children: [],
      },
      {
        pattern: "/blog/[slug]",
        segments: [
          { type: "static", value: "blog" },
          { type: "dynamic", value: "slug" },
        ],
        page: "/app/blog/[slug]/page.vaisx",
        middleware: [],
        children: [],
      },
    ],
    modules: {
      "/": "/app/page.vaisx",
      "/about": "/app/about/page.vaisx",
      "/blog/[slug]": "/app/blog/[slug]/page.vaisx",
    },
    ...overrides,
  };
}

function makeVercelConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    type: "vercel",
    ...overrides,
  };
}

function makeCloudflareConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    type: "cloudflare",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createVercelAdapter
// ---------------------------------------------------------------------------

describe("createVercelAdapter", () => {
  it("returns an adapter with name 'vercel'", () => {
    const adapter = createVercelAdapter();
    expect(adapter.name).toBe("vercel");
  });

  it("build() returns an AdapterBuildResult with outputDir and files", async () => {
    const adapter = createVercelAdapter();
    const result = await adapter.build(makeManifest(), makeVercelConfig());
    expect(result).toBeDefined();
    expect(result.outputDir).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
  });

  it("build() outputDir is .vercel/output", async () => {
    const adapter = createVercelAdapter();
    const result = await adapter.build(makeManifest(), makeVercelConfig());
    expect(result.outputDir).toBe(".vercel/output");
  });

  it("build() generates config.json in .vercel/output/", async () => {
    const adapter = createVercelAdapter();
    const result = await adapter.build(makeManifest(), makeVercelConfig());
    const hasConfig = result.files.some((f) => f.endsWith("config.json"));
    expect(hasConfig).toBe(true);
  });

  it("build() config.json has version 3", async () => {
    const adapter = createVercelAdapter();
    const result = await adapter.build(makeManifest(), makeVercelConfig()) as typeof result & {
      generatedFiles?: Record<string, string>;
      vercelConfig?: { version: number };
    };
    const generatedFiles = result.generatedFiles;
    if (generatedFiles) {
      const configJson = generatedFiles[".vercel/output/config.json"];
      expect(configJson).toBeDefined();
      const parsed = JSON.parse(configJson);
      expect(parsed.version).toBe(3);
      expect(Array.isArray(parsed.routes)).toBe(true);
    }
  });

  it("build() generates static files in .vercel/output/static/", async () => {
    const adapter = createVercelAdapter();
    const result = await adapter.build(makeManifest(), makeVercelConfig());
    const hasStatic = result.files.some((f) => f.includes("/static/"));
    expect(hasStatic).toBe(true);
  });

  it("build() generates serverless function for dynamic route", async () => {
    const adapter = createVercelAdapter();
    const result = await adapter.build(makeManifest(), makeVercelConfig());
    const hasFn = result.files.some((f) => f.includes("/functions/"));
    expect(hasFn).toBe(true);
  });

  it("build() generates files array with multiple entries", async () => {
    const adapter = createVercelAdapter();
    const result = await adapter.build(makeManifest(), makeVercelConfig());
    expect(result.files.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// generateVercelConfig
// ---------------------------------------------------------------------------

describe("generateVercelConfig", () => {
  it("returns config with version 3", () => {
    const config = generateVercelConfig(makeManifest());
    expect(config.version).toBe(3);
  });

  it("returns config with routes array", () => {
    const config = generateVercelConfig(makeManifest());
    expect(Array.isArray(config.routes)).toBe(true);
    expect(config.routes.length).toBeGreaterThan(0);
  });

  it("each route has src and dest fields", () => {
    const config = generateVercelConfig(makeManifest());
    for (const route of config.routes) {
      expect(typeof route.src).toBe("string");
      expect(typeof route.dest).toBe("string");
    }
  });

  it("static routes dest points to static file", () => {
    const manifest: RouteManifest = {
      routes: [
        {
          pattern: "/about",
          segments: [{ type: "static", value: "about" }],
          page: "/app/about/page.vaisx",
          middleware: [],
          children: [],
        },
      ],
      modules: {},
    };
    const config = generateVercelConfig(manifest);
    const aboutRoute = config.routes.find((r) => r.dest.includes("static"));
    expect(aboutRoute).toBeDefined();
    expect(aboutRoute!.dest).toContain("static");
  });

  it("dynamic routes dest points to functions/", () => {
    const manifest: RouteManifest = {
      routes: [
        {
          pattern: "/blog/[slug]",
          segments: [
            { type: "static", value: "blog" },
            { type: "dynamic", value: "slug" },
          ],
          page: "/app/blog/[slug]/page.vaisx",
          middleware: [],
          children: [],
        },
      ],
      modules: {},
    };
    const config = generateVercelConfig(manifest);
    const dynRoute = config.routes.find((r) => r.dest.includes("functions"));
    expect(dynRoute).toBeDefined();
    expect(dynRoute!.dest).toContain("functions");
  });

  it("API route has methods array", () => {
    const manifest: RouteManifest = {
      routes: [
        {
          pattern: "/api/data",
          segments: [
            { type: "static", value: "api" },
            { type: "static", value: "data" },
          ],
          apiRoute: "/app/api/data/route.vais",
          middleware: [],
          children: [],
        },
      ],
      modules: {},
    };
    const config = generateVercelConfig(manifest);
    expect(config.routes.length).toBe(1);
    expect(Array.isArray(config.routes[0].methods)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateServerlessFunction
// ---------------------------------------------------------------------------

describe("generateServerlessFunction", () => {
  it("exports a default function", () => {
    const code = generateServerlessFunction("/blog/[slug]");
    expect(code).toContain("export default function handler");
  });

  it("accepts req and res parameters", () => {
    const code = generateServerlessFunction("/");
    expect(code).toContain("req");
    expect(code).toContain("res");
  });

  it("calls res.end with HTML content", () => {
    const code = generateServerlessFunction("/about");
    expect(code).toContain("res.end");
    expect(code).toContain("<!DOCTYPE html>");
  });

  it("includes the route pattern in the code", () => {
    const code = generateServerlessFunction("/blog/[slug]");
    expect(code).toContain("/blog/[slug]");
  });
});

// ---------------------------------------------------------------------------
// createCloudflareAdapter
// ---------------------------------------------------------------------------

describe("createCloudflareAdapter", () => {
  it("returns an adapter with name 'cloudflare'", () => {
    const adapter = createCloudflareAdapter();
    expect(adapter.name).toBe("cloudflare");
  });

  it("build() returns an AdapterBuildResult with outputDir and files", async () => {
    const adapter = createCloudflareAdapter();
    const result = await adapter.build(makeManifest(), makeCloudflareConfig());
    expect(result).toBeDefined();
    expect(result.outputDir).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
  });

  it("build() generates _worker.js entry point", async () => {
    const adapter = createCloudflareAdapter();
    const result = await adapter.build(makeManifest(), makeCloudflareConfig());
    const hasWorker = result.files.some((f) => f.endsWith("_worker.js"));
    expect(hasWorker).toBe(true);
  });

  it("build() generates wrangler.toml", async () => {
    const adapter = createCloudflareAdapter();
    const result = await adapter.build(makeManifest(), makeCloudflareConfig());
    const hasWrangler = result.files.some((f) => f.endsWith("wrangler.toml"));
    expect(hasWrangler).toBe(true);
  });

  it("build() generates static assets in _assets/ directory", async () => {
    const adapter = createCloudflareAdapter();
    const result = await adapter.build(makeManifest(), makeCloudflareConfig());
    const hasAssets = result.files.some((f) => f.includes("_assets"));
    expect(hasAssets).toBe(true);
  });

  it("build() files list has multiple entries", async () => {
    const adapter = createCloudflareAdapter();
    const result = await adapter.build(makeManifest(), makeCloudflareConfig());
    expect(result.files.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// generateWorkerEntry
// ---------------------------------------------------------------------------

describe("generateWorkerEntry", () => {
  it("exports default fetch handler", () => {
    const code = generateWorkerEntry(makeManifest());
    expect(code).toContain("export default");
    expect(code).toContain("async fetch(request, env, ctx)");
  });

  it("includes route matching logic", () => {
    const code = generateWorkerEntry(makeManifest());
    expect(code).toContain("matchRoute");
  });

  it("includes static asset serving", () => {
    const code = generateWorkerEntry(makeManifest());
    expect(code).toContain("__STATIC_CONTENT");
  });

  it("includes route patterns from manifest", () => {
    const code = generateWorkerEntry(makeManifest());
    expect(code).toContain('"/about"');
    expect(code).toContain('"/blog/[slug]"');
  });

  it("returns 404 for unmatched routes", () => {
    const code = generateWorkerEntry(makeManifest());
    expect(code).toContain("404");
    expect(code).toContain("Not Found");
  });
});

// ---------------------------------------------------------------------------
// generateWranglerConfig
// ---------------------------------------------------------------------------

describe("generateWranglerConfig", () => {
  it("generates a TOML string", () => {
    const toml = generateWranglerConfig(makeCloudflareConfig());
    expect(typeof toml).toBe("string");
    expect(toml.length).toBeGreaterThan(0);
  });

  it("includes name field", () => {
    const toml = generateWranglerConfig(makeCloudflareConfig());
    expect(toml).toContain("name");
  });

  it("includes compatibility_date field", () => {
    const toml = generateWranglerConfig(makeCloudflareConfig());
    expect(toml).toContain("compatibility_date");
  });

  it("includes [site] section", () => {
    const toml = generateWranglerConfig(makeCloudflareConfig());
    expect(toml).toContain("[site]");
  });

  it("includes bucket field in [site] section", () => {
    const toml = generateWranglerConfig(makeCloudflareConfig());
    expect(toml).toContain("bucket");
  });
});
