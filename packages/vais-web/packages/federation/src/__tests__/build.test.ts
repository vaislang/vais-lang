/**
 * @vaisx/federation — build integration tests
 *
 * Covers:
 *  - createFederationBuildPlugin / generateManifest
 *  - generateExposeMap
 *  - resolveSharedDeps
 *  - validateFederationConfig
 *  - serializeManifest / parseManifest
 */

import { describe, it, expect } from "vitest";
import {
  createFederationBuildPlugin,
  generateExposeMap,
  resolveSharedDeps,
  validateFederationConfig,
  serializeManifest,
  parseManifest,
  FederationConfigError,
  ManifestParseError,
} from "../build.js";
import type {
  FederationBuildConfig,
  BuildResult,
  PackageJson,
  BuildFederationManifest,
} from "../build.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const minimalConfig: FederationBuildConfig = {
  name: "shop",
  version: "1.2.3",
};

const fullConfig: FederationBuildConfig = {
  name: "shop",
  version: "2.0.0",
  publicPath: "/static/",
  exposes: [
    { key: "./Cart", path: "./src/components/Cart.tsx" },
    { key: "./ProductList", path: "./src/components/ProductList.tsx" },
  ],
  remotes: [
    { name: "auth", url: "https://auth.example.com", modules: ["./Login"] },
  ],
  shared: {
    react: { singleton: true, requiredVersion: "^18.0.0" },
    "react-dom": { singleton: true, requiredVersion: "^18.0.0" },
  },
};

const emptyBuildResult: BuildResult = { chunks: [] };

const buildResultWithChunks: BuildResult = {
  chunks: [
    { fileName: "shop.js", size: 1024, isEntry: true },
    { fileName: "vendor.js", size: 4096 },
  ],
};

// ─── createFederationBuildPlugin ──────────────────────────────────────────────

describe("createFederationBuildPlugin", () => {
  it("returns a plugin with the correct name", () => {
    const plugin = createFederationBuildPlugin(minimalConfig);
    expect(plugin.name).toBe("vaisx:federation:shop");
  });

  it("stores the config on the plugin", () => {
    const plugin = createFederationBuildPlugin(minimalConfig);
    expect(plugin.config).toBe(minimalConfig);
  });

  it("throws FederationConfigError for invalid config", () => {
    expect(() =>
      createFederationBuildPlugin({ name: "" }),
    ).toThrow(FederationConfigError);
  });

  it("exposeMap is empty when no exposes provided", () => {
    const plugin = createFederationBuildPlugin(minimalConfig);
    expect(plugin.exposeMap).toHaveLength(0);
  });

  it("exposeMap reflects exposes from config", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    expect(plugin.exposeMap).toHaveLength(2);
    expect(plugin.exposeMap[0].key).toBe("./Cart");
    expect(plugin.exposeMap[1].key).toBe("./ProductList");
  });
});

// ─── generateManifest ─────────────────────────────────────────────────────────

describe("generateManifest", () => {
  it("produces manifest with correct name and version", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    const manifest = plugin.generateManifest(emptyBuildResult);
    expect(manifest.name).toBe("shop");
    expect(manifest.version).toBe("2.0.0");
  });

  it("uses '0.0.0' when version is not specified", () => {
    const plugin = createFederationBuildPlugin({ name: "app" });
    const manifest = plugin.generateManifest(emptyBuildResult);
    expect(manifest.version).toBe("0.0.0");
  });

  it("manifest modules list matches expose keys", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    const manifest = plugin.generateManifest(emptyBuildResult);
    expect(manifest.modules).toEqual(["./Cart", "./ProductList"]);
  });

  it("manifest remotes are propagated from config", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    const manifest = plugin.generateManifest(emptyBuildResult);
    expect(manifest.remotes).toHaveLength(1);
    expect(manifest.remotes[0].name).toBe("auth");
  });

  it("manifest shared deps are propagated from config", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    const manifest = plugin.generateManifest(emptyBuildResult);
    expect(manifest.shared["react"]).toMatchObject({ singleton: true });
  });

  it("manifest publicPath defaults to '/'", () => {
    const plugin = createFederationBuildPlugin(minimalConfig);
    const manifest = plugin.generateManifest(emptyBuildResult) as BuildFederationManifest;
    expect(manifest.publicPath).toBe("/");
  });

  it("manifest publicPath reflects config value", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    const manifest = plugin.generateManifest(emptyBuildResult) as BuildFederationManifest;
    expect(manifest.publicPath).toBe("/static/");
  });

  it("manifest exposes map is populated", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    const manifest = plugin.generateManifest(emptyBuildResult) as BuildFederationManifest;
    expect(manifest.exposes["./Cart"]).toBe("./src/components/Cart.tsx");
  });

  it("manifest remotes default to [] when not provided", () => {
    const plugin = createFederationBuildPlugin(minimalConfig);
    const manifest = plugin.generateManifest(emptyBuildResult);
    expect(manifest.remotes).toEqual([]);
  });

  it("manifest shared defaults to {} when not provided", () => {
    const plugin = createFederationBuildPlugin(minimalConfig);
    const manifest = plugin.generateManifest(emptyBuildResult);
    expect(manifest.shared).toEqual({});
  });

  it("build result chunks are accessible via generated manifest metadata", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    const manifest = plugin.generateManifest(buildResultWithChunks) as Record<string, unknown>;
    // chunks field is attached when chunks are present
    expect(Array.isArray(manifest["chunks"])).toBe(true);
  });
});

