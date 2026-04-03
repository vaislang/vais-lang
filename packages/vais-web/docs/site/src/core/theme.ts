import type { ColorScheme } from "./types.js";

const STORAGE_KEY = "vaisx-docs-theme";
const DATA_ATTR = "data-theme";

/**
 * Read the persisted color scheme from localStorage, or derive
 * it from the OS `prefers-color-scheme` media query.
 */
export function getInitialScheme(): ColorScheme {
  const stored = localStorage.getItem(STORAGE_KEY) as ColorScheme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Apply a color scheme to the document root element and persist it.
 */
export function applyScheme(scheme: ColorScheme): void {
  document.documentElement.setAttribute(DATA_ATTR, scheme);
  localStorage.setItem(STORAGE_KEY, scheme);
}

/**
 * Toggle between light and dark, returning the new scheme.
 */
export function toggleScheme(): ColorScheme {
  const current = document.documentElement.getAttribute(DATA_ATTR) as ColorScheme | null;
  const next: ColorScheme = current === "dark" ? "light" : "dark";
  applyScheme(next);
  return next;
}

/**
 * Initialise the theme toggle button.
 * Reads the persisted or OS-preferred scheme and wires up the button click.
 */
export function initTheme(): void {
  const scheme = getInitialScheme();
  applyScheme(scheme);

  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  updateToggleLabel(btn, scheme);

  btn.addEventListener("click", () => {
    const next = toggleScheme();
    updateToggleLabel(btn, next);
  });
}

function updateToggleLabel(btn: Element, scheme: ColorScheme): void {
  btn.setAttribute("aria-label", scheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  btn.setAttribute("title", scheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  // Unicode icons: moon for dark mode, sun for light mode
  btn.textContent = scheme === "dark" ? "☀" : "☾";
}
