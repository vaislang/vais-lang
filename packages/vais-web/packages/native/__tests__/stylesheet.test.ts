/**
 * Tests for the StyleSheet utility.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { StyleSheet } from "../src/stylesheet.js";

beforeEach(() => {
  StyleSheet._reset();
});

// ---------------------------------------------------------------------------
// StyleSheet.create
// ---------------------------------------------------------------------------

describe("StyleSheet.create", () => {
  it("returns an object with the same keys as the input", () => {
    const styles = StyleSheet.create({
      container: { flex: 1 },
      text: { fontSize: 14 },
    });
    expect(Object.keys(styles)).toEqual(["container", "text"]);
  });

  it("returns numeric IDs for each key", () => {
    const styles = StyleSheet.create({ box: { width: 100 } });
    expect(typeof styles.box).toBe("number");
    expect(styles.box).toBeGreaterThan(0);
  });

  it("assigns unique IDs to different named styles", () => {
    const styles = StyleSheet.create({
      a: { flex: 1 },
      b: { flex: 2 },
    });
    expect(styles.a).not.toBe(styles.b);
  });

  it("allows resolving the ID back to the original style", () => {
    const styles = StyleSheet.create({ card: { borderRadius: 8, backgroundColor: "#fff" } });
    const resolved = StyleSheet.resolve(styles.card);
    expect(resolved).toMatchObject({ borderRadius: 8, backgroundColor: "#fff" });
  });

  it("IDs increment across multiple create calls", () => {
    const s1 = StyleSheet.create({ x: { flex: 1 } });
    const s2 = StyleSheet.create({ y: { flex: 2 } });
    expect(s2.y).toBeGreaterThan(s1.x);
  });
});

// ---------------------------------------------------------------------------
// StyleSheet.flatten
// ---------------------------------------------------------------------------

describe("StyleSheet.flatten", () => {
  it("returns an empty object for null", () => {
    expect(StyleSheet.flatten(null)).toEqual({});
  });

  it("returns an empty object for undefined", () => {
    expect(StyleSheet.flatten(undefined)).toEqual({});
  });

  it("returns an empty object for false", () => {
    expect(StyleSheet.flatten(false)).toEqual({});
  });

  it("returns a plain style object as-is", () => {
    const result = StyleSheet.flatten({ flex: 1, color: "#000" });
    expect(result).toMatchObject({ flex: 1, color: "#000" });
  });

  it("resolves a registered ID to its style object", () => {
    const ids = StyleSheet.create({ item: { fontSize: 16 } });
    const result = StyleSheet.flatten(ids.item);
    expect(result).toMatchObject({ fontSize: 16 });
  });

  it("merges an array of style objects", () => {
    const result = StyleSheet.flatten([
      { flex: 1 },
      { backgroundColor: "#f00" },
    ]);
    expect(result).toMatchObject({ flex: 1, backgroundColor: "#f00" });
  });

  it("later entries override earlier ones in an array", () => {
    const result = StyleSheet.flatten([{ color: "red" }, { color: "blue" }]);
    expect(result["color"]).toBe("blue");
  });

  it("handles arrays with registered IDs mixed with plain objects", () => {
    const ids = StyleSheet.create({ base: { fontSize: 14 } });
    const result = StyleSheet.flatten([ids.base, { fontWeight: "bold" }]);
    expect(result).toMatchObject({ fontSize: 14, fontWeight: "bold" });
  });

  it("skips null/undefined/false entries in arrays", () => {
    const result = StyleSheet.flatten([null, undefined, false, { opacity: 0.5 }]);
    expect(result).toMatchObject({ opacity: 0.5 });
  });
});

// ---------------------------------------------------------------------------
// StyleSheet.absoluteFill / absoluteFillObject
// ---------------------------------------------------------------------------

describe("StyleSheet.absoluteFill", () => {
  it("is a number (registered style ID)", () => {
    expect(typeof StyleSheet.absoluteFill).toBe("number");
  });

  it("resolves to position:absolute with zero insets", () => {
    const resolved = StyleSheet.resolve(StyleSheet.absoluteFill);
    expect(resolved).toMatchObject({
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it("can be used in flatten", () => {
    const result = StyleSheet.flatten(StyleSheet.absoluteFill);
    expect(result["position"]).toBe("absolute");
  });
});

describe("StyleSheet.absoluteFillObject", () => {
  it("is a plain style object (not a number)", () => {
    expect(typeof StyleSheet.absoluteFillObject).toBe("object");
  });

  it("contains position:absolute and zero insets", () => {
    expect(StyleSheet.absoluteFillObject).toMatchObject({
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(StyleSheet.absoluteFillObject)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// StyleSheet._reset (internal, used in tests)
// ---------------------------------------------------------------------------

describe("StyleSheet._reset", () => {
  it("clears previously registered IDs", () => {
    const s1 = StyleSheet.create({ item: { flex: 1 } });
    StyleSheet._reset();
    const resolved = StyleSheet.resolve(s1.item);
    // After reset the old ID should not resolve.
    expect(resolved).toBeNull();
  });
});
