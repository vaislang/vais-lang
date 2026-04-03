import { describe, it, expect } from "vitest";
import {
  parseAcceptLanguage,
  getBestMatchLocale,
  resolveServerLocale,
  parseCookieLocale,
  buildLocaleCookie,
} from "../src/ssr.js";

// ---------------------------------------------------------------------------
// parseAcceptLanguage
// ---------------------------------------------------------------------------
describe("parseAcceptLanguage", () => {
  it("parses a simple single-locale header", () => {
    expect(parseAcceptLanguage("en")).toEqual([{ locale: "en", quality: 1 }]);
  });

  it("parses multiple locales with quality values", () => {
    const entries = parseAcceptLanguage("en-US,en;q=0.9,ko;q=0.8");
    expect(entries[0]).toEqual({ locale: "en-US", quality: 1 });
    expect(entries[1]).toEqual({ locale: "en", quality: 0.9 });
    expect(entries[2]).toEqual({ locale: "ko", quality: 0.8 });
  });

  it("sorts entries by quality descending", () => {
    const entries = parseAcceptLanguage("ko;q=0.5,en;q=0.9");
    expect(entries[0]!.locale).toBe("en");
    expect(entries[1]!.locale).toBe("ko");
  });

  it("returns empty array for empty header", () => {
    expect(parseAcceptLanguage("")).toEqual([]);
  });

  it("handles a wildcard entry", () => {
    const entries = parseAcceptLanguage("*");
    expect(entries[0]!.locale).toBe("*");
  });
});

// ---------------------------------------------------------------------------
// getBestMatchLocale
// ---------------------------------------------------------------------------
describe("getBestMatchLocale", () => {
  const supported = ["en", "ko", "zh-TW"];

  it("returns the exact match locale", () => {
    const entries = parseAcceptLanguage("ko");
    expect(getBestMatchLocale(entries, supported, "en")).toBe("ko");
  });

  it("matches language prefix (en-US → en)", () => {
    const entries = parseAcceptLanguage("en-US");
    expect(getBestMatchLocale(entries, supported, "ko")).toBe("en");
  });

  it("matches locale starting with requested language (zh → zh-TW)", () => {
    const entries = parseAcceptLanguage("zh");
    expect(getBestMatchLocale(entries, supported, "en")).toBe("zh-TW");
  });

  it("returns defaultLocale when no match found", () => {
    const entries = parseAcceptLanguage("fr");
    expect(getBestMatchLocale(entries, supported, "en")).toBe("en");
  });

  it("respects quality order: picks highest quality match", () => {
    const entries = parseAcceptLanguage("fr;q=0.9,ko;q=0.8");
    expect(getBestMatchLocale(entries, supported, "en")).toBe("ko");
  });
});

// ---------------------------------------------------------------------------
// resolveServerLocale
// ---------------------------------------------------------------------------
describe("resolveServerLocale", () => {
  const options = {
    defaultLocale: "en",
    supportedLocales: ["en", "ko", "zh-TW"],
  };

  it("resolves from cookie when cookie is present and valid", () => {
    const result = resolveServerLocale(
      "en",
      "locale=ko",
      options,
    );
    expect(result).toEqual({ locale: "ko", fromCookie: true, fromHeader: false });
  });

  it("falls through to Accept-Language when cookie is missing", () => {
    const result = resolveServerLocale("ko;q=0.9", undefined, options);
    expect(result).toEqual({ locale: "ko", fromCookie: false, fromHeader: true });
  });

  it("returns defaultLocale when neither cookie nor header match", () => {
    const result = resolveServerLocale("fr", undefined, options);
    expect(result).toEqual({ locale: "en", fromCookie: false, fromHeader: false });
  });

  it("ignores unsupported cookie locale", () => {
    const result = resolveServerLocale("ko", "locale=fr", options);
    expect(result.fromCookie).toBe(false);
    expect(result.locale).toBe("ko");
  });
});

// ---------------------------------------------------------------------------
// parseCookieLocale
// ---------------------------------------------------------------------------
describe("parseCookieLocale", () => {
  it("extracts the locale cookie", () => {
    expect(parseCookieLocale("locale=ko; session=abc", "locale")).toBe("ko");
  });

  it("returns undefined when cookie name not found", () => {
    expect(parseCookieLocale("session=abc", "locale")).toBeUndefined();
  });

  it("handles cookie value containing =", () => {
    expect(parseCookieLocale("token=a=b=c", "token")).toBe("a=b=c");
  });
});

// ---------------------------------------------------------------------------
// buildLocaleCookie
// ---------------------------------------------------------------------------
describe("buildLocaleCookie", () => {
  it("builds a cookie string with defaults", () => {
    const cookie = buildLocaleCookie("ko");
    expect(cookie).toContain("locale=ko");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("respects custom cookie name", () => {
    const cookie = buildLocaleCookie("en", { cookieName: "lang" });
    expect(cookie).toContain("lang=en");
  });

  it("includes Secure flag when secure=true", () => {
    const cookie = buildLocaleCookie("en", { secure: true });
    expect(cookie).toContain("Secure");
  });

  it("calculates Max-Age from maxAgeDays", () => {
    const cookie = buildLocaleCookie("en", { maxAgeDays: 1 });
    expect(cookie).toContain("Max-Age=86400");
  });
});
