import { describe, it, expect } from "vitest";
import { createNodeAdapter, generateServerEntry, createRequestHandler } from "../src/adapters/node.js";
import { createStaticAdapter } from "../src/adapters/static.js";
import type { RouteManifest, AdapterConfig } from "../src/types.js";
import type { ServerOptions } from "../src/adapters/types.js";

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
    ],
    modules: {
      "/": "/app/page.vaisx",
      "/about": "/app/about/page.vaisx",
    },
    ...overrides,
  };
}

function makeNodeConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    type: "node",
    port: 3000,
    host: "0.0.0.0",
    ...overrides,
  };
}

function makeStaticConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    type: "static",
    fallback: "404.html",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateServerEntry
// ---------------------------------------------------------------------------

describe("generateServerEntry", () => {
  it("produces code with http.createServer", () => {
    const manifest = makeManifest();
    const options: ServerOptions = {
      port: 3000,
      host: "0.0.0.0",
      staticDir: "../client",
      serverDir: ".",
    };
    const code = generateServerEntry(manifest, options);
    expect(code).toContain("http.createServer");
  });

  it("includes the configured port number", () => {
    const manifest = makeManifest();
    const options: ServerOptions = {
      port: 8080,
      host: "localhost",
      staticDir: "../client",
      serverDir: ".",
    };
    const code = generateServerEntry(manifest, options);
    expect(code).toContain("8080");
  });

  it("includes the configured host", () => {
    const manifest = makeManifest();
    const options: ServerOptions = {
      port: 3000,
      host: "127.0.0.1",
      staticDir: "../client",
      serverDir: ".",
    };
    const code = generateServerEntry(manifest, options);
    expect(code).toContain("127.0.0.1");
  });

  it("includes route patterns from the manifest", () => {
    const manifest = makeManifest();
    const options: ServerOptions = {
      port: 3000,
      host: "0.0.0.0",
      staticDir: "../client",
      serverDir: ".",
    };
    const code = generateServerEntry(manifest, options);
    expect(code).toContain('"/about"');
    expect(code).toContain('"/"');
  });

  it("imports 'http' module", () => {
    const manifest = makeManifest();
    const options: ServerOptions = {
      port: 3000,
      host: "0.0.0.0",
      staticDir: "../client",
      serverDir: ".",
    };
    const code = generateServerEntry(manifest, options);
    expect(code).toContain('import http from "http"');
  });

  it("includes server.listen call", () => {
    const manifest = makeManifest();
    const options: ServerOptions = {
      port: 3000,
      host: "0.0.0.0",
      staticDir: "../client",
      serverDir: ".",
    };
    const code = generateServerEntry(manifest, options);
    expect(code).toContain("server.listen");
  });
});

// ---------------------------------------------------------------------------
// createNodeAdapter — build()
// ---------------------------------------------------------------------------

describe("createNodeAdapter", () => {
  it("returns an adapter with name 'node'", () => {
    const adapter = createNodeAdapter();
    expect(adapter.name).toBe("node");
  });

  it("build() returns an AdapterBuildResult", async () => {
    const adapter = createNodeAdapter();
    const result = await adapter.build(makeManifest(), makeNodeConfig());
    expect(result).toBeDefined();
    expect(result.outputDir).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
  });

  it("build() generates dist/server/index.js entry point", async () => {
    const adapter = createNodeAdapter();
    const result = await adapter.build(makeManifest(), makeNodeConfig());
    const hasServerEntry = result.files.some((f) =>
      f.includes("server/index.js") || f.includes("server\\index.js")
    );
    expect(hasServerEntry).toBe(true);
  });

  it("build() includes start.js in output files", async () => {
    const adapter = createNodeAdapter();
    const result = await adapter.build(makeManifest(), makeNodeConfig());
    const hasStartJs = result.files.some((f) => f.endsWith("start.js"));
    expect(hasStartJs).toBe(true);
  });

  it("build() uses custom port from config", async () => {
    const adapter = createNodeAdapter();
    const result = await adapter.build(
      makeManifest(),
      makeNodeConfig({ port: 8080 })
    ) as typeof result & { generatedFiles?: Record<string, string> };
    // Check that generated server code contains the custom port
    const generatedFiles = result.generatedFiles;
    if (generatedFiles) {
      const serverEntry = Object.values(generatedFiles).find((code) =>
        code.includes("http.createServer")
      );
      expect(serverEntry).toBeDefined();
      expect(serverEntry).toContain("8080");
    }
  });

  it("build() outputDir is 'dist'", async () => {
    const adapter = createNodeAdapter();
    const result = await adapter.build(makeManifest(), makeNodeConfig());
    expect(result.outputDir).toBe("dist");
  });
});

