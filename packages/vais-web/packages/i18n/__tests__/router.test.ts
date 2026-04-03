import { describe, it, expect } from "vitest";
import {
  hasLocalePrefix,
  addLocalePrefix,
  removeLocalePrefix,
  generateLocaleRoutes,
  detectLocaleFromPath,
  buildLocaleRedirect,
  switchLocaleInPath,
} from "../src/router.js";

// ---------------------------------------------------------------------------
// hasLocalePrefix
// ---------------------------------------------------------------------------
describe("hasLocalePrefix", () => {
  it("returns true for exact locale path", () => {
    expect(hasLocalePrefix("/ko", "ko")).toBe(true);
  });

  it("returns true for path with locale prefix and subpath", () => {
    expect(hasLocalePrefix("/ko/about", "ko")).toBe(true);
  });

  it("returns false for non-matching prefix", () => {
    expect(hasLocalePrefix("/en/about", "ko")).toBe(false);
  });

  it("returns false for path without locale prefix", () => {
    expect(hasLocalePrefix("/about", "ko")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addLocalePrefix
// ---------------------------------------------------------------------------
describe("addLocalePrefix", () => {
  it("adds locale prefix to a normal path", () => {
    expect(addLocalePrefix("/about", "ko")).toBe("/ko/about");
  });

  it("adds locale prefix to root path", () => {
    expect(addLocalePrefix("/", "en")).toBe("/en");
  });

  it("adds locale prefix to path without leading slash", () => {
    expect(addLocalePrefix("about", "en")).toBe("/en/about");
  });
});

// ---------------------------------------------------------------------------
// removeLocalePrefix
// ---------------------------------------------------------------------------
describe("removeLocalePrefix", () => {
  const locales = ["en", "ko", "zh-TW"];

  it("removes locale prefix and returns locale + original path", () => {
    expect(removeLocalePrefix("/ko/about", locales)).toEqual({
      locale: "ko",
      originalPath: "/about",
    });
  });

  it("handles root locale path", () => {
    expect(removeLocalePrefix("/en", locales)).toEqual({
      locale: "en",
      originalPath: "/",
    });
  });

  it("handles hyphenated locale", () => {
    expect(removeLocalePrefix("/zh-TW/page", locales)).toEqual({
      locale: "zh-TW",
      originalPath: "/page",
    });
  });

  it("returns undefined when no locale prefix matches", () => {
    expect(removeLocalePrefix("/about", locales)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// generateLocaleRoutes
// ---------------------------------------------------------------------------
describe("generateLocaleRoutes", () => {
  it("generates locale routes for all supported locales", () => {
    const routes = generateLocaleRoutes("/about", ["en", "ko"]);
    expect(routes).toEqual([
      { path: "/en/about", locale: "en", originalPath: "/about" },
      { path: "/ko/about", locale: "ko", originalPath: "/about" },
    ]);
  });

  it("handles root path", () => {
    const routes = generateLocaleRoutes("/", ["en", "ko"]);
    expect(routes).toEqual([
      { path: "/en", locale: "en", originalPath: "/" },
      { path: "/ko", locale: "ko", originalPath: "/" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// detectLocaleFromPath
// ---------------------------------------------------------------------------
describe("detectLocaleFromPath", () => {
  it("detects locale from prefixed path", () => {
    expect(detectLocaleFromPath("/ko/about", ["en", "ko"], "en")).toBe("ko");
  });

  it("returns defaultLocale when no prefix matches", () => {
    expect(detectLocaleFromPath("/about", ["en", "ko"], "en")).toBe("en");
  });
});

// ---------------------------------------------------------------------------
// buildLocaleRedirect
// ---------------------------------------------------------------------------
describe("buildLocaleRedirect", () => {
  it("returns redirect info for an un-prefixed path", () => {
    const result = buildLocaleRedirect("/about", ["en", "ko"], "en");
    expect(result).toEqual({ url: "/en/about", statusCode: 302 });
  });

  it("returns permanent redirect when permanent=true", () => {
    const result = buildLocaleRedirect("/about", ["en", "ko"], "en", true);
    expect(result?.statusCode).toBe(301);
  });

  it("returns undefined when path already has a locale prefix", () => {
    expect(buildLocaleRedirect("/en/about", ["en", "ko"], "en")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// switchLocaleInPath
// ---------------------------------------------------------------------------
describe("switchLocaleInPath", () => {
  it("switches locale prefix", () => {
    expect(switchLocaleInPath("/ko/about", ["en", "ko"], "en")).toBe("/en/about");
  });

  it("adds locale prefix when path has none", () => {
    expect(switchLocaleInPath("/about", ["en", "ko"], "ko")).toBe("/ko/about");
  });
});
