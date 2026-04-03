/**
 * Result type for resolveId hook.
 * Can be a string (resolved id), or an object with id and optional metadata.
 */
export type ResolveIdResult =
  | string
  | {
      id: string;
      external?: boolean;
      moduleSideEffects?: boolean | null;
      meta?: Record<string, unknown>;
    };

/**
 * Result type for load hook.
 * Can be a string (module code), or an object with code and optional metadata.
 */
export type LoadResult =
  | string
  | {
      code: string;
      map?: string | null;
      meta?: Record<string, unknown>;
    };

/**
 * Result type for transform hook.
 * Can be a string (transformed code), or an object with code and optional source map.
 */
export type TransformResult =
  | string
  | {
      code: string;
      map?: string | null;
      meta?: Record<string, unknown>;
    };

/**
 * Represents a module node in the module graph, used for HMR.
 */
export interface ModuleNode {
  id: string;
  url: string;
  type: "js" | "css";
  importers: Set<ModuleNode>;
  importedModules: Set<ModuleNode>;
  lastHMRTimestamp: number;
  meta?: Record<string, unknown>;
}

/**
 * Context object provided to the handleHotUpdate hook.
 */
export interface HotUpdateContext {
  /** The file that triggered the hot update */
  file: string;
  /** Timestamp of the update */
  timestamp: number;
  /** Modules affected by the update */
  modules: ModuleNode[];
  /** Read the file contents */
  read(): Promise<string>;
  /** The development server instance */
  server: DevServer;
}

/**
 * Minimal dev server interface exposed to plugins.
 */
export interface DevServer {
  /** Root directory of the project */
  root: string;
  /** Module graph */
  moduleGraph: {
    getModuleById(id: string): ModuleNode | undefined;
    getModulesByFile(file: string): Set<ModuleNode> | undefined;
  };
  /** Send HMR update to connected clients */
  ws: {
    send(data: unknown): void;
  };
}

/**
 * Options passed to resolveId hook.
 */
export interface ResolveIdOptions {
  isEntry?: boolean;
  custom?: Record<string, unknown>;
}

/**
 * Options passed to buildStart hook.
 */
export interface BuildStartOptions {
  input?: string | string[] | Record<string, string>;
}

/**
 * The VaisX plugin interface.
 * Plugins can hook into the build pipeline and dev server lifecycle.
 */
export interface VaisXPlugin {
  /** Unique name identifying the plugin */
  name: string;

  /**
   * Execution order relative to other plugins.
   * - "pre": run before normal plugins
   * - "post": run after normal plugins
   * - undefined: normal order
   */
  enforce?: "pre" | "post";

  /**
   * Conditionally apply the plugin.
   * - "build": only during build
   * - "serve": only during dev server
   * - function: called with config and env, return true to apply
   */
  apply?:
    | "build"
    | "serve"
    | ((
        config: Record<string, unknown>,
        env: { command: "build" | "serve"; mode: string }
      ) => boolean);

  // ── Build hooks ────────────────────────────────────────────────

  /**
   * Called at the start of the build.
   * Use this to initialize plugin state or validate options.
   */
  buildStart?(options?: BuildStartOptions): void | Promise<void>;

  /**
   * Called when the build ends.
   * @param error - Set if the build failed
   */
  buildEnd?(error?: Error): void | Promise<void>;

  /**
   * Resolve a module specifier to an absolute path/id.
   * Return null to defer to other plugins or default resolution.
   */
  resolveId?(
    source: string,
    importer?: string,
    options?: ResolveIdOptions
  ): ResolveIdResult | null | undefined | Promise<ResolveIdResult | null | undefined>;

  /**
   * Load the contents of a module by its id.
   * Return null to defer to other plugins or default loading.
   */
  load?(
    id: string
  ): LoadResult | null | undefined | Promise<LoadResult | null | undefined>;

  /**
   * Transform module code.
   * Return null to leave code unchanged.
   */
  transform?(
    code: string,
    id: string
  ): TransformResult | null | undefined | Promise<TransformResult | null | undefined>;

  // ── Dev server hooks ───────────────────────────────────────────

  /**
   * Configure the development server.
   * Return a function to be called after the server starts (post-listen hook).
   */
  configureServer?(server: DevServer): void | (() => void) | Promise<void | (() => void)>;

  /**
   * Called when files change in the dev server.
   * Return a filtered/custom list of modules to update, or void to use defaults.
   */
  handleHotUpdate?(ctx: HotUpdateContext): void | ModuleNode[] | Promise<void | ModuleNode[]>;
}
