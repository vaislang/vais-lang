import { describe, it, expect } from "vitest";
import { createDenoAdapter, generateDenoServerEntry, generateDenoConfig } from "../src/adapters/deno.js";
import { createBunAdapter, generateBunServerEntry } from "../src/adapters/bun.js";
import { createAwsLambdaAdapter, generateLambdaHandler, generateSamTemplate } from "../src/adapters/aws-lambda.js";
import { createNetlifyAdapter, generateNetlifyHandler, generateNetlifyToml, generateRedirects } from "../src/adapters/netlify.js";
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

function makeConfig(type: AdapterConfig["type"], overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return { type, ...overrides };
}

// ---------------------------------------------------------------------------
// createDenoAdapter
// ---------------------------------------------------------------------------

describe("createDenoAdapter", () => {
  it("returns an adapter with name 'deno'", () => {
    const adapter = createDenoAdapter();
    expect(adapter.name).toBe("deno");
  });

  it("build() returns an AdapterBuildResult with outputDir and files", async () => {
    const adapter = createDenoAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    expect(result).toBeDefined();
    expect(result.outputDir).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
  });

  it("build() returns files array with multiple entries", async () => {
    const adapter = createDenoAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    expect(result.files.length).toBeGreaterThan(1);
  });

  it("build() generates server entry file", async () => {
    const adapter = createDenoAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    const hasServer = result.files.some((f) => f.includes("server"));
    expect(hasServer).toBe(true);
  });

  it("build() generates deno.json config file", async () => {
    const adapter = createDenoAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    const hasDenoJson = result.files.some((f) => f.endsWith("deno.json"));
    expect(hasDenoJson).toBe(true);
  });

  it("build() generatedFiles contains server entry code with Deno.serve", async () => {
    const adapter = createDenoAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node")) as typeof result & {
      generatedFiles?: Record<string, string>;
    };
    const generatedFiles = result.generatedFiles;
    expect(generatedFiles).toBeDefined();
    if (generatedFiles) {
      const serverCode = Object.values(generatedFiles).find((code) =>
        code.includes("Deno.serve")
      );
      expect(serverCode).toBeDefined();
    }
  });

  it("build() generatedFiles contains deno.json with tasks", async () => {
    const adapter = createDenoAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node")) as typeof result & {
      generatedFiles?: Record<string, string>;
    };
    const generatedFiles = result.generatedFiles;
    if (generatedFiles) {
      const denoConfig = Object.entries(generatedFiles).find(([path]) =>
        path.endsWith("deno.json")
      );
      expect(denoConfig).toBeDefined();
      if (denoConfig) {
        const parsed = JSON.parse(denoConfig[1]);
        expect(parsed.tasks).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// generateDenoServerEntry
// ---------------------------------------------------------------------------

describe("generateDenoServerEntry", () => {
  it("uses Deno.serve", () => {
    const code = generateDenoServerEntry(makeManifest());
    expect(code).toContain("Deno.serve");
  });

  it("uses Web API Request and Response", () => {
    const code = generateDenoServerEntry(makeManifest());
    expect(code).toContain("new Response(");
  });

  it("includes route patterns from manifest", () => {
    const code = generateDenoServerEntry(makeManifest());
    expect(code).toContain('"/about"');
    expect(code).toContain('"/blog/[slug]"');
  });

  it("includes route matching logic", () => {
    const code = generateDenoServerEntry(makeManifest());
    expect(code).toContain("matchRoute");
  });

  it("returns 404 for unmatched routes", () => {
    const code = generateDenoServerEntry(makeManifest());
    expect(code).toContain("404");
    expect(code).toContain("Not Found");
  });
});

// ---------------------------------------------------------------------------
// generateDenoConfig
// ---------------------------------------------------------------------------

describe("generateDenoConfig", () => {
  it("returns valid JSON", () => {
    const config = generateDenoConfig();
    expect(() => JSON.parse(config)).not.toThrow();
  });

  it("includes tasks", () => {
    const config = generateDenoConfig();
    const parsed = JSON.parse(config);
    expect(parsed.tasks).toBeDefined();
  });

  it("includes start task", () => {
    const config = generateDenoConfig();
    const parsed = JSON.parse(config);
    expect(parsed.tasks.start).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createBunAdapter
// ---------------------------------------------------------------------------

describe("createBunAdapter", () => {
  it("returns an adapter with name 'bun'", () => {
    const adapter = createBunAdapter();
    expect(adapter.name).toBe("bun");
  });

  it("build() returns an AdapterBuildResult with outputDir and files", async () => {
    const adapter = createBunAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node", { port: 3000 }));
    expect(result).toBeDefined();
    expect(result.outputDir).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
  });

  it("build() generates server entry file", async () => {
    const adapter = createBunAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node", { port: 3000 }));
    const hasServer = result.files.some((f) => f.includes("server"));
    expect(hasServer).toBe(true);
  });

  it("build() generatedFiles contains server entry code with Bun.serve", async () => {
    const adapter = createBunAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node", { port: 3000 })) as typeof result & {
      generatedFiles?: Record<string, string>;
    };
    const generatedFiles = result.generatedFiles;
    expect(generatedFiles).toBeDefined();
    if (generatedFiles) {
      const serverCode = Object.values(generatedFiles).find((code) =>
        code.includes("Bun.serve")
      );
      expect(serverCode).toBeDefined();
    }
  });

  it("build() uses custom port from config", async () => {
    const adapter = createBunAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node", { port: 8080 })) as typeof result & {
      generatedFiles?: Record<string, string>;
    };
    const generatedFiles = result.generatedFiles;
    if (generatedFiles) {
      const serverCode = Object.values(generatedFiles).find((code) =>
        code.includes("Bun.serve")
      );
      expect(serverCode).toBeDefined();
      expect(serverCode).toContain("8080");
    }
  });

  it("build() outputDir is 'dist'", async () => {
    const adapter = createBunAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    expect(result.outputDir).toBe("dist");
  });
});

// ---------------------------------------------------------------------------
// generateBunServerEntry
// ---------------------------------------------------------------------------

describe("generateBunServerEntry", () => {
  it("uses Bun.serve", () => {
    const code = generateBunServerEntry(makeManifest());
    expect(code).toContain("Bun.serve");
  });

  it("uses Web API Request and Response", () => {
    const code = generateBunServerEntry(makeManifest());
    expect(code).toContain("new Response(");
  });

  it("includes route patterns from manifest", () => {
    const code = generateBunServerEntry(makeManifest());
    expect(code).toContain('"/about"');
    expect(code).toContain('"/blog/[slug]"');
  });

  it("includes the configured port", () => {
    const code = generateBunServerEntry(makeManifest(), 9000);
    expect(code).toContain("9000");
  });

  it("returns 404 for unmatched routes", () => {
    const code = generateBunServerEntry(makeManifest());
    expect(code).toContain("404");
    expect(code).toContain("Not Found");
  });
});

// ---------------------------------------------------------------------------
// createAwsLambdaAdapter
// ---------------------------------------------------------------------------

describe("createAwsLambdaAdapter", () => {
  it("returns an adapter with name 'aws-lambda'", () => {
    const adapter = createAwsLambdaAdapter();
    expect(adapter.name).toBe("aws-lambda");
  });

  it("build() returns an AdapterBuildResult with outputDir and files", async () => {
    const adapter = createAwsLambdaAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    expect(result).toBeDefined();
    expect(result.outputDir).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
  });

  it("build() generates Lambda handler file", async () => {
    const adapter = createAwsLambdaAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    const hasHandler = result.files.some((f) => f.includes("handler.js"));
    expect(hasHandler).toBe(true);
  });

  it("build() generates template.yaml SAM config", async () => {
    const adapter = createAwsLambdaAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    const hasTemplate = result.files.some((f) => f.endsWith("template.yaml"));
    expect(hasTemplate).toBe(true);
  });

  it("build() generatedFiles contains Lambda handler code", async () => {
    const adapter = createAwsLambdaAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node")) as typeof result & {
      generatedFiles?: Record<string, string>;
    };
    const generatedFiles = result.generatedFiles;
    expect(generatedFiles).toBeDefined();
    if (generatedFiles) {
      const handlerCode = Object.values(generatedFiles).find((code) =>
        code.includes("export async function handler")
      );
      expect(handlerCode).toBeDefined();
    }
  });

  it("build() generatedFiles contains template.yaml with SAM transform", async () => {
    const adapter = createAwsLambdaAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node")) as typeof result & {
      generatedFiles?: Record<string, string>;
    };
    const generatedFiles = result.generatedFiles;
    if (generatedFiles) {
      const templateYaml = Object.entries(generatedFiles).find(([path]) =>
        path.endsWith("template.yaml")
      );
      expect(templateYaml).toBeDefined();
      if (templateYaml) {
        expect(templateYaml[1]).toContain("AWS::Serverless");
      }
    }
  });

  it("build() outputDir is 'dist'", async () => {
    const adapter = createAwsLambdaAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    expect(result.outputDir).toBe("dist");
  });
});

// ---------------------------------------------------------------------------
// generateLambdaHandler
// ---------------------------------------------------------------------------

describe("generateLambdaHandler", () => {
  it("exports async handler function", () => {
    const code = generateLambdaHandler(makeManifest());
    expect(code).toContain("export async function handler");
  });

  it("includes APIGatewayProxyEvent to Request conversion", () => {
    const code = generateLambdaHandler(makeManifest());
    expect(code).toContain("eventToRequest");
  });

  it("includes Response to APIGatewayProxyResult conversion", () => {
    const code = generateLambdaHandler(makeManifest());
    expect(code).toContain("responseToResult");
  });

  it("includes route patterns from manifest", () => {
    const code = generateLambdaHandler(makeManifest());
    expect(code).toContain('"/about"');
    expect(code).toContain('"/blog/[slug]"');
  });

  it("returns 404 for unmatched routes", () => {
    const code = generateLambdaHandler(makeManifest());
    expect(code).toContain("404");
    expect(code).toContain("Not Found");
  });
});

// ---------------------------------------------------------------------------
// generateSamTemplate
// ---------------------------------------------------------------------------

describe("generateSamTemplate", () => {
  it("generates a YAML string", () => {
    const yaml = generateSamTemplate(makeConfig("node"));
    expect(typeof yaml).toBe("string");
    expect(yaml.length).toBeGreaterThan(0);
  });

  it("includes AWSTemplateFormatVersion", () => {
    const yaml = generateSamTemplate(makeConfig("node"));
    expect(yaml).toContain("AWSTemplateFormatVersion");
  });

  it("includes SAM Transform", () => {
    const yaml = generateSamTemplate(makeConfig("node"));
    expect(yaml).toContain("Transform: AWS::Serverless");
  });

  it("includes Resources section", () => {
    const yaml = generateSamTemplate(makeConfig("node"));
    expect(yaml).toContain("Resources:");
  });

  it("includes Lambda function resource", () => {
    const yaml = generateSamTemplate(makeConfig("node"));
    expect(yaml).toContain("AWS::Serverless::Function");
  });
});

// ---------------------------------------------------------------------------
// createNetlifyAdapter
// ---------------------------------------------------------------------------

describe("createNetlifyAdapter", () => {
  it("returns an adapter with name 'netlify'", () => {
    const adapter = createNetlifyAdapter();
    expect(adapter.name).toBe("netlify");
  });

  it("build() returns an AdapterBuildResult with outputDir and files", async () => {
    const adapter = createNetlifyAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    expect(result).toBeDefined();
    expect(result.outputDir).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
  });

  it("build() generates Netlify Functions handler file", async () => {
    const adapter = createNetlifyAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    const hasHandler = result.files.some((f) => f.includes("functions") && f.endsWith(".js"));
    expect(hasHandler).toBe(true);
  });

  it("build() generates netlify.toml config", async () => {
    const adapter = createNetlifyAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    const hasToml = result.files.some((f) => f.endsWith("netlify.toml"));
    expect(hasToml).toBe(true);
  });

  it("build() generates _redirects file for SPA fallback", async () => {
    const adapter = createNetlifyAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    const hasRedirects = result.files.some((f) => f.endsWith("_redirects"));
    expect(hasRedirects).toBe(true);
  });

  it("build() generatedFiles contains Netlify handler with export", async () => {
    const adapter = createNetlifyAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node")) as typeof result & {
      generatedFiles?: Record<string, string>;
    };
    const generatedFiles = result.generatedFiles;
    expect(generatedFiles).toBeDefined();
    if (generatedFiles) {
      const handlerCode = Object.values(generatedFiles).find((code) =>
        code.includes("export const handler")
      );
      expect(handlerCode).toBeDefined();
    }
  });

  it("build() generatedFiles contains netlify.toml with build section", async () => {
    const adapter = createNetlifyAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node")) as typeof result & {
      generatedFiles?: Record<string, string>;
    };
    const generatedFiles = result.generatedFiles;
    if (generatedFiles) {
      const toml = Object.entries(generatedFiles).find(([path]) =>
        path.endsWith("netlify.toml")
      );
      expect(toml).toBeDefined();
      if (toml) {
        expect(toml[1]).toContain("[build]");
      }
    }
  });

  it("build() outputDir is 'dist'", async () => {
    const adapter = createNetlifyAdapter();
    const result = await adapter.build(makeManifest(), makeConfig("node"));
    expect(result.outputDir).toBe("dist");
  });
});

// ---------------------------------------------------------------------------
// generateNetlifyHandler
// ---------------------------------------------------------------------------

describe("generateNetlifyHandler", () => {
  it("exports const handler as async function", () => {
    const code = generateNetlifyHandler(makeManifest());
    expect(code).toContain("export const handler");
    expect(code).toContain("async");
  });

  it("includes route patterns from manifest", () => {
    const code = generateNetlifyHandler(makeManifest());
    expect(code).toContain('"/about"');
    expect(code).toContain('"/blog/[slug]"');
  });

  it("returns statusCode in response", () => {
    const code = generateNetlifyHandler(makeManifest());
    expect(code).toContain("statusCode");
  });

  it("returns 404 for unmatched routes", () => {
    const code = generateNetlifyHandler(makeManifest());
    expect(code).toContain("404");
    expect(code).toContain("Not Found");
  });
});

// ---------------------------------------------------------------------------
// generateNetlifyToml
// ---------------------------------------------------------------------------

describe("generateNetlifyToml", () => {
  it("generates a TOML string", () => {
    const toml = generateNetlifyToml();
    expect(typeof toml).toBe("string");
    expect(toml.length).toBeGreaterThan(0);
  });

  it("includes [build] section", () => {
    const toml = generateNetlifyToml();
    expect(toml).toContain("[build]");
  });

  it("includes publish directory", () => {
    const toml = generateNetlifyToml();
    expect(toml).toContain("publish");
  });

  it("includes functions directory", () => {
    const toml = generateNetlifyToml();
    expect(toml).toContain("functions");
  });

  it("includes [[redirects]] section", () => {
    const toml = generateNetlifyToml();
    expect(toml).toContain("[[redirects]]");
  });
});

// ---------------------------------------------------------------------------
// generateRedirects
// ---------------------------------------------------------------------------

describe("generateRedirects", () => {
  it("generates a string", () => {
    const redirects = generateRedirects();
    expect(typeof redirects).toBe("string");
    expect(redirects.length).toBeGreaterThan(0);
  });

  it("includes SPA fallback to index.html", () => {
    const redirects = generateRedirects();
    expect(redirects).toContain("index.html");
  });

  it("includes 200 status for SPA fallback", () => {
    const redirects = generateRedirects();
    expect(redirects).toContain("200");
  });

  it("includes wildcard pattern", () => {
    const redirects = generateRedirects();
    expect(redirects).toContain("/*");
  });
});
