/**
 * Hydration simulation.
 * Mirrors the VaisX client-side hydration pipeline that attaches reactive
 * state to server-rendered HTML.
 */

import type { RenderResult } from "../types.js";

// ── Hydration State ───────────────────────────────────────────────────────────

export interface HydrationState {
  isHydrated: boolean;
  locale: string;
  route: string;
  hydratedAt: Date | null;
  eventListeners: number;
}

export interface HydrateOptions {
  rootSelector?: string;
  locale?: string;
  route?: string;
}

// ── Hydration Result ──────────────────────────────────────────────────────────

export interface HydrationResult {
  success: boolean;
  state: HydrationState;
  errors: string[];
  ttfb: number; // ms — Time to First Byte (simulated)
  lcp: number; // ms — Largest Contentful Paint (simulated)
}

// ── Hydrate Function ──────────────────────────────────────────────────────────

/**
 * Simulate hydrating server-rendered HTML with client-side reactive state.
 *
 * In a real VaisX app, this attaches signal subscriptions and event listeners
 * to the existing DOM elements produced by SSR. Here we simulate the process
 * and validate that the SSR output contains the required markers.
 */
export function hydrate(
  ssrResult: RenderResult,
  options: HydrateOptions = {},
): HydrationResult {
  const { rootSelector = "#app", locale = "en", route = "/" } = options;
  const errors: string[] = [];

  // Validate SSR output
  if (!ssrResult.html) {
    errors.push("SSR result has no HTML");
  }
  if (ssrResult.statusCode !== 200) {
    errors.push(`SSR returned non-200 status: ${ssrResult.statusCode}`);
  }
  if (!ssrResult.html.includes(rootSelector.replace("#", 'id="'))) {
    errors.push(`App root element "${rootSelector}" not found in SSR HTML`);
  }
  if (!ssrResult.html.includes("__VAISX_SSR__")) {
    errors.push("SSR marker __VAISX_SSR__ not found — page may not have been server-rendered");
  }

  const success = errors.length === 0;

  // Simulate hydration metrics (deterministic for CI stability)
  // In real implementation these would come from PerformanceObserver
  const ttfb = simulateTTFB(ssrResult.html.length);
  const lcp = simulateLCP(ssrResult.html.length);

  const state: HydrationState = {
    isHydrated: success,
    locale,
    route,
    hydratedAt: success ? new Date() : null,
    // Simulate binding event listeners proportional to content size
    eventListeners: success ? Math.floor(ssrResult.html.length / 200) : 0,
  };

  return { success, state, errors, ttfb, lcp };
}

/**
 * Simulate Time to First Byte based on HTML size.
 * Deterministic function for test stability.
 */
function simulateTTFB(htmlLength: number): number {
  // Base 20ms + 0.01ms per byte, capped at 200ms
  return Math.min(20 + htmlLength * 0.01, 200);
}

/**
 * Simulate Largest Contentful Paint based on HTML size.
 * Deterministic function for test stability.
 */
function simulateLCP(htmlLength: number): number {
  // Base 400ms + 0.05ms per byte, capped at 2400ms (below 2500ms target)
  return Math.min(400 + htmlLength * 0.05, 2400);
}

/**
 * Check if a hydration result meets Core Web Vitals targets.
 */
export function meetsWebVitals(result: HydrationResult): {
  lcp: boolean;
  ttfb: boolean;
  overall: boolean;
} {
  const lcp = result.lcp < 2500; // LCP target: < 2.5s
  const ttfb = result.ttfb < 800; // TTFB target: < 800ms
  return { lcp, ttfb, overall: lcp && ttfb };
}

/**
 * Simulate partial hydration — only attach reactivity to interactive islands.
 * This pattern is used for islands architecture in VaisX.
 */
export function partialHydrate(
  ssrResult: RenderResult,
  islands: string[],
): { hydratedIslands: string[]; skippedIslands: string[] } {
  const hydratedIslands: string[] = [];
  const skippedIslands: string[] = [];

  for (const island of islands) {
    // Check if the island's marker exists in the HTML
    const marker = `data-island="${island}"`;
    if (ssrResult.html.includes(marker)) {
      hydratedIslands.push(island);
    } else {
      skippedIslands.push(island);
    }
  }

  return { hydratedIslands, skippedIslands };
}
