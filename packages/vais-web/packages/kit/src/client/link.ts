import type { Router } from "./navigator.js";

/**
 * Intercept clicks on internal <a> links and delegate to the router.
 *
 * @param router - The router instance to navigate with
 * @param container - The element to listen on (default: document.body)
 * @returns A cleanup function that removes the event listener
 */
export function interceptLinks(
  router: Router,
  container?: HTMLElement
): () => void {
  if (typeof window === "undefined") {
    // SSR — no-op
    return () => {};
  }

  const root = container ?? document.body;

  function handleClick(event: Event): void {
    const e = event as MouseEvent;

    // Skip modified clicks
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // Skip non-left button clicks
    if (e.button !== 0) return;

    // Find nearest <a> ancestor
    const target = (e.target as Element).closest("a");
    if (!target) return;

    const href = target.getAttribute("href");
    if (!href) return;

    // Skip external links, javascript:, mailto:, etc.
    if (!href.startsWith("/") && !href.startsWith("./") && !href.startsWith("../")) {
      try {
        const url = new URL(href);
        if (url.origin !== window.location.origin) return;
      } catch {
        return;
      }
    }

    // Skip target="_blank" or any non-default target
    const targetAttr = target.getAttribute("target");
    if (targetAttr && targetAttr !== "_self") return;

    // Skip download links
    if (target.hasAttribute("download")) return;

    // Skip data-no-intercept
    if (target.hasAttribute("data-no-intercept")) return;

    e.preventDefault();
    void router.navigate(href);
  }

  root.addEventListener("click", handleClick);

  return () => {
    root.removeEventListener("click", handleClick);
  };
}
