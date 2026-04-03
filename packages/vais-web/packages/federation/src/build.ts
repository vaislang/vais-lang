/**
 * Build integration for @vaisx/federation.
 *
 * Provides utilities for:
 *  - createFederationBuildPlugin: build plugin with manifest generation
 *  - generateExposeMap: expose config → module map
 *  - resolveSharedDeps: auto-detect shared deps from package.json
 *  - validateFederationConfig: validate federation config
 *  - serializeManifest: JSON serialization
 *  - parseManifest: JSON parsing & validation
 */

import type { FederationManifest, RemoteConfig, SharedConfig, SharedDependencyConfig } from "./types.js";

// ─── Build Config ─────────────────────────────────────────────────────────────

/**
 * Configuration for a single exposed module in the build.
 */
export interface ExposeConfig {
  /** Module path key (e.g. "./Button"). */
  key: string;
  /** Local file path to the module (e.g. "./src/components/Button.tsx"). */
  path: string;
}

/**
 * Build-time federation configuration.
 */
export interface FederationBuildConfig {
  /** Name of the federated application. */
  name: string;
  /** Version of the build output. */
  version?: string;
  /** List of modules to expose. */
  exposes?: ExposeConfig[];
  /** Remote applications this build depends on. */
  remotes?: RemoteConfig[];
  /** Shared dependency configuration. */
  shared?: SharedConfig;
  /** Public path prefix for the generated assets. */
  publicPath?: string;
}

// ─── Build Result ─────────────────────────────────────────────────────────────

/**
 * Output chunk produced by a build.
 */
export interface BuildChunk {
  /** Filename of the output chunk. */
  fileName: string;
  /** Size of the chunk in bytes. */
  size?: number;
  /** Whether this is an entry chunk. */
  isEntry?: boolean;
}

/**
 * Result produced by a build process.
 */
export interface BuildResult {
  /** All output chunks. */
  chunks: BuildChunk[];
  /** Additional metadata produced by the build. */
  meta?: Record<string, unknown>;
}

// ─── Expose Map ───────────────────────────────────────────────────────────────

/**
 * A resolved entry in an expose map.
 */
export interface ExposeMapEntry {
  /** The expose key (e.g. "./Button"). */
  key: string;
  /** The resolved local path. */
  path: string;
  /** The normalized module name (without leading "./" prefix). */
  moduleName: string;
}

// ─── Build Plugin ─────────────────────────────────────────────────────────────

/**
 * A federation build plugin instance returned by createFederationBuildPlugin.
 */
export interface FederationBuildPlugin {
  /** Plugin name identifier. */
  name: string;

  /**
   * Generate a FederationManifest from a build result.
   *
   * @param buildResult - The output of the build process.
   * @returns A fully populated FederationManifest.
   */
  generateManifest(buildResult: BuildResult): FederationManifest;

  /**
   * Get the expose map derived from the build config.
   */
  exposeMap: ExposeMapEntry[];

  /**
   * The underlying build config this plugin was created with.
   */
  config: FederationBuildConfig;
}

// ─── Manifest extended with publicPath and exposes ───────────────────────────

/**
 * Extended FederationManifest produced by the build plugin.
 * Adds `publicPath` and `exposes` fields beyond the base FederationManifest.
 */
export interface BuildFederationManifest extends FederationManifest {
  /** Public path prefix for assets. */
  publicPath: string;
  /**
   * Map of expose key → local module path.
   * e.g. { "./Button": "./src/components/Button.tsx" }
   */
  exposes: Record<string, string>;
}

// ─── createFederationBuildPlugin ─────────────────────────────────────────────

