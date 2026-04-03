import type { Locale, LocaleRoute } from "./types.js";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a path so it always starts with "/" and never ends with "/" (unless
 * it is the root "/").
 */
function normalisePath(path: string): string {
  const withLeading = path.startsWith("/") ? path : `/${path}`;
  return withLeading.length > 1 && withLeading.endsWith("/")
    ? withLeading.slice(0, -1)
    : withLeading;
}

/**
 * Return `true` when `path` starts with the given locale prefix.
 *
 * @example
 * hasLocalePrefix("/ko/about", "ko")  // => true
 * hasLocalePrefix("/about",    "ko")  // => false
 */
export function hasLocalePrefix(path: string, locale: Locale): boolean {
  const norm = normalisePath(path);
  return norm === `/${locale}` || norm.startsWith(`/${locale}/`);
}

/**
 * Add a locale prefix to `path`.
 *
 * @example
 * addLocalePrefix("/about", "ko")  // => "/ko/about"
 * addLocalePrefix("/",      "en")  // => "/en"
 */
export function addLocalePrefix(path: string, locale: Locale): string {
  const norm = normalisePath(path);
  if (norm === "/") return `/${locale}`;
  return `/${locale}${norm}`;
}

/**
 * Remove the locale prefix from `path` and return the locale + original path.
 * Returns `undefined` when none of `locales` match.
 *
 * @example
 * removeLocalePrefix("/ko/about", ["ko", "en"])
 * // => { locale: "ko", originalPath: "/about" }
 */
export function removeLocalePrefix(
  path: string,
  locales: Locale[],
): { locale: Locale; originalPath: string } | undefined {
  const norm = normalisePath(path);

  for (const locale of locales) {
    if (norm === `/${locale}`) {
      return { locale, originalPath: "/" };
    }
    if (norm.startsWith(`/${locale}/`)) {
      return { locale, originalPath: norm.slice(locale.length + 1) };
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Route generation
// ---------------------------------------------------------------------------

/**
 * Generate locale-prefixed variants for every supported locale.
 *
 * @example
 * generateLocaleRoutes("/about", ["en", "ko"])
 * // => [
 * //   { path: "/en/about", locale: "en", originalPath: "/about" },
 * //   { path: "/ko/about", locale: "ko", originalPath: "/about" },
 * // ]
 */
export function generateLocaleRoutes(
  originalPath: string,
  locales: Locale[],
): LocaleRoute[] {
  const norm = normalisePath(originalPath);
  return locales.map((locale) => ({
    path: addLocalePrefix(norm, locale),
    locale,
    originalPath: norm,
  }));
}

// ---------------------------------------------------------------------------
// Locale detection from path
// ---------------------------------------------------------------------------

/**
 * Detect the locale from a URL path.
 * Returns `defaultLocale` when no supported locale prefix is found.
 *
 * @example
 * detectLocaleFromPath("/ko/about", ["en", "ko"], "en")  // => "ko"
 * detectLocaleFromPath("/about",    ["en", "ko"], "en")  // => "en"
 */
export function detectLocaleFromPath(
  path: string,
  locales: Locale[],
  defaultLocale: Locale,
): Locale {
  const result = removeLocalePrefix(path, locales);
  return result ? result.locale : defaultLocale;
}

// ---------------------------------------------------------------------------
// Redirect helpers
// ---------------------------------------------------------------------------

export interface RedirectInfo {
  /** Target URL the client should be redirected to. */
  url: string;
  /** Recommended HTTP status code (301 permanent / 302 temporary). */
  statusCode: 301 | 302;
}

/**
 * Build a redirect URL when the path lacks a locale prefix.
 * Returns `undefined` when no redirect is needed.
 *
 * @example
 * buildLocaleRedirect("/about", ["en", "ko"], "en")
 * // => { url: "/en/about", statusCode: 302 }
 *
 * buildLocaleRedirect("/ko/about", ["en", "ko"], "en")
 * // => undefined  (already has a prefix)
 */
export function buildLocaleRedirect(
  path: string,
  locales: Locale[],
  targetLocale: Locale,
  permanent = false,
): RedirectInfo | undefined {
  const norm = normalisePath(path);
  const existing = removeLocalePrefix(norm, locales);
  if (existing) return undefined; // already prefixed

  return {
    url: addLocalePrefix(norm, targetLocale),
    statusCode: permanent ? 301 : 302,
  };
}

/**
 * Switch the locale prefix in an existing locale-prefixed path.
 * If the path has no locale prefix the new locale is prepended.
 *
 * @example
 * switchLocaleInPath("/ko/about", ["en", "ko"], "en")
 * // => "/en/about"
 */
export function switchLocaleInPath(
  path: string,
  locales: Locale[],
  newLocale: Locale,
): string {
  const norm = normalisePath(path);
  const existing = removeLocalePrefix(norm, locales);
  const originalPath = existing ? existing.originalPath : norm;
  return addLocalePrefix(originalPath, newLocale);
}