// ─── generateExposeMap ────────────────────────────────────────────────────────

describe("generateExposeMap", () => {
  it("returns empty array when no exposes configured", () => {
    const map = generateExposeMap({ name: "app" });
    expect(map).toEqual([]);
  });

  it("normalizes module name by stripping './'", () => {
    const map = generateExposeMap({
      name: "app",
      exposes: [{ key: "./Button", path: "./src/Button.tsx" }],
    });
    expect(map[0].moduleName).toBe("Button");
  });

  it("preserves the original key", () => {
    const map = generateExposeMap({
      name: "app",
      exposes: [{ key: "./utils/helpers", path: "./src/utils.ts" }],
    });
    expect(map[0].key).toBe("./utils/helpers");
  });

  it("strips file extension from moduleName", () => {
    const map = generateExposeMap({
      name: "app",
      exposes: [{ key: "./Button.tsx", path: "./src/Button.tsx" }],
    });
    expect(map[0].moduleName).toBe("Button");
  });

  it("returns entries in declaration order", () => {
    const map = generateExposeMap(fullConfig);
    expect(map.map((e) => e.key)).toEqual(["./Cart", "./ProductList"]);
  });
});

// ─── resolveSharedDeps ────────────────────────────────────────────────────────

describe("resolveSharedDeps", () => {
  it("returns empty object when packageJson has no deps and config has no shared", () => {
    const result = resolveSharedDeps({}, { name: "app" });
    expect(result).toEqual({});
  });

  it("picks up dependencies from packageJson", () => {
    const pkg: PackageJson = { dependencies: { react: "^18.2.0" } };
    const result = resolveSharedDeps(pkg, { name: "app" });
    expect(result["react"]).toMatchObject({ requiredVersion: "^18.2.0" });
  });

  it("picks up peerDependencies from packageJson", () => {
    const pkg: PackageJson = { peerDependencies: { "react-dom": "^18.0.0" } };
    const result = resolveSharedDeps(pkg, { name: "app" });
    expect(result["react-dom"]).toMatchObject({ requiredVersion: "^18.0.0" });
  });

  it("explicit config.shared singleton wins over auto-detected entry", () => {
    const pkg: PackageJson = { dependencies: { react: "^18.2.0" } };
    const result = resolveSharedDeps(pkg, {
      name: "app",
      shared: { react: { singleton: true } },
    });
    expect(result["react"].singleton).toBe(true);
    // requiredVersion from packageJson is preserved
    expect(result["react"].requiredVersion).toBe("^18.2.0");
  });

  it("adds packages not in packageJson when listed in config.shared", () => {
    const result = resolveSharedDeps({}, {
      name: "app",
      shared: { zustand: { singleton: false } },
    });
    expect(result["zustand"]).toBeDefined();
  });

  it("does not include devDependencies", () => {
    const pkg: PackageJson = { devDependencies: { vitest: "^2.0.0" } };
    const result = resolveSharedDeps(pkg, { name: "app" });
    expect(result["vitest"]).toBeUndefined();
  });
});

// ─── validateFederationConfig ─────────────────────────────────────────────────

describe("validateFederationConfig", () => {
  it("passes for a minimal valid config", () => {
    expect(() => validateFederationConfig({ name: "app" })).not.toThrow();
  });

  it("throws when name is empty string", () => {
    expect(() => validateFederationConfig({ name: "" })).toThrow(FederationConfigError);
  });

  it("throws when name is whitespace only", () => {
    expect(() => validateFederationConfig({ name: "   " })).toThrow(FederationConfigError);
  });

  it("throws when version is not semver", () => {
    expect(() =>
      validateFederationConfig({ name: "app", version: "not-a-version" }),
    ).toThrow(FederationConfigError);
  });

  it("passes for a valid semver version", () => {
    expect(() =>
      validateFederationConfig({ name: "app", version: "1.0.0" }),
    ).not.toThrow();
  });

  it("throws when expose key is empty", () => {
    expect(() =>
      validateFederationConfig({
        name: "app",
        exposes: [{ key: "", path: "./src/X.tsx" }],
      }),
    ).toThrow(FederationConfigError);
  });

  it("throws when expose path is empty", () => {
    expect(() =>
      validateFederationConfig({
        name: "app",
        exposes: [{ key: "./X", path: "" }],
      }),
    ).toThrow(FederationConfigError);
  });

  it("throws when remote name is empty", () => {
    expect(() =>
      validateFederationConfig({
        name: "app",
        remotes: [{ name: "", url: "https://example.com", modules: [] }],
      }),
    ).toThrow(FederationConfigError);
  });

  it("throws when remote url is empty", () => {
    expect(() =>
      validateFederationConfig({
        name: "app",
        remotes: [{ name: "auth", url: "", modules: [] }],
      }),
    ).toThrow(FederationConfigError);
  });

  it("throws when publicPath is empty string", () => {
    expect(() =>
      validateFederationConfig({ name: "app", publicPath: "" }),
    ).toThrow(FederationConfigError);
  });

  it("FederationConfigError carries the field name", () => {
    try {
      validateFederationConfig({ name: "" });
    } catch (err) {
      expect(err).toBeInstanceOf(FederationConfigError);
      expect((err as FederationConfigError).field).toBe("name");
    }
  });
});

