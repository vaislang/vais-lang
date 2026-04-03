import type { MessageBundleValue, PluralMessages } from "./types.js";
import { isPluralMessages } from "./messages.js";

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Replace all `{name}` placeholders in `template` with the corresponding
 * values from `params`.
 *
 * @example
 * interpolate("Hello, {name}!", { name: "World" })
 * // => "Hello, World!"
 */
export function interpolate(
  template: string,
  params: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}

// ---------------------------------------------------------------------------
// Pluralisation
// ---------------------------------------------------------------------------

/**
 * Select the correct plural form for `count`.
 *
 * Rules (ICU-like):
 *   - count === 0 → `zero` when defined, otherwise `other`
 *   - count === 1 → `one`
 *   - otherwise  → `other`
 */
export function selectPlural(plural: PluralMessages, count: number): string {
  if (count === 0 && plural.zero !== undefined) return plural.zero;
  if (count === 1) return plural.one;
  return plural.other;
}

// ---------------------------------------------------------------------------
// Core translate function
// ---------------------------------------------------------------------------

/**
 * Translate a resolved MessageBundleValue given optional params.
 *
 * - If the value is a string, interpolation is applied.
 * - If the value is a PluralMessages object, the correct form is chosen based
 *   on `params.count` (defaults to 1 when omitted), then interpolated.
 * - If the value is a nested bundle or undefined, the `fallback` string is
 *   returned instead.
 *
 * @param value    Resolved message value (may be undefined for missing keys).
 * @param params   Optional interpolation / pluralisation parameters.
 * @param fallback String to return when the value cannot be translated.
 */
export function translateValue(
  value: MessageBundleValue | undefined,
  params: Record<string, string | number> = {},
  fallback: string,
): string {
  if (value === undefined) return fallback;

  if (typeof value === "string") {
    return interpolate(value, params);
  }

  if (isPluralMessages(value)) {
    const count = typeof params["count"] === "number" ? params["count"] : 1;
    const form = selectPlural(value, count);
    return interpolate(form, params);
  }

  // Nested bundle — cannot translate a branch node; return fallback
  return fallback;
}

// ---------------------------------------------------------------------------
// Factory: build a bound t() function for a locale
// ---------------------------------------------------------------------------

import type { MessageRegistry } from "./messages.js";
import type { Locale } from "./types.js";

export interface TranslateOptions {
  locale: Locale;
  fallbackLocale?: Locale;
  registry: MessageRegistry;
}

/**
 * Create a `t()` function bound to the given locale / registry.
 *
 * Resolution order:
 *   1. Active locale
 *   2. Fallback locale (when provided and different from active)
 *   3. Return the raw key as a last resort
 */
export function createTranslator(options: TranslateOptions) {
  const { registry, fallbackLocale } = options;

  return function t(
    key: string,
    params: Record<string, string | number> = {},
    locale: Locale = options.locale,
  ): string {
    // 1. Try the active locale
    const primary = registry.resolve(locale, key);
    if (primary !== undefined) {
      const result = translateValue(primary, params, key);
      if (result !== key) return result;
      // value resolved but might be a branch node — still try fallback
    }

    // 2. Try the fallback locale
    if (fallbackLocale && fallbackLocale !== locale) {
      const fallbackValue = registry.resolve(fallbackLocale, key);
      if (fallbackValue !== undefined) {
        return translateValue(fallbackValue, params, key);
      }
    }

    // 3. Return the key itself
    return key;
  };
}
