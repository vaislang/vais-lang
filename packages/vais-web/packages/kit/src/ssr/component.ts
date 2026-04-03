/**
 * Server/client component detection and rendering.
 *
 * Detection priority (ARCHITECTURE.md 6.4):
 * 1. scriptTag has context="client"  → client
 * 2. scriptTag has context="server":
 *    - scriptContent has $state/$derived/$effect/@event → conflict (compile error)
 *    - Otherwise → server
 * 3. scriptContent has reactive primitives or any event bindings → client (auto-detect)
 * 4. None of the above → server (default)
 */

/**
 * Detect whether a component is a server or client component based on its
 * script content and optional script tag.
 *
 * @param scriptContent - The body of the script block.
 * @param scriptTag - The opening script tag (e.g. `<script context="server">`).
 *                    When provided, tag-based detection (priorities 1-2) runs first.
 */
export function detectComponentType(
  scriptContent: string,
  scriptTag?: string
): "server" | "client" | "conflict" {
  if (scriptTag !== undefined) {
    // Priority 1: explicit context="client" on the script tag
    if (/context\s*=\s*["']client["']/.test(scriptTag)) {
      return "client";
    }

    // Priority 2: explicit context="server" on the script tag
    if (/context\s*=\s*["']server["']/.test(scriptTag)) {
      // Conflict: server context declared but reactive/interactive markers present
      if (/\$state|\$derived|\$effect|@\w+/.test(scriptContent)) {
        return "conflict";
      }
      return "server";
    }
  }

  // Priority 3: reactive primitives, any event binding, or two-way binding
  if (/\$state|\$derived|\$effect|@\w+|:value=|:checked=/.test(scriptContent)) {
    return "client";
  }

  // Priority 4: default → server
  return "server";
}

/**
 * Render a server component — returns the HTML as-is with no JS markers.
 */
export function renderServerComponent(html: string): string {
  return html;
}

/**
 * Render a client component with hydration markers.
 *
 * Wraps the HTML with:
 *   <div data-vx="componentId" data-vx-state="<base64 state>">...</div>
 */
export function renderClientComponent(
  html: string,
  componentId: string,
  state?: Record<string, unknown>
): string {
  const stateJson = JSON.stringify(state ?? {});
  // btoa is available in Node 18+ (global) and browsers
  const base64State = btoa(stateJson);
  return `<div data-vx="${componentId}" data-vx-state="${base64State}">${html}</div>`;
}
