import { describe, it, expect } from "vitest";
import { interpolate, selectPlural, translateValue, createTranslator } from "../src/translate.js";
import { MessageRegistry } from "../src/messages.js";

// ---------------------------------------------------------------------------
// interpolate
// ---------------------------------------------------------------------------
describe("interpolate", () => {
  it("replaces a single placeholder", () => {
    expect(interpolate("Hello, {name}!", { name: "World" })).toBe("Hello, World!");
  });

  it("replaces multiple placeholders", () => {
    expect(interpolate("{greeting}, {name}!", { greeting: "Hi", name: "Alice" })).toBe(
      "Hi, Alice!",
    );
  });

  it("leaves unknown placeholders intact", () => {
    expect(interpolate("Hello, {name}!", {})).toBe("Hello, {name}!");
  });

  it("handles numeric values in params", () => {
    expect(interpolate("You have {count} messages", { count: 5 })).toBe(
      "You have 5 messages",
    );
  });

  it("returns the template unchanged when no placeholders", () => {
    expect(interpolate("No placeholders", { name: "World" })).toBe("No placeholders");
  });

  it("handles the same placeholder appearing twice", () => {
    expect(interpolate("{x} and {x}", { x: "foo" })).toBe("foo and foo");
  });
});

// ---------------------------------------------------------------------------
// selectPlural
// ---------------------------------------------------------------------------
describe("selectPlural", () => {
  const plural = { zero: "no items", one: "one item", other: "{count} items" };

  it("selects zero form when count is 0 and zero is defined", () => {
    expect(selectPlural(plural, 0)).toBe("no items");
  });

  it("selects one form when count is 1", () => {
    expect(selectPlural(plural, 1)).toBe("one item");
  });

  it("selects other form for count > 1", () => {
    expect(selectPlural(plural, 5)).toBe("{count} items");
  });

  it("falls back to other when zero is undefined and count is 0", () => {
    const p = { one: "one item", other: "{count} items" };
    expect(selectPlural(p, 0)).toBe("{count} items");
  });
});

// ---------------------------------------------------------------------------
// translateValue
// ---------------------------------------------------------------------------
describe("translateValue", () => {
  it("returns interpolated string for a string value", () => {
    expect(translateValue("Hello, {name}!", { name: "World" }, "fallback")).toBe(
      "Hello, World!",
    );
  });

  it("returns fallback for undefined value", () => {
    expect(translateValue(undefined, {}, "my.key")).toBe("my.key");
  });

  it("returns fallback for a nested bundle value", () => {
    expect(translateValue({ sub: "value" } as never, {}, "key")).toBe("key");
  });

  it("applies plural logic when value is PluralMessages", () => {
    const plural = { one: "one item", other: "{count} items" };
    expect(translateValue(plural, { count: 3 }, "key")).toBe("3 items");
  });

  it("defaults count to 1 for plural when no count param", () => {
    const plural = { one: "one item", other: "many items" };
    expect(translateValue(plural, {}, "key")).toBe("one item");
  });
});

// ---------------------------------------------------------------------------
// createTranslator
// ---------------------------------------------------------------------------
describe("createTranslator", () => {
  const registry = new MessageRegistry();
  registry.register("en", {
    greeting: "Hello, {name}!",
    nav: { home: "Home", about: "About" },
    items: { zero: "no items", one: "one item", other: "{count} items" },
  });
  registry.register("ko", {
    greeting: "안녕하세요, {name}!",
    nav: { home: "홈" },
  });

  it("translates a simple key in the active locale", () => {
    const t = createTranslator({ locale: "en", registry });
    expect(t("greeting", { name: "Alice" })).toBe("Hello, Alice!");
  });

  it("translates a nested key", () => {
    const t = createTranslator({ locale: "en", registry });
    expect(t("nav.home")).toBe("Home");
  });

  it("returns the key when translation is missing and no fallback", () => {
    const t = createTranslator({ locale: "en", registry });
    expect(t("missing.key")).toBe("missing.key");
  });

  it("falls back to the fallback locale for missing keys", () => {
    const t = createTranslator({ locale: "ko", fallbackLocale: "en", registry });
    expect(t("nav.about")).toBe("About");
  });

  it("prefers the active locale over the fallback", () => {
    const t = createTranslator({ locale: "ko", fallbackLocale: "en", registry });
    expect(t("nav.home")).toBe("홈");
  });

  it("handles pluralisation through createTranslator", () => {
    const t = createTranslator({ locale: "en", registry });
    expect(t("items", { count: 0 })).toBe("no items");
    expect(t("items", { count: 1 })).toBe("one item");
    expect(t("items", { count: 42 })).toBe("42 items");
  });
});