// ─── serializeManifest ────────────────────────────────────────────────────────

describe("serializeManifest", () => {
  it("produces valid JSON", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    const manifest = plugin.generateManifest(emptyBuildResult);
    const json = serializeManifest(manifest);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("serialized JSON contains the name field", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    const manifest = plugin.generateManifest(emptyBuildResult);
    const json = serializeManifest(manifest);
    expect(json).toContain('"name"');
    expect(json).toContain('"shop"');
  });

  it("output is pretty-printed with 2-space indentation", () => {
    const plugin = createFederationBuildPlugin(minimalConfig);
    const manifest = plugin.generateManifest(emptyBuildResult);
    const json = serializeManifest(manifest);
    // Pretty-printed JSON has newlines and leading spaces.
    expect(json).toMatch(/\n  /);
  });
});

// ─── parseManifest ────────────────────────────────────────────────────────────

describe("parseManifest", () => {
  it("round-trips a generated manifest", () => {
    const plugin = createFederationBuildPlugin(fullConfig);
    const manifest = plugin.generateManifest(emptyBuildResult);
    const json = serializeManifest(manifest);
    const parsed = parseManifest(json);
    expect(parsed.name).toBe("shop");
    expect(parsed.version).toBe("2.0.0");
    expect(parsed.modules).toEqual(["./Cart", "./ProductList"]);
  });

  it("throws ManifestParseError for invalid JSON", () => {
    expect(() => parseManifest("{not json}")).toThrow(ManifestParseError);
  });

  it("throws when name field is missing", () => {
    const json = JSON.stringify({
      version: "1.0.0",
      modules: [],
      remotes: [],
      shared: {},
    });
    expect(() => parseManifest(json)).toThrow(ManifestParseError);
  });

  it("throws when version field is missing", () => {
    const json = JSON.stringify({ name: "app", modules: [], remotes: [], shared: {} });
    expect(() => parseManifest(json)).toThrow(ManifestParseError);
  });

  it("throws when modules field is not an array", () => {
    const json = JSON.stringify({
      name: "app",
      version: "1.0.0",
      modules: "not-array",
      remotes: [],
      shared: {},
    });
    expect(() => parseManifest(json)).toThrow(ManifestParseError);
  });

  it("throws when remotes field is not an array", () => {
    const json = JSON.stringify({
      name: "app",
      version: "1.0.0",
      modules: [],
      remotes: "not-array",
      shared: {},
    });
    expect(() => parseManifest(json)).toThrow(ManifestParseError);
  });

  it("throws when shared field is not an object", () => {
    const json = JSON.stringify({
      name: "app",
      version: "1.0.0",
      modules: [],
      remotes: [],
      shared: "not-object",
    });
    expect(() => parseManifest(json)).toThrow(ManifestParseError);
  });

  it("throws when JSON is not an object", () => {
    expect(() => parseManifest('"just a string"')).toThrow(ManifestParseError);
  });

  it("ManifestParseError carries the field name for missing name", () => {
    const json = JSON.stringify({
      version: "1.0.0",
      modules: [],
      remotes: [],
      shared: {},
    });
    try {
      parseManifest(json);
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestParseError);
      expect((err as ManifestParseError).field).toBe("name");
    }
  });

  it("parses shared dependency options correctly", () => {
    const json = JSON.stringify({
      name: "app",
      version: "1.0.0",
      modules: ["./Button"],
      remotes: [],
      shared: { react: { singleton: true, requiredVersion: "^18.0.0" } },
    });
    const parsed = parseManifest(json);
    expect(parsed.shared["react"].singleton).toBe(true);
    expect(parsed.shared["react"].requiredVersion).toBe("^18.0.0");
  });

  it("parses remote entries correctly", () => {
    const json = JSON.stringify({
      name: "shop",
      version: "1.0.0",
      modules: [],
      remotes: [{ name: "auth", url: "https://auth.example.com", modules: ["./Login"] }],
      shared: {},
    });
    const parsed = parseManifest(json);
    expect(parsed.remotes).toHaveLength(1);
    expect(parsed.remotes[0].name).toBe("auth");
    expect(parsed.remotes[0].url).toBe("https://auth.example.com");
  });
});
