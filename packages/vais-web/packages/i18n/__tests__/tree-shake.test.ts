import { describe, it, expect } from "vitest";
import {
  KeyUsageTracker,
  pruneBundle,
  filterUsedLocales,
  treeShakeBundles,
} from "../src/tree-shake.js";

const fullMessages = {
  en: {
    greeting: "Hello",
    nav: { home: "Home", about: "About" },
    footer: "Footer",
  },
  ko: {
    greeting: "안녕",
    nav: { home: "홈", about: "소개" },
    footer: "푸터",
  },
  fr: {
    greeting: "Bonjour",
    nav: { home: "Accueil", about: "À propos" },
    footer: "Pied de page",
  },
};

// ---------------------------------------------------------------------------
// KeyUsageTracker
// ---------------------------------------------------------------------------
describe("KeyUsageTracker", () => {
  it("tracks unique keys", () => {
    const tracker = new KeyUsageTracker();
    tracker.track("greeting");
    tracker.track("nav.home");
    tracker.track("greeting"); // duplicate
    expect(tracker.getUsedKeys().size).toBe(2);
  });

  it("reset() clears all tracked keys", () => {
    const tracker = new KeyUsageTracker();
    tracker.track("greeting");
    tracker.reset();
    expect(tracker.getUsedKeys().size).toBe(0);
  });

  it("getUsedKeys() returns a copy, not the internal set", () => {
    const tracker = new KeyUsageTracker();
    tracker.track("greeting");
    const keys = tracker.getUsedKeys();
    keys.add("extra");
    expect(tracker.getUsedKeys().size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// pruneBundle
// ---------------------------------------------------------------------------
describe("pruneBundle", () => {
  const bundle = {
    greeting: "Hello",
    nav: { home: "Home", about: "About" },
    footer: "Footer",
    items: { one: "item", other: "items" },
  };

  it("retains only used keys", () => {
    const pruned = pruneBundle(bundle, new Set(["greeting", "nav.home"]));
    expect(pruned["greeting"]).toBe("Hello");
    expect((pruned["nav"] as Record<string, string>)?.["home"]).toBe("Home");
    expect(pruned["footer"]).toBeUndefined();
    expect((pruned["nav"] as Record<string, string>)?.["about"]).toBeUndefined();
  });

  it("retains plural messages", () => {
    const pruned = pruneBundle(bundle, new Set(["items"]));
    expect(pruned["items"]).toEqual({ one: "item", other: "items" });
  });

  it("returns an empty object when usedKeys is empty", () => {
    expect(pruneBundle(bundle, new Set())).toEqual({});
  });

  it("ignores keys that do not exist in the bundle", () => {
    const pruned = pruneBundle(bundle, new Set(["missing.key"]));
    expect(Object.keys(pruned).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterUsedLocales
// ---------------------------------------------------------------------------
describe("filterUsedLocales", () => {
  it("returns only the locales in usedLocales", () => {
    const filtered = filterUsedLocales(fullMessages, new Set(["en", "ko"]));
    expect(Object.keys(filtered).sort()).toEqual(["en", "ko"]);
    expect(filtered["fr"]).toBeUndefined();
  });

  it("returns an empty object when usedLocales is empty", () => {
    expect(filterUsedLocales(fullMessages, new Set())).toEqual({});
  });

  it("ignores locales in usedLocales that do not exist in messages", () => {
    const filtered = filterUsedLocales(fullMessages, new Set(["en", "de"]));
    expect(Object.keys(filtered)).toEqual(["en"]);
  });
});

// ---------------------------------------------------------------------------
// treeShakeBundles
// ---------------------------------------------------------------------------
describe("treeShakeBundles", () => {
  it("always keeps the defaultLocale", () => {
    const result = treeShakeBundles(fullMessages, new Set(["ko"]), new Set(), "en");
    expect(Object.keys(result.messages)).toContain("en");
  });

  it("removes locales not in usedLocales (except default)", () => {
    const result = treeShakeBundles(fullMessages, new Set(["ko"]), new Set(), "en");
    expect(Object.keys(result.messages)).not.toContain("fr");
  });

  it("prunes keys when usedKeys is provided", () => {
    const result = treeShakeBundles(
      fullMessages,
      new Set(["en"]),
      new Set(["greeting"]),
      "en",
    );
    expect((result.messages["en"] as Record<string, unknown>)?.["greeting"]).toBe("Hello");
    expect((result.messages["en"] as Record<string, unknown>)?.["footer"]).toBeUndefined();
  });

  it("reports reduction statistics", () => {
    const result = treeShakeBundles(
      fullMessages,
      new Set(["en"]),
      new Set(["greeting"]),
      "en",
    );
    expect(result.originalKeyCount).toBeGreaterThan(result.retainedKeyCount);
    expect(result.reductionPercent).toBeGreaterThan(0);
  });

  it("reports 0% reduction when no pruning is done", () => {
    const result = treeShakeBundles(
      { en: { hello: "Hello" } },
      new Set(["en"]),
      new Set(),
      "en",
    );
    expect(result.reductionPercent).toBe(0);
  });
});
