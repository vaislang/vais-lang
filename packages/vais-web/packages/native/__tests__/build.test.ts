/**
 * Tests for packages/native/src/build.ts
 *
 * Covers:
 *  - createNativeBuildConfig
 *  - buildForPlatform
 *  - createOTAManager
 *  - generateNativeProject
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createNativeBuildConfig,
  buildForPlatform,
  createOTAManager,
  generateNativeProject,
} from "../src/build.js";
import type {
  NativeBuildOptions,
  NativeBuildConfig,
  BuildResult,
  OTAManager,
  NativeProjectStructure,
} from "../src/build.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseOptions(overrides: Partial<NativeBuildOptions> = {}): NativeBuildOptions {
  return {
    platform: "ios",
    entry: "src/index.ts",
    outDir: "dist/native",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createNativeBuildConfig
// ---------------------------------------------------------------------------

describe("createNativeBuildConfig", () => {
  it("returns a config with correct platform, entry, and outDir", () => {
    const cfg = createNativeBuildConfig(baseOptions());
    expect(cfg.platform).toBe("ios");
    expect(cfg.entry).toBe("src/index.ts");
    expect(cfg.outDir).toBe("dist/native");
  });

  it("defaults minify to false when not supplied", () => {
    const cfg = createNativeBuildConfig(baseOptions());
    expect(cfg.minify).toBe(false);
  });

  it("defaults sourcemap to false when not supplied", () => {
    const cfg = createNativeBuildConfig(baseOptions());
    expect(cfg.sourcemap).toBe(false);
  });

  it("respects explicit minify=true", () => {
    const cfg = createNativeBuildConfig(baseOptions({ minify: true }));
    expect(cfg.minify).toBe(true);
  });

  it("respects explicit sourcemap=true", () => {
    const cfg = createNativeBuildConfig(baseOptions({ sourcemap: true }));
    expect(cfg.sourcemap).toBe(true);
  });

  it("accepts platform 'android'", () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "android" }));
    expect(cfg.platform).toBe("android");
  });

  it("accepts platform 'both'", () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "both" }));
    expect(cfg.platform).toBe("both");
  });

  it("throws when entry is empty", () => {
    expect(() => createNativeBuildConfig(baseOptions({ entry: "" }))).toThrow();
  });

  it("throws when outDir is empty", () => {
    expect(() => createNativeBuildConfig(baseOptions({ outDir: "   " }))).toThrow();
  });

  it("trims entry and outDir whitespace", () => {
    const cfg = createNativeBuildConfig(baseOptions({ entry: "  src/main.ts  ", outDir: "  dist  " }));
    expect(cfg.entry).toBe("src/main.ts");
    expect(cfg.outDir).toBe("dist");
  });
});

// ---------------------------------------------------------------------------
// buildForPlatform
// ---------------------------------------------------------------------------

describe("buildForPlatform", () => {
  it("returns success=true for ios platform", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "ios" }));
    const result: BuildResult = await buildForPlatform(cfg);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns success=true for android platform", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "android" }));
    const result = await buildForPlatform(cfg);
    expect(result.success).toBe(true);
  });

  it("returns success=true for both platforms", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "both" }));
    const result = await buildForPlatform(cfg);
    expect(result.success).toBe(true);
  });

  it("produces a JS bundle artifact for ios", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "ios" }));
    const result = await buildForPlatform(cfg);
    const bundles = result.artifacts.filter((a) => a.type === "bundle" && a.platform === "ios");
    expect(bundles.length).toBeGreaterThan(0);
    expect(bundles[0]!.path).toMatch(/\.jsbundle/);
  });

  it("produces a JS bundle artifact for android", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "android" }));
    const result = await buildForPlatform(cfg);
    const bundles = result.artifacts.filter((a) => a.type === "bundle" && a.platform === "android");
    expect(bundles.length).toBeGreaterThan(0);
    expect(bundles[0]!.path).toMatch(/bundle/);
  });

  it("emits a sourcemap artifact when sourcemap=true", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ sourcemap: true }));
    const result = await buildForPlatform(cfg);
    const maps = result.artifacts.filter((a) => a.path.endsWith(".map"));
    expect(maps.length).toBeGreaterThan(0);
  });

  it("does NOT emit a sourcemap artifact when sourcemap=false", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ sourcemap: false }));
    const result = await buildForPlatform(cfg);
    const maps = result.artifacts.filter((a) => a.path.endsWith(".map"));
    expect(maps).toHaveLength(0);
  });

  it("minified bundle is smaller than non-minified bundle", async () => {
    const minCfg = createNativeBuildConfig(baseOptions({ minify: true }));
    const normalCfg = createNativeBuildConfig(baseOptions({ minify: false }));

    const minResult = await buildForPlatform(minCfg);
    const normalResult = await buildForPlatform(normalCfg);

    const minBundle = minResult.artifacts.find((a) => a.type === "bundle" && !a.path.endsWith(".map"));
    const normalBundle = normalResult.artifacts.find((a) => a.type === "bundle" && !a.path.endsWith(".map"));

    expect(minBundle!.size).toBeLessThan(normalBundle!.size);
  });

  it("collects asset artifacts (images, fonts)", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "ios" }));
    const result = await buildForPlatform(cfg);
    const assets = result.artifacts.filter((a) => a.type === "asset");
    expect(assets.length).toBeGreaterThan(0);
  });

  it("includes native config artifacts for ios", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "ios" }));
    const result = await buildForPlatform(cfg);
    const configs = result.artifacts.filter((a) => a.type === "config" && a.platform === "ios");
    expect(configs.length).toBeGreaterThan(0);
  });

  it("includes native config artifacts for android", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "android" }));
    const result = await buildForPlatform(cfg);
    const configs = result.artifacts.filter((a) => a.type === "config" && a.platform === "android");
    expect(configs.length).toBeGreaterThan(0);
  });

  it("duration is a non-negative number", async () => {
    const cfg = createNativeBuildConfig(baseOptions());
    const result = await buildForPlatform(cfg);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("'both' build produces artifacts for ios AND android", async () => {
    const cfg = createNativeBuildConfig(baseOptions({ platform: "both" }));
    const result = await buildForPlatform(cfg);
    const iosBundles = result.artifacts.filter((a) => a.type === "bundle" && a.platform === "ios");
    const androidBundles = result.artifacts.filter((a) => a.type === "bundle" && a.platform === "android");
    expect(iosBundles.length).toBeGreaterThan(0);
    expect(androidBundles.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// createOTAManager
// ---------------------------------------------------------------------------

describe("createOTAManager", () => {
  let manager: OTAManager;

  beforeEach(() => {
    manager = createOTAManager({ updateUrl: "https://updates.example.com/ota", channel: "production" });
  });

  it("throws when updateUrl is empty", () => {
    expect(() => createOTAManager({ updateUrl: "" })).toThrow();
  });

  it("getCurrentVersion returns initial version string", () => {
    expect(manager.getCurrentVersion()).toBe("1.0.0");
  });

  it("checkForUpdate returns an object with 'available' boolean", async () => {
    const result = await manager.checkForUpdate();
    expect(typeof result.available).toBe("boolean");
  });

  it("checkForUpdate returns available=true for staging channel", async () => {
    const stagingManager = createOTAManager({
      updateUrl: "https://updates.example.com/ota",
      channel: "staging",
    });
    const result = await stagingManager.checkForUpdate();
    expect(result.available).toBe(true);
  });

  it("checkForUpdate includes version and downloadUrl when available", async () => {
    const stagingManager = createOTAManager({
      updateUrl: "https://updates.example.com/ota",
      channel: "staging",
    });
    const result = await stagingManager.checkForUpdate();
    expect(result.version).toBeDefined();
    expect(result.downloadUrl).toBeDefined();
    expect(result.downloadUrl).toContain("https://");
  });

  it("downloadUpdate returns success=false for invalid URL", async () => {
    const result = await manager.downloadUpdate("not-a-url");
    expect(result.success).toBe(false);
  });

  it("downloadUpdate returns success=true for valid URL", async () => {
    const result = await manager.downloadUpdate("https://updates.example.com/ota/production/1.0.1/bundle.js");
    expect(result.success).toBe(true);
  });

  it("downloadUpdate returns a bundlePath on success", async () => {
    const result = await manager.downloadUpdate("https://updates.example.com/ota/production/1.0.1/bundle.js");
    expect(result.bundlePath).toBeDefined();
    expect(typeof result.bundlePath).toBe("string");
  });

  it("applyUpdate returns success=true with a valid bundlePath", async () => {
    const result = await manager.applyUpdate("/tmp/ota-updates/bundle.js");
    expect(result.success).toBe(true);
  });

  it("applyUpdate sets restartRequired=true", async () => {
    const result = await manager.applyUpdate("/tmp/ota-updates/bundle.js");
    expect(result.restartRequired).toBe(true);
  });

  it("applyUpdate returns success=false for empty bundlePath", async () => {
    const result = await manager.applyUpdate("");
    expect(result.success).toBe(false);
  });

  it("getCurrentVersion updates after applyUpdate", async () => {
    await manager.applyUpdate("/tmp/ota-updates/1.0.1/bundle.js");
    expect(manager.getCurrentVersion()).toBe("1.0.1");
  });

  it("rollback returns success=false when no update has been applied", async () => {
    const result = await manager.rollback();
    expect(result.success).toBe(false);
  });

  it("rollback returns success=true after applying an update", async () => {
    await manager.applyUpdate("/tmp/ota-updates/1.0.1/bundle.js");
    const result = await manager.rollback();
    expect(result.success).toBe(true);
  });

  it("rollback restores the previous version", async () => {
    const versionBefore = manager.getCurrentVersion();
    await manager.applyUpdate("/tmp/ota-updates/1.0.1/bundle.js");
    await manager.rollback();
    expect(manager.getCurrentVersion()).toBe(versionBefore);
  });

  it("double rollback (after a single update) returns success=false", async () => {
    await manager.applyUpdate("/tmp/ota-updates/1.0.1/bundle.js");
    await manager.rollback();
    const secondRollback = await manager.rollback();
    expect(secondRollback.success).toBe(false);
  });

  it("uses default channel 'production' when channel is not supplied", async () => {
    const defaultManager = createOTAManager({ updateUrl: "https://updates.example.com/ota" });
    // Check doesn't throw and returns a valid result
    const result = await defaultManager.checkForUpdate();
    expect(typeof result.available).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// generateNativeProject
// ---------------------------------------------------------------------------

describe("generateNativeProject", () => {
  const config: NativeBuildConfig = createNativeBuildConfig(baseOptions({ platform: "ios" }));

  it("generates ios project structure with 'ios' platform field", () => {
    const project: NativeProjectStructure = generateNativeProject("ios", config);
    expect(project.platform).toBe("ios");
  });

  it("generates android project structure with 'android' platform field", () => {
    const project = generateNativeProject("android", config);
    expect(project.platform).toBe("android");
  });

  it("iOS project includes Info.plist file", () => {
    const project = generateNativeProject("ios", config);
    const infoPlist = project.files.find((f) => f.path.includes("Info.plist"));
    expect(infoPlist).toBeDefined();
  });

  it("iOS project Info.plist content contains CFBundleDisplayName", () => {
    const project = generateNativeProject("ios", config);
    const infoPlist = project.files.find((f) => f.path.includes("Info.plist"));
    expect(infoPlist!.content).toContain("CFBundleDisplayName");
  });

  it("iOS project includes Podfile", () => {
    const project = generateNativeProject("ios", config);
    const podfile = project.files.find((f) => f.path.includes("Podfile"));
    expect(podfile).toBeDefined();
  });

  it("iOS project Podfile content contains 'platform :ios'", () => {
    const project = generateNativeProject("ios", config);
    const podfile = project.files.find((f) => f.path.includes("Podfile"));
    expect(podfile!.content).toContain("platform :ios");
  });

  it("Android project includes build.gradle", () => {
    const project = generateNativeProject("android", config);
    const gradle = project.files.find((f) => f.path.includes("build.gradle"));
    expect(gradle).toBeDefined();
  });

  it("Android project build.gradle contains 'com.android.application'", () => {
    const project = generateNativeProject("android", config);
    const gradle = project.files.find((f) => f.path.includes("build.gradle"));
    expect(gradle!.content).toContain("com.android.application");
  });

  it("Android project includes AndroidManifest.xml", () => {
    const project = generateNativeProject("android", config);
    const manifest = project.files.find((f) => f.path.includes("AndroidManifest.xml"));
    expect(manifest).toBeDefined();
  });

  it("Android project AndroidManifest.xml contains '<manifest'", () => {
    const project = generateNativeProject("android", config);
    const manifest = project.files.find((f) => f.path.includes("AndroidManifest.xml"));
    expect(manifest!.content).toContain("<manifest");
  });

  it("generated files array is non-empty for ios", () => {
    const project = generateNativeProject("ios", config);
    expect(project.files.length).toBeGreaterThan(0);
  });

  it("generated files array is non-empty for android", () => {
    const project = generateNativeProject("android", config);
    expect(project.files.length).toBeGreaterThan(0);
  });

  it("all generated files have non-empty path and content", () => {
    for (const platform of ["ios", "android"] as const) {
      const project = generateNativeProject(platform, config);
      for (const file of project.files) {
        expect(file.path.length).toBeGreaterThan(0);
        expect(file.content.length).toBeGreaterThan(0);
      }
    }
  });
});
