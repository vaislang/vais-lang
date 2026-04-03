import type { PluginContainer } from "./container.js";

/**
 * Payload sent to connected HMR clients.
 */
export type HmrPayload = {
  type: "full-reload" | "update";
  path?: string;
  timestamp?: number;
};

/**
 * Minimal dev server interface for DevServerHooks.
 * Provides middleware registration and HMR WebSocket send.
 */
export interface DevServer {
  middlewares: Array<(req: unknown, res: unknown, next: () => void) => void>;
  ws: {
    send(payload: HmrPayload): void;
  };
}

/**
 * Context provided to handleHotUpdate hooks.
 */
export type HotUpdateContext = {
  file: string;
  timestamp: number;
  modules: string[];
};

/**
 * DevServerHooks integrates plugin hooks with the development server.
 * Handles configureServer (middleware registration) and handleHotUpdate (HMR filtering).
 */
export class DevServerHooks {
  private container: PluginContainer;

  constructor(container: PluginContainer) {
    this.container = container;
  }

  /**
   * Call each plugin's configureServer hook sequentially.
   * If a hook returns a function, it is saved as a post-server middleware
   * and called after all plugins have been configured.
   */
  async configureServer(server: DevServer): Promise<void> {
    const postHooks: Array<() => void | Promise<void>> = [];

    for (const plugin of this.container.plugins) {
      if (plugin.configureServer) {
        const result = await plugin.configureServer(server as any);
        if (typeof result === "function") {
          postHooks.push(result);
        }
      }
    }

    for (const hook of postHooks) {
      await hook();
    }
  }

  /**
   * Call each plugin's handleHotUpdate hook sequentially.
   * If a hook returns an array, it replaces the current modules list.
   * Returns the final modules list.
   */
  async handleHotUpdate(ctx: HotUpdateContext): Promise<string[]> {
    let modules = ctx.modules;

    for (const plugin of this.container.plugins) {
      if (plugin.handleHotUpdate) {
        const result = await plugin.handleHotUpdate({ ...ctx, modules } as any);
        if (Array.isArray(result)) {
          modules = result as unknown as string[];
        }
      }
    }

    return modules;
  }
}
