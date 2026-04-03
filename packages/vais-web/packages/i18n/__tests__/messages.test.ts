import { describe, it, expect } from "vitest";
import {
  isPluralMessages,
  isNestedBundle,
  resolveKey,
  MessageRegistry,
  flattenBundle,
  buildLookupCache,
} from "../src/messages.js";

// ---------------------------------------------------------------------------
// isPluralMessages
// ---------------------------------------------------------------------------
describe("isPluralMessages", () => {
  it("returns true for a valid plural object with one + other", () => {
    expect(isPluralMessages({ one: "item", other: "items" })).toBe(true);
  });

  it("returns true when zero is also present", () => {
    expect(isPluralMessages({ zero: "no items", one: "item", other: "items" })).toBe(true);
  });

  it("returns false for a plain string", () => {
    expect(isPluralMessages("hello")).toBe(false);
  });

  it("returns false for a nested bundle (no one/other strings)", () => {
    expect(isPluralMessages({ greeting: "hi" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPluralMessages(null as never)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isNestedBundle
// ---------------------------------------------------------------------------
describe("isNestedBundle", () => {
  it("returns true for a plain nested object", () => {
    expect(isNestedBundle({ key: "value" })).toBe(true);
  });

  it("returns false for a string", () => {
    expect(isNestedBundle("hello")).toBe(false);
  });

  it("returns false for a PluralMessages object", () => {
    expect(isNestedBundle({ one: "item", other: "items" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveKey
// ---------------------------------------------------------------------------
describe("resolveKey", () => {
  const bundle = {
    greeting: "Hello",
    nav: {
      home: "Home",
      about: "About",
      nested: {
        deep: "Deep value",
      },
    },
    items: { one: "item", other: "items" },
  };

  it("resolves a top-level key", () => {
    expect(resolveKey(bundle, "greeting")).toBe("Hello");
  });

  it("resolves a nested key", () => {
    expect(resolveKey(bundle, "nav.home")).toBe("Home");
  });

  it("resolves a deeply nested key", () => {
    expect(resolveKey(bundle, "nav.nested.deep")).toBe("Deep value");
  });

  it("resolves a plural messages object", () => {
    expect(resolveKey(bundle, "items")).toEqual({ one: "item", other: "items" });
  });

  it("returns undefined for a missing top-level key", () => {
    expect(resolveKey(bundle, "missing")).toBeUndefined();
  });

  it("returns undefined when traversing into a string", () => {
    expect(resolveKey(bundle, "greeting.sub")).toBeUndefined();
  });

  it("returns undefined when traversing into a plural object", () => {
    expect(resolveKey(bundle, "items.one.sub")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MessageRegistry
// ---------------------------------------------------------------------------
describe("MessageRegistry", () => {
  it("registers and retrieves a bundle", () => {
    const reg = new MessageRegistry();
    reg.register("en", { hello: "Hello" });
    expect(reg.get("en")).toEqual({ hello: "Hello" });
  });

  it("has() returns true after registration", () => {
    const reg = new MessageRegistry();
    reg.register("ko", { hello: "안녕" });
    expect(reg.has("ko")).toBe(true);
    expect(reg.has("fr")).toBe(false);
  });

  it("locales() lists all registered locales", () => {
    const reg = new MessageRegistry();
    reg.register("en", {});
    reg.register("ko", {});
    expect(reg.locales().sort()).toEqual(["en", "ko"]);
  });

  it("resolve() finds a nested key", () => {
    const reg = new MessageRegistry();
    reg.register("en", { nav: { home: "Home" } });
    expect(reg.resolve("en", "nav.home")).toBe("Home");
  });

  it("resolve() returns undefined for unknown locale", () => {
    const reg = new MessageRegistry();
    expect(reg.resolve("fr", "key")).toBeUndefined();
  });

  it("hasKey() returns false for missing keys", () => {
    const reg = new MessageRegistry();
    reg.register("en", { hello: "Hello" });
    expect(reg.hasKey("en", "world")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// flattenBundle / buildLookupCache
// ---------------------------------------------------------------------------
describe("flattenBundle", () => {
  it("flattens a nested bundle into dot-separated keys", () => {
    const bundle = { a: { b: "B", c: "C" } };
    const flat = flattenBundle(bundle);
    expect(flat.get("a.b")).toBe("B");
    expect(flat.get("a.c")).toBe("C");
  });

  it("includes plural messages as-is", () => {
    const bundle = { items: { one: "item", other: "items" } };
    const flat = flattenBundle(bundle);
    expect(flat.get("items")).toEqual({ one: "item", other: "items" });
  });

  it("handles top-level strings", () => {
    const flat = flattenBundle({ hello: "Hello" });
    expect(flat.get("hello")).toBe("Hello");
  });
});

describe("buildLookupCache", () => {
  it("produces the same result as flattenBundle", () => {
    const bundle = { x: { y: "Y" } };
    expect(buildLookupCache(bundle)).toEqual(flattenBundle(bundle));
  });
});
