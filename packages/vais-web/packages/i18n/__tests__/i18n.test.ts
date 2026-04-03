import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createI18n } from "../src/index.js";
import * as translateModule from "../src/translate.js";

const messages = {
  en: {
    greeting: "Hello, {name}!",
    farewell: "Goodbye, {name}!",
    nav: {
      home: "Home",
      about: "About",
    },
    items: {
      zero: "No items",
      one: "One item",
      other: "{count} items",
    },
    nested: {
      deep: {
        key: "Deep value",
      },
    },
  },
  ko: {
    greeting: "안녕하세요, {name}!",
    nav: {
      home: "홈",
    },
    items: {
      zero: "항목 없음",
      one: "항목 하나",
      other: "항목 {count}개",
    },
  },
};

// ---------------------------------------------------------------------------
// createI18n
// ---------------------------------------------------------------------------
describe("createI18n", () => {
  it("creates an instance with the default locale", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.locale).toBe("en");
  });

  it("throws when defaultLocale is not in locales list", () => {
    expect(() =>
      createI18n({ defaultLocale: "fr", locales: ["en", "ko"], messages }),
    ).toThrow();
  });

  // t() – basic
  it("t() translates a simple string key", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.t("nav.home")).toBe("Home");
  });

  it("t() interpolates parameters", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.t("greeting", { name: "Alice" })).toBe("Hello, Alice!");
  });

  it("t() resolves a deeply nested key", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.t("nested.deep.key")).toBe("Deep value");
  });

  it("t() returns the key for a missing translation", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.t("totally.missing")).toBe("totally.missing");
  });

  // t() – pluralisation
  it("t() pluralises with count=0 (zero form)", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.t("items", { count: 0 })).toBe("No items");
  });

  it("t() pluralises with count=1 (one form)", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.t("items", { count: 1 })).toBe("One item");
  });

  it("t() pluralises with count>1 (other form)", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.t("items", { count: 5 })).toBe("5 items");
  });

  // setLocale
  it("setLocale() changes the active locale", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    i18n.setLocale("ko");
    expect(i18n.locale).toBe("ko");
    expect(i18n.t("greeting", { name: "세계" })).toBe("안녕하세요, 세계!");
  });

  it("setLocale() throws for an unsupported locale", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(() => i18n.setLocale("fr")).toThrow();
  });

  // getLocales
  it("getLocales() returns all supported locales", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.getLocales()).toEqual(["en", "ko"]);
  });

  it("getLocales() returns a copy (mutation does not affect the instance)", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    const locales = i18n.getLocales();
    locales.push("fr");
    expect(i18n.getLocales().length).toBe(2);
  });

  // hasMessage
  it("hasMessage() returns true for an existing key", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.hasMessage("greeting")).toBe(true);
  });

  it("hasMessage() returns false for a missing key", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    expect(i18n.hasMessage("nonexistent")).toBe(false);
  });

  it("hasMessage() checks a specific locale", () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
    // "farewell" only exists in "en"
    expect(i18n.hasMessage("farewell", "en")).toBe(true);
    expect(i18n.hasMessage("farewell", "ko")).toBe(false);
  });

  // Fallback locale
  it("falls back to fallbackLocale for missing keys", () => {
    const i18n = createI18n({
      defaultLocale: "ko",
      locales: ["en", "ko"],
      messages,
      fallbackLocale: "en",
    });
    // "farewell" only exists in "en"
    expect(i18n.t("farewell", { name: "World" })).toBe("Goodbye, World!");
  });

  it("prefers active locale over fallback", () => {
    const i18n = createI18n({
      defaultLocale: "ko",
      locales: ["en", "ko"],
      messages,
      fallbackLocale: "en",
    });
    expect(i18n.t("nav.home")).toBe("홈");
  });

  // Korean pluralisation
  it("pluralises correctly in the Korean locale", () => {
    const i18n = createI18n({ defaultLocale: "ko", locales: ["en", "ko"], messages });
    expect(i18n.t("items", { count: 0 })).toBe("항목 없음");
    expect(i18n.t("items", { count: 1 })).toBe("항목 하나");
    expect(i18n.t("items", { count: 3 })).toBe("항목 3개");
  });

  // Translator caching
  describe("translator caching", () => {
    let spy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      spy = vi.spyOn(translateModule, "createTranslator");
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it("reuses the same translator instance across multiple t() calls", () => {
      spy.mockClear();
      const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
      // createI18n calls createTranslator once during initialisation.
      expect(spy).toHaveBeenCalledTimes(1);

      i18n.t("greeting", { name: "Alice" });
      i18n.t("nav.home");
      i18n.t("farewell", { name: "Bob" });

      // Still only the single call made during construction.
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("invalidates the translator cache when setLocale() is called", () => {
      spy.mockClear();
      const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ko"], messages });
      expect(spy).toHaveBeenCalledTimes(1);

      i18n.t("greeting", { name: "Alice" });
      i18n.t("nav.home");
      expect(spy).toHaveBeenCalledTimes(1);

      i18n.setLocale("ko");
      // setLocale() must trigger a new createTranslator call.
      expect(spy).toHaveBeenCalledTimes(2);

      i18n.t("greeting", { name: "세계" });
      i18n.t("nav.home");
      // No additional calls after the locale switch.
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
