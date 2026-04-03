/**
 * StyleSheet utility for @vaisx/native.
 *
 * Mirrors the React Native StyleSheet API:
 *   - StyleSheet.create()        — register named styles, receive ID map
 *   - StyleSheet.flatten()       — merge style arrays into one object
 *   - StyleSheet.absoluteFill    — { position:"absolute", top:0, … } preset
 *   - StyleSheet.absoluteFillObject — same preset as plain object (no ID)
 */

import type { ViewStyle, TextStyle, ImageStyle, NamedStyles } from "./types.js";

// ---------------------------------------------------------------------------
// Internal registry
// ---------------------------------------------------------------------------

type AnyStyle = ViewStyle & TextStyle & ImageStyle;

/** Registry maps numeric IDs back to their style objects. */
const _registry = new Map<number, AnyStyle>();

/** Monotonically increasing ID counter (starts above 0 so 0 means "no style"). */
let _nextId = 1;

function registerStyle(style: AnyStyle): number {
  const id = _nextId++;
  _registry.set(id, style);
  return id;
}

function resolveStyle(idOrStyle: number | AnyStyle | null | undefined | false): AnyStyle | null {
  if (!idOrStyle && idOrStyle !== 0) return null;
  if (typeof idOrStyle === "number") {
    return _registry.get(idOrStyle) ?? null;
  }
  return idOrStyle as AnyStyle;
}

// ---------------------------------------------------------------------------
// absoluteFill preset
// ---------------------------------------------------------------------------

const _absoluteFillObject: ViewStyle = Object.freeze({
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const);

// Register once so absoluteFill has a stable ID.
const _absoluteFillId = registerStyle(_absoluteFillObject as AnyStyle);

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

/**
 * Register a set of named styles and return an opaque style-ID map.
 *
 * Example:
 * ```ts
 * const styles = StyleSheet.create({
 *   container: { flex: 1, backgroundColor: "#fff" },
 *   text: { fontSize: 16, color: "#333" },
 * });
 * // styles.container === 2  (a number, not the raw object)
 * ```
 */
function create<T extends NamedStyles<T>>(styles: T): { [P in keyof T]: number } {
  const result = {} as { [P in keyof T]: number };

  for (const key of Object.keys(styles) as Array<keyof T>) {
    result[key] = registerStyle(styles[key] as AnyStyle);
  }

  return result;
}

// ---------------------------------------------------------------------------
// flatten
// ---------------------------------------------------------------------------

type FlattenInput =
  | AnyStyle
  | number
  | null
  | undefined
  | false
  | FlattenInput[];

/**
 * Merge one or more style objects (or registered IDs) into a single flat object.
 * Falsy entries and nulls are safely ignored.
 *
 * Example:
 * ```ts
 * const merged = StyleSheet.flatten([styles.base, styles.override, { opacity: 0.5 }]);
 * ```
 */
function flatten(
  styles: FlattenInput
): AnyStyle {
  if (!styles && styles !== 0) return {} as AnyStyle;

  if (Array.isArray(styles)) {
    return styles.reduce<AnyStyle>((acc, item) => {
      const resolved = flatten(item as FlattenInput);
      return { ...acc, ...resolved };
    }, {} as AnyStyle);
  }

  const resolved = resolveStyle(styles as number | AnyStyle | null | undefined | false);
  return resolved ?? ({} as AnyStyle);
}

// ---------------------------------------------------------------------------
// Public StyleSheet object
// ---------------------------------------------------------------------------

/** StyleSheet utility — mirrors the React Native StyleSheet API. */
export const StyleSheet = {
  create,
  flatten,

  /**
   * Shorthand preset for `{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }`.
   * The value is a registered style ID (number) — use with style arrays.
   */
  get absoluteFill(): number {
    return _absoluteFillId;
  },

  /**
   * Same as absoluteFill but as a plain style object (not an ID).
   */
  get absoluteFillObject(): ViewStyle {
    return _absoluteFillObject;
  },

  /**
   * Resolve a registered style ID back to its raw style object.
   * Returns null for unknown IDs.
   */
  resolve(id: number): AnyStyle | null {
    return _registry.get(id) ?? null;
  },

  /**
   * Reset the style registry (useful between tests).
   * @internal
   */
  _reset(): void {
    _registry.clear();
    _nextId = 1;
    // Re-register absoluteFill so its ID is stable at 1 after reset.
    _registry.set(registerStyle(_absoluteFillObject as AnyStyle), _absoluteFillObject as AnyStyle);
  },
} as const;

// Export raw type alias for convenience.
export type { AnyStyle as FlatStyle };
