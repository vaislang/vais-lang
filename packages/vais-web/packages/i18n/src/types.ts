/**
 * Represents a locale identifier (e.g. "en", "ko", "zh-TW").
 */
export type Locale = string;

/**
 * A plural message with ICU-like zero/one/other forms.
 */
export interface PluralMessages {
  zero?: string;
  one: string;
  other: string;
}

/**
 * A message bundle value can be a plain string, a nested bundle, or a plural
 * message object.
 */
export type MessageBundleValue = string | MessageBundle | PluralMessages;

/**
 * A hierarchical map of translation keys to their values.
 */
export interface MessageBundle {
  [key: string]: MessageBundleValue;
}

/**
 * Options used when creating an I18n instance.
 */
export interface I18nOptions {
  /** The locale to use when a translation is missing. */
  defaultLocale: Locale;
  /** All supported locales. */
  locales: Locale[];
  /** Map of locale codes to their message bundles. */
  messages: Record<Locale, MessageBundle>;
  /** Locale to fall back to when a key is not found in the active locale. */
  fallbackLocale?: Locale;
}

/**
 * Public API of an I18n instance.
 */
export interface I18nInstance {
  /** Currently active locale. */
  locale: Locale;
  /**
   * Translate a dot-separated key, optionally with interpolation params.
   * When `count` is present in params, pluralization is applied automatically.
   */
  t(key: string, params?: Record<string, string | number>): string;
  /** Change the active locale. Throws if the locale is not in the supported list. */
  setLocale(locale: Locale): void;
  /** Return the list of all supported locales. */
  getLocales(): Locale[];
  /**
   * Check whether a translation key exists.
   * @param key   Dot-separated message key.
   * @param locale Locale to check (defaults to the active locale).
   */
  hasMessage(key: string, locale?: Locale): boolean;
}

/**
 * A route augmented with locale information.
 */
export interface LocaleRoute {
  /** Full path including the locale prefix (e.g. "/ko/about"). */
  path: string;
  /** Locale extracted from the path. */
  locale: Locale;
  /** Original path without the locale prefix (e.g. "/about"). */
  originalPath: string;
}

/**
 * Result of Accept-Language header parsing.
 */
export interface AcceptLanguageEntry {
  locale: Locale;
  quality: number;
}

/**
 * Options for the SSR locale helpers.
 */
export interface SsrLocaleOptions {
  /** Cookie name used to persist the user's locale preference. */
  cookieName?: string;
  /** Default locale when nothing else matches. */
  defaultLocale: Locale;
  /** All supported locales. */
  supportedLocales: Locale[];
}
