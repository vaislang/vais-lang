import type { RouteManifest, AdapterConfig, AdapterBuildResult } from "../types.js";

export type { RouteManifest, AdapterConfig, AdapterBuildResult };

export interface AdapterContext {
  manifest: RouteManifest;
  config: AdapterConfig;
  outDir: string;
}

export interface ServerOptions {
  port: number;
  host: string;
  /** Directory containing compiled static assets */
  staticDir: string;
  /** Directory containing server-side code */
  serverDir: string;
}

export interface RequestHandlerOptions {
  staticDir: string;
  serverDir: string;
}
