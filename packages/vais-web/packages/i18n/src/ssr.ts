import type { AcceptLanguageEntry, Locale, SsrLocaleOptions } from "./types.js";

// ---------------------------------------------------------------------------
// Accept-Language header parsing
// ---------------------------------------------------------------------------

/**
 * Parse an `Accept-Language` HTTP header string into a sorted list of
 * `{ locale, quality }` entries (highest quality first).
 *
 * @example
 * parseAcceptLanguage("en-US,en;q=0.9,ko;q=0.8")
 * // => [
 * //   { locale: "en-US", quality: 1 },
 * //   { locale: "en",    quality: 0.9 },
 * //   { locale: "ko",    quality: 0.8 },
 * // ]
 */
export function parseAcceptLanguage(header: string): AcceptLanguageEntry[] {
  if (!header || header.trim() === "") return [];

  const entries: AcceptLanguageEntry[] = header
    .split(",")
    .map((part) => {
      const [localePart, qPart] = part.trim().split(";");
      const locale = (localePart ?? "").trim();
      let quality = 1;

      if (qPart) {
        const match = qPart.trim().match(/^q=([\d.]+)$/i);
        if (match) {
          quality = parseFloat(match[1] ?? "1");
          if (isNaN(quality)) quality = 1;
        }
      }

      return { locale, quality };
    })
    .filter((e) => e.locale.length > 0);

  // Sort descending by quality
  entries.sort((a, b) => b.quality - a.quality);
  return entries;
}

// ---------------------------------------------------------------------------
// Best-match locale selection
// ---------------------------------------------------------------------------

/**
 * Normalise a locale string to lowercase for comparison.
 */
function normaliseLocale(locale: Locale): string {
  return locale.toLowerCase().replace(/_/g, "-");
}

/**
 * Given a parsed Accept-Language list and the set of supported locales, return
 * the best matching locale.
 *
 * Matching strategy (in priority order):
 *   1. Exact match (case-insensitive)
 *   2. Language-only match  (e.g. "en-US" matches "en")
 *   3. Fallback to `defaultLocale`
 *
 * @example
 * getBestMatchLocale(
 *   [{ locale: "en-US", quality: 1 }, { locale: "ko", quality: 0.9 }],
 *   ["en", "ko"],
 *   "en",
 * )
 * // => "en"
 */
export function getBestMatchLocale(
  entries: AcceptLanguageEntry[],
  supportedLocales: Locale[],
  defaultLocale: Locale,
): Locale {
  const normSupported = supportedLocales.map(normaliseLocale);

  for (const { locale } of entries) {
    const normEntry = normaliseLocale(locale);

    // 1. Exact match
    const exactIdx = normSupported.indexOf(normEntry);
    if (exactIdx !== -1) return supportedLocales[exactIdx]!;

    // 2. Language-only match ("en-US" → "en")
    const lang = normEntry.split("-")[0]!;
    const langIdx = normSupported.indexOf(lang);
    if (langIdx !== -1) return supportedLocales[langIdx]!;

    // 2b. Supported locale starts with the requested language ("zh" → "zh-TW")
    const prefixIdx = normSupported.findIndex((s) => s.startsWith(lang + "-"));
    if (prefixIdx !== -1) return supportedLocales[prefixIdx]!;
  }

  return defaultLocale;
}

// ---------------------------------------------------------------------------
// Server-side locale resolution
// ---------------------------------------------------------------------------

export interface SsrLocaleResult {
  locale: Locale;
  /** `true` when the locale was read from the cookie. */
  fromCookie: boolean;
  /** `true` when the locale was inferred from the Accept-Language header. */
  fromHeader: boolean;
}

/**
 * Resolve the locale for a server-side request.
 *
 * Resolution order:
 *   1. Cookie value (when present and supported)
 *   2. Accept-Language header
 *   3. Default locale
 *
 * @param acceptLanguageHeader Value of the `Accept-Language` request header.
 * @param cookieHeader         Value of the `Cookie` request header.
 * @param options              SSR locale configuration.
 */
export function resolveServerLocale(
  acceptLanguageHeader: string | undefined,
  cookieHeader: string | undefined,
  options: SsrLocaleOptions,
): SsrLocaleResult {
  const { cookieName = "locale", defaultLocale, supportedLocales } = options;

  // 1. Cookie
  if (cookieHeader) {
    const cookieLocale = parseCookieLocale(cookieHeader, cookieName);
    if (cookieLocale && supportedLocales.includes(cookieLocale)) {
      return { locale: cookieLocale, fromCookie: true, fromHeader: false };
    }
  }

  // 2. Accept-Language header
  if (acceptLanguageHeader) {
    const entries = parseAcceptLanguage(acceptLanguageHeader);
    const matched = getBestMatchLocale(entries, supportedLocales, defaultLocale);
    if (matched !== defaultLocale) {
      return { locale: matched, fromCookie: false, fromHeader: true };
    }
  }

  // 3. Default
  return { locale: defaultLocale, fromCookie: false, fromHeader: false };
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Extract a specific cookie value from a raw `Cookie` header string.
 *
 * @example
 * parseCookieLocale("locale=ko; session=abc123", "locale")  // => "ko"
 */
export function parseCookieLocale(
  cookieHeader: string,
  cookieName: string,
): Locale | undefined {
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split("=");
    if (name?.trim() === cookieName && rest.length > 0) {
      return rest.join("=").trim();
    }
  }
  return undefined;
}

/**
 * Build a `Set-Cookie` header value that persists the locale.
 *
 * @example
 * buildLocaleCookie("ko", { cookieName: "locale", maxAgeDays: 365 })
 * // => "locale=ko; Path=/; Max-Age=31536000; SameSite=Lax"
 */
export function buildLocaleCookie(
  locale: Locale,
  options: {
    cookieName?: string;
    maxAgeDays?: number;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  } = {},
): string {
  const {
    cookieName = "locale",
    maxAgeDays = 365,
    secure = false,
    sameSite = "Lax",
  } = options;

  const maxAge = maxAgeDays * 24 * 60 * 60;
  const parts = [
    `${cookieName}=${locale}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    `SameSite=${sameSite}`,
  ];

  if (secure) parts.push("Secure");

  return parts.join("; ");
}
