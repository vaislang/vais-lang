import { initTheme } from "./core/theme.js";
import { initSidebarToggles } from "./core/sidebar.js";

/**
 * Client-side boot — runs on every page.
 * Initialises the theme (dark/light) and sidebar toggle interactions.
 */
function boot(): void {
  initTheme();
  initSidebarToggles();
}

// Run immediately if DOM is already loaded, otherwise wait.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
