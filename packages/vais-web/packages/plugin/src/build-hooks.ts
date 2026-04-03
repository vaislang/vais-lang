import type { PluginContainer } from "./container.js";

/**
 * Output structure for a single module processed by the build pipeline.
 */
export interface ModuleOutput {
  id: string;
  code: string;
  transformedCode: string;
}

/**
 * Overall output produced by BuildPipeline.run().
 */
export interface BuildOutput {
  modules: Map<string, ModuleOutput>;
}

/**
 * BuildPipeline orchestrates the full build pipeline for a set of entry points
 * by delegating to a PluginContainer for each hook invocation.
 */
export class BuildPipeline {
  private readonly container: PluginContainer;

  constructor(container: PluginContainer) {
    this.container = container;
  }

  /**
   * Run the full build pipeline for the given entry points.
   *
   * Order: buildStart → (resolveId → load → transform) per entry → buildEnd
   *
   * If any entry processing throws, buildEnd is still called with the error.
   */
  async run(entryPoints: string[]): Promise<BuildOutput> {
    const modules = new Map<string, ModuleOutput>();
    let buildError: Error | undefined;

    await this.container.buildStart();

    try {
      for (const entry of entryPoints) {
        const { id, code } = await this.resolveAndLoad(entry);
        const transformedCode = await this.transformCode(code, id);
        modules.set(entry, { id, code, transformedCode });
      }
    } catch (err) {
      buildError = err instanceof Error ? err : new Error(String(err));
    }

    await this.container.buildEnd(buildError);

    if (buildError !== undefined) {
      throw buildError;
    }

    return { modules };
  }

  /**
   * Resolve a module source to its final id and load its code.
   *
   * - resolveId: if the container resolves it, use that id; otherwise fall back
   *   to the original source string.
   * - load: if the container returns code, use it; otherwise use empty string.
   */
  async resolveAndLoad(
    source: string,
    importer?: string
  ): Promise<{ id: string; code: string }> {
    const resolved = await this.container.resolveId(source, importer);

    let id: string;
    if (resolved === null) {
      id = source;
    } else if (typeof resolved === "string") {
      id = resolved;
    } else {
      id = resolved.id;
    }

    const loadResult = await this.container.load(id);
    const code = loadResult === null ? "" : typeof loadResult === "string" ? loadResult : loadResult.code;

    return { id, code };
  }

  /**
   * Transform code through the plugin chain.
   *
   * Returns the transformed code string, or the original code if no plugin
   * transforms it (i.e. container.transform returns null).
   */
  async transformCode(code: string, id: string): Promise<string> {
    const result = await this.container.transform(code, id);
    if (result === null) {
      return code;
    }
    return typeof result === "string" ? result : result.code;
  }
}
