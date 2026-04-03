/**
 * SSG — static path generation and render mode detection.
 */

import type { RouteDefinition, RenderMode } from "../types.js";

export interface StaticPath {
  pattern: string;
  params: Record<string, string>;
  url: string;
}

/**
 * Determine the render mode for a route based on its definition and optional
 * script content (source code of the page component).
 *
 * Rules (from ARCHITECTURE.md 6.3):
 *  1. Has `#[static]` attribute in script → "ssg" (forced)
 *  2. Has server functions (load / actions) → "ssr"
 *  3. Has $state / @click but no server functions → "csr"
 *  4. No server functions AND no dynamic segments → "ssg"
 *  (anything else falls through to "ssr" as the safe default)
 */
export function determineRenderMode(
  route: RouteDefinition,
  scriptContent?: string
): RenderMode {
  const hasDynamicSegment = route.segments.some(
    (s) => s.type === "dynamic" || s.type === "catch-all"
  );

  // 1. Forced SSG via #[static] attribute
  if (scriptContent && scriptContent.includes("#[static]")) {
    return "ssg";
  }

  // 2. Has server functions → SSR
  const hasServerFunctions =
    scriptContent !== undefined &&
    (scriptContent.includes("export async function load(") ||
      scriptContent.includes("export function load(") ||
      scriptContent.includes("export async function action(") ||
      scriptContent.includes("export function action(") ||
      // Vais async function syntax: A F load( / A F action(
      /A\s+F\s+load\s*\(/.test(scriptContent) ||
      /A\s+F\s+action\s*\(/.test(scriptContent) ||
      // Also detect generic "server" attribute markers
      scriptContent.includes("#[server"));

  if (hasServerFunctions) {
    return "ssr";
  }

  // 3. Has reactive/interactive markers but no server functions → CSR
  const hasClientMarkers =
    scriptContent !== undefined &&
    (/\$state\s*\(/.test(scriptContent) ||
      /\$derived\s*\(/.test(scriptContent) ||
      /\$effect\s*\(/.test(scriptContent) ||
      /@\w+/.test(scriptContent) ||
      /:value=/.test(scriptContent) ||
      /:checked=/.test(scriptContent));

  if (hasClientMarkers) {
    return "csr";
  }

  // 4. No server functions AND no dynamic segments → SSG
  if (!hasDynamicSegment) {
    return "ssg";
  }

  // Default: SSR (dynamic route without explicit static paths)
  return "ssr";
}

/**
 * Collect all static paths for a list of routes.
 *
 * - Static routes: returns a single StaticPath with empty params.
 * - Dynamic routes: calls getStaticPaths to expand into individual paths.
 * - Routes that are explicitly SSR (have server functions in script) are skipped.
 *
 * Note: `scriptContent` is not available here, so render mode detection uses
 * only structural information. Dynamic routes without getStaticPaths are skipped
 * because they cannot be statically expanded.
 */
export async function collectStaticPaths(
  routes: RouteDefinition[],
  getStaticPaths?: (pattern: string) => Promise<string[][]>
): Promise<StaticPath[]> {
  const result: StaticPath[] = [];

  for (const route of routes) {
    const hasDynamicSegment = route.segments.some(
      (s) => s.type === "dynamic" || s.type === "catch-all"
    );

    if (!hasDynamicSegment) {
      // Static route — can always be SSG
      result.push({
        pattern: route.pattern,
        params: {},
        url: route.pattern === "" ? "/" : route.pattern,
      });
    } else if (getStaticPaths) {
      // Dynamic route — expand via getStaticPaths
      const paramCombinations = await getStaticPaths(route.pattern);
      for (const combo of paramCombinations) {
        const params = buildParams(route, combo);
        const url = buildUrl(route.pattern, params);
        result.push({ pattern: route.pattern, params, url });
      }
    }
    // Dynamic route without getStaticPaths → cannot expand, skip

    // Recurse into children
    if (route.children.length > 0) {
      const childPaths = await collectStaticPaths(route.children, getStaticPaths);
      result.push(...childPaths);
    }
  }

  return result;
}

/**
 * Build a params record from the dynamic segment names and a list of values.
 */
function buildParams(
  route: RouteDefinition,
  values: string[]
): Record<string, string> {
  const dynamicSegs = route.segments.filter(
    (s) => s.type === "dynamic" || s.type === "catch-all"
  );
  const params: Record<string, string> = {};
  dynamicSegs.forEach((seg, i) => {
    if (values[i] !== undefined) {
      params[seg.value] = values[i];
    }
  });
  return params;
}

/**
 * Replace [param] placeholders in a pattern with actual param values.
 */
function buildUrl(pattern: string, params: Record<string, string>): string {
  let url = pattern;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`[${key}]`, value).replace(`[...${key}]`, value);
  }
  return url;
}
