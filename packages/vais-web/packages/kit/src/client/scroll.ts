const STORAGE_KEY = "__vaisx_scroll__";

export interface ScrollManager {
  save(key: string): void;
  restore(key: string): void;
  scrollToTop(): void;
}

/**
 * Load the scroll position map from sessionStorage.
 */
function loadMap(): Record<string, { x: number; y: number }> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, { x: number; y: number }>;
  } catch {
    return {};
  }
}

/**
 * Persist the scroll position map to sessionStorage.
 */
function saveMap(map: Record<string, { x: number; y: number }>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors (e.g., private mode quota)
  }
}

/**
 * Create a scroll manager that persists scroll positions across page reloads
 * using sessionStorage.
 */
export function createScrollManager(): ScrollManager {
  return {
    /**
     * Save the current scroll position under the given key.
     */
    save(key: string): void {
      if (typeof window === "undefined") return;
      const map = loadMap();
      map[key] = { x: window.scrollX, y: window.scrollY };
      saveMap(map);
    },

    /**
     * Restore scroll position for the given key.
     * If no position is stored, scrolls to top.
     */
    restore(key: string): void {
      if (typeof window === "undefined") return;
      const map = loadMap();
      const pos = map[key];
      if (pos) {
        window.scrollTo(pos.x, pos.y);
      } else {
        window.scrollTo(0, 0);
      }
    },

    /**
     * Scroll to the top of the page.
     */
    scrollToTop(): void {
      if (typeof window === "undefined") return;
      window.scrollTo(0, 0);
    },
  };
}
