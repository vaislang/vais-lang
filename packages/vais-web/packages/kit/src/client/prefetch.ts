/** Set of already-prefetched URLs to avoid duplicates */
const prefetched = new Set<string>();

/**
 * Prefetch a route's JS module via <link rel="modulepreload">.
 * If the URL has already been prefetched, this is a no-op.
 *
 * @param url - The route URL to prefetch (e.g., "/about")
 */
export function prefetchRoute(url: string): void {
  if (typeof document === "undefined") return;

  // Normalise to path-only
  let path: string;
  try {
    const parsed = new URL(url, window.location.href);
    path = parsed.pathname;
  } catch {
    path = url;
  }

  if (prefetched.has(path)) return;
  prefetched.add(path);

  const link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = path;
  document.head.appendChild(link);
}

/**
 * Determine whether a link element points to an internal route.
 */
function isInternalLink(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute("href");
  if (!href) return false;

  // External protocol
  if (/^[a-z][a-z\d+\-.]*:/i.test(href) && !href.startsWith("/")) {
    try {
      const url = new URL(href);
      return url.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  // Must start with "/" to be a routable path
  return href.startsWith("/");
}

/**
 * Set up automatic prefetching on mouseenter / touchstart for internal links.
 *
 * @param container - The element to observe (default: document.body)
 * @returns A cleanup function that removes the event listeners
 */
export function setupPrefetch(container?: HTMLElement): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const root = container ?? document.body;

  function handleEnter(event: Event): void {
    const anchor = (event.target as Element).closest("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    if (!isInternalLink(anchor)) return;

    const href = anchor.getAttribute("href")!;
    prefetchRoute(href);
  }

  root.addEventListener("mouseenter", handleEnter, true);
  root.addEventListener("touchstart", handleEnter, { passive: true, capture: true });

  return () => {
    root.removeEventListener("mouseenter", handleEnter, true);
    root.removeEventListener("touchstart", handleEnter, true);
  };
}