/**
 * Create a federation build plugin for the given config.
 *
 * The plugin provides manifest generation and expose map utilities
 * that can be wired into any build tool (Vite, Rollup, webpack, etc.).
 *
 * @param config - Federation build configuration.
 * @returns A FederationBuildPlugin instance.
 *
 * @example
 * const plugin = createFederationBuildPlugin({
 *   name: "shop",
 *   version: "1.0.0",
 *   exposes: [{ key: "./Cart", path: "./src/Cart.tsx" }],
 *   shared: { react: { singleton: true, requiredVersion: "^18.0.0" } },
 * });
 *
 * const manifest = plugin.generateManifest(buildResult);
 */
export function createFederationBuildPlugin(
  config: FederationBuildConfig,
): FederationBuildPlugin {
  // Validate config on creation.
  validateFederationConfig(config);

  const exposeMap = generateExposeMap(config);

  function generateManifest(buildResult: BuildResult): BuildFederationManifest {
    const modules = exposeMap.map((e) => e.key);

    // Derive exposes record from exposeMap.
    const exposes: Record<string, string> = {};
    for (const entry of exposeMap) {
      exposes[entry.key] = entry.path;
    }

    // Include chunk file names in meta if available.
    const chunkFileNames = buildResult.chunks.map((c) => c.fileName);

    return {
      name: config.name,
      version: config.version ?? "0.0.0",
      modules,
      exposes,
      remotes: config.remotes ?? [],
      shared: config.shared ?? {},
      publicPath: config.publicPath ?? "/",
      // Attach build chunk info as part of shared metadata for diagnostic purposes.
      // (Not part of the base FederationManifest, stored via the modules field
      //  which already carries the expose keys.)
      ...(chunkFileNames.length > 0 ? { chunks: chunkFileNames } : {}),
    } as BuildFederationManifest;
  }

  return {
    name: `vaisx:federation:${config.name}`,
    generateManifest,
    exposeMap,
    config,
  };
}

// ─── generateExposeMap ────────────────────────────────────────────────────────

/**
 * Derive an ordered expose map from a FederationBuildConfig.
 *
 * Each ExposeConfig entry is normalized into an ExposeMapEntry that carries
 * the original key, the local path, and a cleaned module name.
 *
 * @param config - Build config containing optional `exposes` list.
 * @returns Array of ExposeMapEntry items in declaration order.
 *
 * @example
 * generateExposeMap({ name: "shop", exposes: [{ key: "./Cart", path: "./src/Cart.tsx" }] });
 * // → [{ key: "./Cart", path: "./src/Cart.tsx", moduleName: "Cart" }]
 */
export function generateExposeMap(config: FederationBuildConfig): ExposeMapEntry[] {
  if (!config.exposes || config.exposes.length === 0) {
    return [];
  }

  return config.exposes.map((expose) => {
    // Normalize the key: strip leading "./" and any file extension for the module name.
    const withoutLeading = expose.key.replace(/^\.\//, "");
    const moduleName = withoutLeading.replace(/\.[^./]+$/, "");

    return {
      key: expose.key,
      path: expose.path,
      moduleName,
    };
  });
}

// ─── resolveSharedDeps ────────────────────────────────────────────────────────

/**
 * Shape of a minimal package.json structure used for shared dep resolution.
 */
export interface PackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Resolve shared dependencies from a package.json, merging with explicit config.
 *
 * The function reads `dependencies` and `peerDependencies` from the supplied
 * packageJson and produces a SharedConfig. An explicit `config.shared` entry
 * always wins over an auto-detected version.
 *
 * @param packageJson - The package.json contents to inspect.
 * @param config      - Build config whose `shared` field takes precedence.
 * @returns A merged SharedConfig map.
 *
 * @example
 * resolveSharedDeps(
 *   { dependencies: { react: "^18.2.0" } },
 *   { name: "shop", shared: { react: { singleton: true } } },
 * );
 * // → { react: { singleton: true, requiredVersion: "^18.2.0" } }
 */
export function resolveSharedDeps(
  packageJson: PackageJson,
  config: FederationBuildConfig,
): SharedConfig {
  const result: SharedConfig = {};

  // Collect versions from dependencies and peerDependencies.
  const allDeps: Record<string, string> = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.peerDependencies ?? {}),
  };

  for (const [pkgName, version] of Object.entries(allDeps)) {
    result[pkgName] = {
      requiredVersion: version,
    };
  }

  // Merge explicit config.shared on top — explicit entries take full precedence.
  if (config.shared) {
    for (const [pkgName, sharedCfg] of Object.entries(config.shared)) {
      const existing = result[pkgName];
      if (existing) {
        // Preserve auto-detected requiredVersion when not explicitly set.
        result[pkgName] = {
          requiredVersion: existing.requiredVersion,
          ...sharedCfg,
        };
      } else {
        result[pkgName] = { ...sharedCfg };
      }
    }
  }

  return result;
}

