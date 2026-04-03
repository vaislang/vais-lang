import type { Locale, MessageBundle } from "./types.js";
import { flattenBundle } from "./messages.js";

// ---------------------------------------------------------------------------
// Used-key tracking
// ---------------------------------------------------------------------------

/**
 * A lightweight tracker that records every translation key accessed at runtime.
 * This is used during development / analysis to discover which keys (and thus
 * which locale bundles) are actually needed.
 */
export class KeyUsageTracker {
  private usedKeys = new Set<string>();

  /** Record that `key` was accessed. */
  track(key: string): void {
    this.usedKeys.add(key);
  }

  /** Return a copy of all tracked keys. */
  getUsedKeys(): Set<string> {
    return new Set(this.usedKeys);
  }

  /** Reset the tracker (useful between test runs). */
  reset(): void {
    this.usedKeys.clear();
  }
}

// ---------------------------------------------------------------------------
// Bundle pruning
// ---------------------------------------------------------------------------

/**
 * Return a new MessageBundle that contains only the entries whose dot-separated
 * keys appear in `usedKeys`.  Nested structure is reconstructed from the flat
 * key set.
 *
 * @example
 * pruneBundle(
 *   { greeting: { hello: "Hi", bye: "Bye" }, footer: "Footer" },
 *   new Set(["greeting.hello"]),
 * )
 * // => { greeting: { hello: "Hi" } }
 */
export function pruneBundle(
  bundle: MessageBundle,
  usedKeys: Set<string>,
): MessageBundle {
  const flat = flattenBundle(bundle);
  const pruned: MessageBundle = {};

  for (const key of usedKeys) {
    const value = flat.get(key);
    if (value === undefined) continue;

    const segments = key.split(".");
    let cursor: MessageBundle = pruned;

    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i]!;
      if (typeof cursor[seg] !== "object") {
        cursor[seg] = {} as MessageBundle;
      }
      cursor = cursor[seg] as MessageBundle;
    }

    const lastSeg = segments[segments.length - 1]!;
    cursor[lastSeg] = value;
  }

  return pruned;
}

// ---------------------------------------------------------------------------
// Locale bundle filtering
// ---------------------------------------------------------------------------

/**
 * Given the full messages map and a set of locale codes that are actually used,
 * return a new messages map containing only those locales.
 *
 * @example
 * filterUsedLocales({ en: {...}, ko: {...}, fr: {...} }, new Set(["en", "ko"]))
 * // => { en: {...}, ko: {...} }
 */
export function filterUsedLocales(
  messages: Record<Locale, MessageBundle>,
  usedLocales: Set<Locale>,
): Record<Locale, MessageBundle> {
  const result: Record<Locale, MessageBundle> = {};
  for (const locale of usedLocales) {
    if (Object.prototype.hasOwnProperty.call(messages, locale)) {
      result[locale] = messages[locale]!;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Build-time optimisation entry point
// ---------------------------------------------------------------------------

export interface TreeShakeResult {
  /** Pruned messages map (only used locales × used keys). */
  messages: Record<Locale, MessageBundle>;
  /** Total number of keys in the original bundles. */
  originalKeyCount: number;
  /** Number of keys retained after pruning. */
  retainedKeyCount: number;
  /** Percentage of keys removed. */
  reductionPercent: number;
}

/**
 * Perform a full tree-shake pass given the complete messages map, the set of
 * locales referenced in the application, and the set of translation keys
 * actually used.
 *
 * When `usedLocales` is empty the `defaultLocale` is always kept.
 * When `usedKeys` is empty the full bundles for retained locales are returned.
 */
export function treeShakeBundles(
  messages: Record<Locale, MessageBundle>,
  usedLocales: Set<Locale>,
  usedKeys: Set<string>,
  defaultLocale: Locale,
): TreeShakeResult {
  // Always keep the default locale
  const effectiveLocales = new Set(usedLocales);
  effectiveLocales.add(defaultLocale);

  // Count total keys in the original bundles
  let originalKeyCount = 0;
  for (const locale of effectiveLocales) {
    const bundle = messages[locale];
    if (bundle) originalKeyCount += flattenBundle(bundle).size;
  }

  const filtered = filterUsedLocales(messages, effectiveLocales);

  // Prune to used keys when provided
  const pruned: Record<Locale, MessageBundle> = {};
  let retainedKeyCount = 0;

  for (const [locale, bundle] of Object.entries(filtered)) {
    const prunedBundle = usedKeys.size > 0 ? pruneBundle(bundle, usedKeys) : bundle;
    pruned[locale] = prunedBundle;
    retainedKeyCount += flattenBundle(prunedBundle).size;
  }

  const reductionPercent =
    originalKeyCount > 0
      ? Math.round(((originalKeyCount - retainedKeyCount) / originalKeyCount) * 100)
      : 0;

  return {
    messages: pruned,
    originalKeyCount,
    retainedKeyCount,
    reductionPercent,
  };
}
