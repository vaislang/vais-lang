import type { Locale, MessageBundle, MessageBundleValue, PluralMessages } from "./types.js";

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Returns true when the value looks like a PluralMessages object (has `one`
 * and `other` string fields).
 */
export function isPluralMessages(value: MessageBundleValue): value is PluralMessages {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v["one"] === "string" && typeof v["other"] === "string";
}

/**
 * Returns true when the value is a nested MessageBundle (plain object that is
 * NOT a plural message).
 */
export function isNestedBundle(value: MessageBundleValue): value is MessageBundle {
  return typeof value === "object" && value !== null && !isPluralMessages(value);
}

// ---------------------------------------------------------------------------
// Key resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a dot-separated key path inside a message bundle.
 * Returns `undefined` when the key does not exist.
 *
 * @example
 * resolveKey({ greeting: { hello: "Hello!" } }, "greeting.hello")
 * // => "Hello!"
 */
export function resolveKey(bundle: MessageBundle, key: string): MessageBundleValue | undefined {
  const segments = key.split(".");
  let current: MessageBundleValue = bundle;

  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;
    if (isPluralMessages(current)) return undefined;
    const next: MessageBundleValue | undefined = (current as MessageBundle)[segment];
    if (next === undefined) return undefined;
    current = next;
  }

  return current;
}

// ---------------------------------------------------------------------------
// Bundle registry
// ---------------------------------------------------------------------------

/**
 * In-memory registry that holds all loaded locale bundles.
 * Keys are locale strings; values are their corresponding MessageBundle.
 */
export class MessageRegistry {
  private bundles = new Map<Locale, MessageBundle>();

  /**
   * Register (or replace) the message bundle for a locale.
   */
  register(locale: Locale, bundle: MessageBundle): void {
    this.bundles.set(locale, bundle);
  }

  /**
   * Retrieve the bundle for a locale.  Returns `undefined` when not loaded.
   */
  get(locale: Locale): MessageBundle | undefined {
    return this.bundles.get(locale);
  }

  /**
   * Check whether a bundle is registered for the given locale.
   */
  has(locale: Locale): boolean {
    return this.bundles.has(locale);
  }

  /**
   * Return all registered locales.
   */
  locales(): Locale[] {
    return Array.from(this.bundles.keys());
  }

  /**
   * Resolve a dot-separated key for the given locale.
   * Returns `undefined` when neither the locale nor the key is found.
   */
  resolve(locale: Locale, key: string): MessageBundleValue | undefined {
    const bundle = this.bundles.get(locale);
    if (!bundle) return undefined;
    return resolveKey(bundle, key);
  }

  /**
   * Check whether a translation key exists for a specific locale.
   */
  hasKey(locale: Locale, key: string): boolean {
    return this.resolve(locale, key) !== undefined;
  }
}

// ---------------------------------------------------------------------------
// Compile-time optimisation: flatten a bundle to dot-key → string map
// ---------------------------------------------------------------------------

/**
 * Flatten a nested MessageBundle into a flat map of dot-separated keys.
 * PluralMessages entries are preserved as-is; nested bundles are expanded.
 *
 * @example
 * flattenBundle({ a: { b: "Hello" } })
 * // => Map { "a.b" => "Hello" }
 */
export function flattenBundle(
  bundle: MessageBundle,
  prefix = "",
): Map<string, string | PluralMessages> {
  const result = new Map<string, string | PluralMessages>();

  for (const [k, v] of Object.entries(bundle)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;

    if (typeof v === "string") {
      result.set(fullKey, v);
    } else if (isPluralMessages(v)) {
      result.set(fullKey, v);
    } else if (isNestedBundle(v)) {
      const nested = flattenBundle(v, fullKey);
      for (const [nk, nv] of nested) {
        result.set(nk, nv);
      }
    }
  }

  return result;
}

/**
 * Build an optimised (pre-flattened) lookup cache for a locale's bundle.
 * This is the compile-time optimisation step — once built the cache is O(1).
 */
export function buildLookupCache(
  bundle: MessageBundle,
): Map<string, string | PluralMessages> {
  return flattenBundle(bundle);
}