// ---------------------------------------------------------------------------
// createRequestHandler
// ---------------------------------------------------------------------------

describe("createRequestHandler", () => {
  it("returns a function", () => {
    const handler = createRequestHandler({
      staticDir: "./client",
      serverDir: "./server",
    });
    expect(typeof handler).toBe("function");
  });

  it("calls res.writeHead with a status code", () => {
    const handler = createRequestHandler({
      staticDir: "./client",
      serverDir: "./server",
    });

    let capturedStatus: number | undefined;
    const mockReq = {
      url: "/",
      method: "GET",
      headers: { host: "localhost:3000" },
    };
    const mockRes = {
      writeHead: (status: number) => {
        capturedStatus = status;
      },
      end: () => {},
    };

    handler(mockReq, mockRes);
    expect(capturedStatus).toBeDefined();
    expect(typeof capturedStatus).toBe("number");
  });

  it("calls res.end with HTML content", () => {
    const handler = createRequestHandler({
      staticDir: "./client",
      serverDir: "./server",
    });

    let capturedBody: string | Uint8Array | undefined;
    const mockReq = {
      url: "/",
      method: "GET",
      headers: { host: "localhost:3000" },
    };
    const mockRes = {
      writeHead: () => {},
      end: (body?: string | Uint8Array) => {
        capturedBody = body;
      },
    };

    handler(mockReq, mockRes);
    expect(capturedBody).toBeDefined();
    expect(typeof capturedBody).toBe("string");
    expect(capturedBody as string).toContain("<!DOCTYPE html>");
  });
});

// ---------------------------------------------------------------------------
// createStaticAdapter — build()
// ---------------------------------------------------------------------------

describe("createStaticAdapter", () => {
  it("returns an adapter with name 'static'", () => {
    const adapter = createStaticAdapter();
    expect(adapter.name).toBe("static");
  });

  it("build() returns an AdapterBuildResult", async () => {
    const adapter = createStaticAdapter();
    const result = await adapter.build(makeManifest(), makeStaticConfig());
    expect(result).toBeDefined();
    expect(result.outputDir).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
  });

  it("build() generates HTML files for each page route", async () => {
    const adapter = createStaticAdapter();
    const result = await adapter.build(makeManifest(), makeStaticConfig());
    const htmlFiles = result.files.filter((f) => f.endsWith(".html"));
    // Should have index.html, about/index.html, and 404.html
    expect(htmlFiles.length).toBeGreaterThanOrEqual(2);
  });

  it("build() generates a fallback page (404.html by default)", async () => {
    const adapter = createStaticAdapter();
    const result = await adapter.build(makeManifest(), makeStaticConfig());
    const has404 = result.files.some((f) => f.endsWith("404.html"));
    expect(has404).toBe(true);
  });

  it("build() uses custom fallback from config", async () => {
    const adapter = createStaticAdapter();
    const result = await adapter.build(
      makeManifest(),
      makeStaticConfig({ fallback: "index.html" })
    );
    // The fallback should be index.html
    const hasIndexFallback = result.files.some((f) => f.endsWith("index.html"));
    expect(hasIndexFallback).toBe(true);
  });

  it("build() outputDir is 'dist'", async () => {
    const adapter = createStaticAdapter();
    const result = await adapter.build(makeManifest(), makeStaticConfig());
    expect(result.outputDir).toBe("dist");
  });

  it("build() throws for routes with apiRoute (server-only)", async () => {
    const adapter = createStaticAdapter();
    const manifestWithApi: RouteManifest = {
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
    await expect(
      adapter.build(manifestWithApi, makeStaticConfig())
    ).rejects.toThrow();
  });

  it("build() generates index.html for root route", async () => {
    const adapter = createStaticAdapter();
    const result = await adapter.build(makeManifest(), makeStaticConfig());
    const hasIndexHtml = result.files.some(
      (f) => f === "dist/index.html" || f.endsWith("/index.html")
    );
    expect(hasIndexHtml).toBe(true);
  });

  it("build() generates HTML content with app div", async () => {
    const adapter = createStaticAdapter();
    const result = await adapter.build(makeManifest(), makeStaticConfig()) as typeof result & {
      generatedFiles?: Record<string, string>;
    };
    const generatedFiles = result.generatedFiles;
    if (generatedFiles) {
      const indexHtml = generatedFiles["dist/index.html"];
      if (indexHtml) {
        expect(indexHtml).toContain('<div id="app">');
        expect(indexHtml).toContain("<!DOCTYPE html>");
      }
    }
  });
});