// ─── validateFederationConfig ─────────────────────────────────────────────────

/**
 * Validation error thrown by validateFederationConfig.
 */
export class FederationConfigError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "FederationConfigError";
  }
}

/**
 * Validate a FederationBuildConfig and throw FederationConfigError on failure.
 *
 * Rules enforced:
 *  - `name` must be a non-empty string.
 *  - `version`, if provided, must match semver X.Y.Z.
 *  - Each expose entry must have a non-empty `key` and `path`.
 *  - Each remote entry must have `name`, `url`, and `modules`.
 *  - `publicPath`, if provided, must be a non-empty string.
 *
 * @param config - The config to validate.
 * @throws FederationConfigError when validation fails.
 */
export function validateFederationConfig(config: FederationBuildConfig): void {
  if (!config.name || typeof config.name !== "string" || config.name.trim() === "") {
    throw new FederationConfigError(
      'FederationBuildConfig.name must be a non-empty string.',
      "name",
    );
  }

  if (config.version !== undefined) {
    if (typeof config.version !== "string" || !/^\d+\.\d+\.\d+/.test(config.version)) {
      throw new FederationConfigError(
        `FederationBuildConfig.version must be a semver string (X.Y.Z), got: "${config.version}".`,
        "version",
      );
    }
  }

  if (config.exposes) {
    for (let i = 0; i < config.exposes.length; i++) {
      const expose = config.exposes[i];
      if (!expose.key || expose.key.trim() === "") {
        throw new FederationConfigError(
          `exposes[${i}].key must be a non-empty string.`,
          `exposes[${i}].key`,
        );
      }
      if (!expose.path || expose.path.trim() === "") {
        throw new FederationConfigError(
          `exposes[${i}].path must be a non-empty string.`,
          `exposes[${i}].path`,
        );
      }
    }
  }

  if (config.remotes) {
    for (let i = 0; i < config.remotes.length; i++) {
      const remote = config.remotes[i];
      if (!remote.name || remote.name.trim() === "") {
        throw new FederationConfigError(
          `remotes[${i}].name must be a non-empty string.`,
          `remotes[${i}].name`,
        );
      }
      if (!remote.url || remote.url.trim() === "") {
        throw new FederationConfigError(
          `remotes[${i}].url must be a non-empty string.`,
          `remotes[${i}].url`,
        );
      }
      if (!Array.isArray(remote.modules)) {
        throw new FederationConfigError(
          `remotes[${i}].modules must be an array.`,
          `remotes[${i}].modules`,
        );
      }
    }
  }

  if (config.publicPath !== undefined) {
    if (typeof config.publicPath !== "string" || config.publicPath.trim() === "") {
      throw new FederationConfigError(
        'FederationBuildConfig.publicPath must be a non-empty string.',
        "publicPath",
      );
    }
  }
}

// ─── serializeManifest ────────────────────────────────────────────────────────

/**
 * Serialize a FederationManifest (or BuildFederationManifest) to a JSON string.
 *
 * The output is pretty-printed with 2-space indentation for readability.
 *
 * @param manifest - The manifest to serialize.
 * @returns A JSON string.
 *
 * @example
 * const json = serializeManifest(manifest);
 * // '{\n  "name": "shop",\n  ...\n}'
 */
