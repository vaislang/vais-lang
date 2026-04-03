import type {
  VaisXPlugin,
  ResolveIdResult,
  LoadResult,
  TransformResult,
  BuildStartOptions,
} from "./types.js";

/**
 * Normalize a LoadResult/TransformResult to its code string.
 */
function toCode(result: LoadResult | TransformResult): string {
  if (typeof result === "string") {
    return result;
  }
  return result.code;
}

/**
 * Normalize a TransformResult to a full object form.
 */
function toTransformObject(
  result: TransformResult
): { code: string; map?: string | null; meta?: Record<string, unknown> } {
  if (typeof result === "string") {
    return { code: result };
  }
  return result;
}

/**
 * Sort plugins by enforce order: pre → normal → post.
 */
function sortPlugins(plugins: VaisXPlugin[]): VaisXPlugin[] {
  const pre = plugins.filter((p) => p.enforce === "pre");
  const normal = plugins.filter((p) => p.enforce === undefined);
  const post = plugins.filter((p) => p.enforce === "post");
  return [...pre, ...normal, ...post];
}

/**
 * PluginContainer manages a collection of VaisX plugins and orchestrates
 * hook invocation in the correct order.
 */
export class PluginContainer {
  /** Sorted plugins: pre → normal → post */
  readonly plugins: VaisXPlugin[];

  constructor(plugins: VaisXPlugin[]) {
    this.plugins = sortPlugins(plugins);
  }

  /**
   * Call buildStart on all plugins sequentially.
   */
  async buildStart(options?: BuildStartOptions): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.buildStart) {
        await plugin.buildStart(options);
      }
    }
  }

  /**
   * Call buildEnd on all plugins sequentially.
   */
  async buildEnd(error?: Error): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.buildEnd) {
        await plugin.buildEnd(error);
      }
    }
  }

  /**
   * Call resolveId hooks sequentially.
   * Returns the first non-null result, or null if no plugin resolves.
   */
  async resolveId(
    source: string,
    importer?: string
  ): Promise<ResolveIdResult | null> {
    for (const plugin of this.plugins) {
      if (plugin.resolveId) {
        const result = importer !== undefined
          ? await plugin.resolveId(source, importer)
          : await plugin.resolveId(source);
        if (result != null) {
          return result;
        }
      }
    }
    return null;
  }

  /**
   * Call load hooks sequentially.
   * Returns the first non-null result, or null if no plugin loads.
   */
  async load(id: string): Promise<LoadResult | null> {
    for (const plugin of this.plugins) {
      if (plugin.load) {
        const result = await plugin.load(id);
        if (result != null) {
          return result;
        }
      }
    }
    return null;
  }

  /**
   * Call transform hooks as a chain.
   * Each plugin receives the output of the previous transform.
   * Returns the final transformed result, or null if no plugin transforms.
   */
  async transform(
    code: string,
    id: string
  ): Promise<TransformResult | null> {
    let currentCode = code;
    let currentMap: string | null | undefined;
    let currentMeta: Record<string, unknown> | undefined;
    let transformed = false;

    for (const plugin of this.plugins) {
      if (plugin.transform) {
        const result = await plugin.transform(currentCode, id);
        if (result != null) {
          transformed = true;
          const obj = toTransformObject(result);
          currentCode = obj.code;
          currentMap = obj.map;
          currentMeta = obj.meta;
        }
      }
    }

    if (!transformed) {
      return null;
    }

    return {
      code: currentCode,
      map: currentMap,
      meta: currentMeta,
    };
  }
}
