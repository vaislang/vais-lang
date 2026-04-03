// Re-export all public types
export type {
  Locale,
  MessageBundle,
  MessageBundleValue,
  PluralMessages,
  I18nOptions,
  I18nInstance,
  LocaleRoute,
  AcceptLanguageEntry,
  SsrLocaleOptions,
} from "./types.js";

// Messages module
export {
  isPluralMessages,
  isNestedBundle,
  resolveKey,
  MessageRegistry,
  flattenBundle,
  buildLookupCache,
} from "./messages.js";

// Translate module
export { interpolate, selectPlural, translateValue, createTranslator } from "./translate.js";
export type { TranslateOptions } from "./translate.js";

// Router module
export {
  hasLocalePrefix,
  addLocalePrefix,
  removeLocalePrefix,
  generateLocaleRoutes,
  detectLocaleFromPath,
  buildLocaleRedirect,
  switchLocaleInPath,
} from "./router.js";
export type { RedirectInfo } from "./router.js";

// SSR module
export {
  parseAcceptLanguage,
  getBestMatchLocale,
  resolveServerLocale,
  parseCookieLocale,
  buildLocaleCookie,
} from "./ssr.js";
export type { SsrLocaleResult } from "./ssr.js";

// Tree-shake / build optimisation module
export {
  KeyUsageTracker,
  pruneBundle,
  filterUsedLocales,
  treeShakeBundles,
} from "./tree-shake.js";
export type { TreeShakeResult } from "./tree-shake.js";

// ---------------------------------------------------------------------------
// createI18n() factory
// ---------------------------------------------------------------------------

import { MessageRegistry } from "./messages.js";
import { createTranslator } from "./translate.js";
import type { I18nInstance, I18nOptions, Locale } from "./types.js";

/**
 * Create a fully configured I18n instance.
 *
 * @example
 * const i18n = createI18n({
 *   defaultLocale: "en",
 *   locales: ["en", "ko"],
 *   messages: {
 *     en: { greeting: "Hello, {name}!" },
 *     ko: { greeting: "안녕하세요, {name}!" },
 *   },
 * });
 *
 * i18n.t("greeting", { name: "World" });  // => "Hello, World!"
 * i18n.setLocale("ko");
 * i18n.t("greeting", { name: "세계" });    // => "안녕하세요, 세계!"
 */
export function createI18n(options: I18nOptions): I18nInstance {
  const { defaultLocale, locales, messages, fallbackLocale } = options;

  // Validate that the default locale is in the locales list
  if (!locales.includes(defaultLocale)) {
    throw new Error(
      `[vaisx/i18n] defaultLocale "${defaultLocale}" is not included in the locales list.`,
    );
  }

  // Populate the registry
  const registry = new MessageRegistry();
  for (const locale of locales) {
    const bundle = messages[locale];
    if (bundle) registry.register(locale, bundle);
  }

  let currentLocale: Locale = defaultLocale;

  // Cache the translator so it is not re-created on every t() call.
  // The cache is invalidated (and a new translator created) only when
  // setLocale() changes the active locale.
  let cachedTranslator = createTranslator({
    locale: currentLocale,
    fallbackLocale,
    registry,
  });

  // The instance
  const instance: I18nInstance = {
    get locale() {
      return currentLocale;
    },

    t(key: string, params: Record<string, string | number> = {}): string {
      return cachedTranslator(key, params, currentLocale);
    },

    setLocale(locale: Locale): void {
      if (!locales.includes(locale)) {
        throw new Error(
          `[vaisx/i18n] Locale "${locale}" is not in the supported locales list: ${locales.join(", ")}.`,
        );
      }
      currentLocale = locale;
      // Invalidate the translator cache for the new locale.
      cachedTranslator = createTranslator({
        locale: currentLocale,
        fallbackLocale,
        registry,
      });
    },

    getLocales(): Locale[] {
      return [...locales];
    },

    hasMessage(key: string, locale?: Locale): boolean {
      return registry.hasKey(locale ?? currentLocale, key);
    },
  };

  return instance;
}