export function serializeManifest(manifest: FederationManifest): string {
  return JSON.stringify(manifest, null, 2);
}

// ─── parseManifest ────────────────────────────────────────────────────────────

/**
 * Error thrown when parseManifest encounters invalid JSON or a missing field.
 */
export class ManifestParseError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ManifestParseError";
  }
}

/**
 * Parse and validate a JSON string into a FederationManifest.
 *
 * Required fields: `name`, `version`, `modules`, `remotes`, `shared`.
 *
 * @param json - Raw JSON string to parse.
 * @returns A validated FederationManifest.
 * @throws ManifestParseError when JSON is malformed or required fields are missing.
 *
 * @example
 * const manifest = parseManifest('{"name":"shop","version":"1.0.0","modules":[],...}');
 */
export function parseManifest(json: string): FederationManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ManifestParseError("Failed to parse manifest JSON: invalid JSON syntax.");
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ManifestParseError("Manifest must be a JSON object.");
  }

  const obj = raw as Record<string, unknown>;

  // Validate required fields.
  if (typeof obj["name"] !== "string" || (obj["name"] as string).trim() === "") {
    throw new ManifestParseError('Manifest field "name" must be a non-empty string.', "name");
  }

  if (typeof obj["version"] !== "string" || (obj["version"] as string).trim() === "") {
    throw new ManifestParseError(
      'Manifest field "version" must be a non-empty string.',
      "version",
    );
  }

  if (!Array.isArray(obj["modules"])) {
    throw new ManifestParseError('Manifest field "modules" must be an array.', "modules");
  }

  if (!Array.isArray(obj["remotes"])) {
    throw new ManifestParseError('Manifest field "remotes" must be an array.', "remotes");
  }

  if (typeof obj["shared"] !== "object" || obj["shared"] === null || Array.isArray(obj["shared"])) {
    throw new ManifestParseError(
      'Manifest field "shared" must be an object.',
      "shared",
    );
  }

  // Validate remotes array entries.
  const remotes = obj["remotes"] as unknown[];
  for (let i = 0; i < remotes.length; i++) {
    const r = remotes[i];
    if (typeof r !== "object" || r === null) {
      throw new ManifestParseError(`Manifest remotes[${i}] must be an object.`, `remotes[${i}]`);
    }
    const rObj = r as Record<string, unknown>;
    if (typeof rObj["name"] !== "string") {
      throw new ManifestParseError(
        `Manifest remotes[${i}].name must be a string.`,
        `remotes[${i}].name`,
      );
    }
    if (typeof rObj["url"] !== "string") {
      throw new ManifestParseError(
        `Manifest remotes[${i}].url must be a string.`,
        `remotes[${i}].url`,
      );
    }
    if (!Array.isArray(rObj["modules"])) {
      throw new ManifestParseError(
        `Manifest remotes[${i}].modules must be an array.`,
        `remotes[${i}].modules`,
      );
    }
  }

  // Validate shared entries.
  const shared = obj["shared"] as Record<string, unknown>;
  for (const [pkgName, sharedVal] of Object.entries(shared)) {
    if (typeof sharedVal !== "object" || sharedVal === null) {
      throw new ManifestParseError(
        `Manifest shared["${pkgName}"] must be an object.`,
        `shared.${pkgName}`,
      );
    }
  }

  return {
    name: obj["name"] as string,
    version: obj["version"] as string,
    modules: obj["modules"] as string[],
    remotes: obj["remotes"] as RemoteConfig[],
    shared: obj["shared"] as SharedConfig,
  };
}

// ─── Re-export extended types for consumers ───────────────────────────────────

export type { FederationManifest, SharedConfig, SharedDependencyConfig, RemoteConfig };
