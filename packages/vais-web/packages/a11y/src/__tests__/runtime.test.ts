/**
 * @vaisx/a11y — RuntimeChecker tests
 *
 * Tests cover:
 *  - Colour parsing (hex 3-digit, hex 6-digit, rgb(), named)
 *  - Relative luminance calculation
 *  - Contrast ratio calculation & WCAG AA pass/fail
 *  - checkKeyboardNav()
 *  - detectFocusTrap()
 *  - createOverlay()
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  RuntimeChecker,
  parseColor,
  relativeLuminance,
  contrastRatio,
  runtimeChecker,
} from "../runtime.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function el(html: string): Element {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.firstElementChild!;
}

// ─── parseColor ───────────────────────────────────────────────────────────────

describe("parseColor", () => {
  it("parses a 6-digit hex colour", () => {
    expect(parseColor("#ffffff")).toEqual([255, 255, 255]);
  });

  it("parses a 6-digit hex black", () => {
    expect(parseColor("#000000")).toEqual([0, 0, 0]);
  });

  it("parses a 3-digit hex colour and expands it", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
  });

  it("parses a 3-digit hex shorthand correctly (e.g. #abc → #aabbcc)", () => {
    expect(parseColor("#abc")).toEqual([0xaa, 0xbb, 0xcc]);
  });

  it("parses rgb() notation", () => {
    expect(parseColor("rgb(255, 0, 128)")).toEqual([255, 0, 128]);
  });

  it("parses rgb() with extra whitespace", () => {
    expect(parseColor("rgb( 10 , 20 , 30 )")).toEqual([10, 20, 30]);
  });

  it("parses the named colour 'black'", () => {
    expect(parseColor("black")).toEqual([0, 0, 0]);
  });

  it("parses the named colour 'white'", () => {
    expect(parseColor("white")).toEqual([255, 255, 255]);
  });

  it("parses named colour case-insensitively", () => {
    expect(parseColor("BLACK")).toEqual([0, 0, 0]);
  });

  it("throws for an unrecognised colour string", () => {
    expect(() => parseColor("notacolour")).toThrow(/Cannot parse colour/);
  });
});

// ─── relativeLuminance ────────────────────────────────────────────────────────

describe("relativeLuminance", () => {
  it("returns 0 for pure black", () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
  });

  it("returns 1 for pure white", () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });

  it("returns a value in [0, 1] for an arbitrary colour", () => {
    const lum = relativeLuminance([128, 64, 200]);
    expect(lum).toBeGreaterThanOrEqual(0);
    expect(lum).toBeLessThanOrEqual(1);
  });
});

// ─── contrastRatio ────────────────────────────────────────────────────────────

describe("contrastRatio", () => {
  it("returns 21 for black against white", () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 1);
  });

  it("returns 1 when both luminances are equal", () => {
    expect(contrastRatio(0.5, 0.5)).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    const a = contrastRatio(0.8, 0.2);
    const b = contrastRatio(0.2, 0.8);
    expect(a).toBeCloseTo(b, 10);
  });
});

// ─── RuntimeChecker.checkContrast ─────────────────────────────────────────────

describe("RuntimeChecker — checkContrast", () => {
  const checker = new RuntimeChecker();

  it("black on white has a ratio of ~21", () => {
    const result = checker.checkContrast("black", "white");
    expect(result.ratio).toBeCloseTo(21, 0);
    expect(result.passesAA).toBe(true);
    expect(result.passesAALarge).toBe(true);
  });

  it("white on white has a ratio of 1 and fails AA", () => {
    const result = checker.checkContrast("white", "white");
    expect(result.ratio).toBeCloseTo(1, 1);
    expect(result.passesAA).toBe(false);
    expect(result.passesAALarge).toBe(false);
  });

  it("passes WCAG AA large text threshold at ratio ≥ 3", () => {
    // #767676 on white has a ratio of ~4.54 — passes both thresholds.
    const result = checker.checkContrast("#767676", "#ffffff");
    expect(result.passesAALarge).toBe(true);
  });

  it("fails WCAG AA normal text when ratio < 4.5", () => {
    // light grey on white.
    const result = checker.checkContrast("#cccccc", "#ffffff");
    expect(result.passesAA).toBe(false);
  });

  it("exposes foreground and background luminance values", () => {
    const result = checker.checkContrast("#000000", "#ffffff");
    expect(result.foregroundLuminance).toBeCloseTo(0, 5);
    expect(result.backgroundLuminance).toBeCloseTo(1, 5);
  });

  it("accepts hex 3-digit shorthand colours", () => {
    const result = checker.checkContrast("#000", "#fff");
    expect(result.ratio).toBeCloseTo(21, 0);
  });

  it("accepts rgb() colour strings", () => {
    const result = checker.checkContrast("rgb(0,0,0)", "rgb(255,255,255)");
    expect(result.ratio).toBeCloseTo(21, 0);
    expect(result.passesAA).toBe(true);
  });

  it("runtimeChecker singleton works identically", () => {
    const result = runtimeChecker.checkContrast("black", "white");
    expect(result.passesAA).toBe(true);
  });
});

// ─── RuntimeChecker.checkKeyboardNav ──────────────────────────────────────────

describe("RuntimeChecker — checkKeyboardNav", () => {
  const checker = new RuntimeChecker();

  it("passes for a standard <button>", () => {
    const button = el("<button>Click me</button>");
    const result = checker.checkKeyboardNav(button);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("passes for a native <a href>", () => {
    const link = el('<a href="#">Link</a>');
    const result = checker.checkKeyboardNav(link);
    expect(result.pass).toBe(true);
  });

  it("flags a positive tabindex on a non-interactive element", () => {
    const div = el('<div tabindex="2">bad</div>');
    const result = checker.checkKeyboardNav(div);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => /positive/i.test(i.message))).toBe(true);
  });

  it("flags a custom widget role without tabindex", () => {
    const div = el('<div role="button">Widget</div>');
    const result = checker.checkKeyboardNav(div);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => /tabindex/i.test(i.message))).toBe(true);
  });

  it("passes a custom widget role that has tabindex='0'", () => {
    const div = el('<div role="button" tabindex="0">Widget</div>');
    const result = checker.checkKeyboardNav(div);
    expect(result.pass).toBe(true);
  });

  it("flags an onclick element without keyboard handler", () => {
    const div = el('<div onclick="doSomething()">Clickable div</div>');
    const result = checker.checkKeyboardNav(div);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => /keyboard/i.test(i.message))).toBe(true);
  });

  it("does not flag an onclick element that also has onkeydown", () => {
    const div = el('<div onclick="go()" onkeydown="go()">ok</div>');
    const result = checker.checkKeyboardNav(div);
    // The div may still fail for missing role/tabindex, but should NOT flag the keyboard issue.
    const keyboardIssue = result.issues.find((i) => /click handler/i.test(i.message));
    expect(keyboardIssue).toBeUndefined();
  });

  it("skips aria-hidden elements", () => {
    const div = el('<div aria-hidden="true" role="button">hidden</div>');
    const result = checker.checkKeyboardNav(div);
    expect(result.pass).toBe(true);
  });

  it("skips disabled elements", () => {
    const div = el('<div aria-disabled="true" role="button">disabled</div>');
    const result = checker.checkKeyboardNav(div);
    expect(result.pass).toBe(true);
  });

  it("inspects descendants of the given element", () => {
    const container = document.createElement("div");
    container.innerHTML = '<span role="button">child widget</span>';
    document.body.appendChild(container);

    const result = checker.checkKeyboardNav(container);
    expect(result.pass).toBe(false);
    expect(result.issues.some((i) => /tabindex/i.test(i.message))).toBe(true);

    document.body.removeChild(container);
  });
});

// ─── RuntimeChecker.detectFocusTrap ───────────────────────────────────────────

describe("RuntimeChecker — detectFocusTrap", () => {
  const checker = new RuntimeChecker();

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns hasTrap=false when there are no focusable elements in the container", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>No focusable content</p>";
    document.body.appendChild(container);

    const result = checker.detectFocusTrap(container);
    expect(result.hasTrap).toBe(false);
    expect(result.type).toBe("none");
    expect(result.focusableElements).toHaveLength(0);
  });

  it("returns hasTrap=false when focusable elements exist outside the container", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Inside</button>";
    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.appendChild(container);
    document.body.appendChild(outside);

    const result = checker.detectFocusTrap(container);
    expect(result.hasTrap).toBe(false);
  });

  it("detects an unintentional focus trap", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Trapped A</button><button>Trapped B</button>";
    // Only the container has focusable elements — nothing outside.
    document.body.appendChild(container);

    const result = checker.detectFocusTrap(container);
    expect(result.hasTrap).toBe(true);
    expect(result.type).toBe("unintentional");
    expect(result.focusableElements.length).toBeGreaterThan(0);
  });

  it("classifies a dialog container as an intentional focus trap", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = '<button>Close</button><input type="text" />';
    document.body.appendChild(dialog);

    const result = checker.detectFocusTrap(dialog);
    expect(result.hasTrap).toBe(true);
    expect(result.type).toBe("intentional");
  });

  it("classifies an alertdialog as an intentional focus trap", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    dialog.innerHTML = "<button>OK</button>";
    document.body.appendChild(dialog);

    const result = checker.detectFocusTrap(dialog);
    expect(result.hasTrap).toBe(true);
    expect(result.type).toBe("intentional");
  });

  it("classifies aria-modal=true as an intentional focus trap", () => {
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = "<button>Action</button>";
    document.body.appendChild(modal);

    const result = checker.detectFocusTrap(modal);
    expect(result.hasTrap).toBe(true);
    expect(result.type).toBe("intentional");
  });

  it("collects all focusable elements inside the container", () => {
    const container = document.createElement("div");
    container.setAttribute("role", "dialog");
    container.innerHTML = `
      <button>Button</button>
      <input type="text" />
      <a href="#">Link</a>
      <select><option>A</option></select>
    `;
    document.body.appendChild(container);

    const result = checker.detectFocusTrap(container);
    expect(result.focusableElements.length).toBeGreaterThanOrEqual(4);
  });

  it("includes a meaningful message in the result", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Inside</button>";
    document.body.appendChild(container);

    const result = checker.detectFocusTrap(container);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });
});

// ─── RuntimeChecker.createOverlay ─────────────────────────────────────────────

describe("RuntimeChecker — createOverlay", () => {
  const checker = new RuntimeChecker();

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("appends one overlay element per violation", () => {
    const target = document.createElement("button");
    document.body.appendChild(target);

    const violations = [
      {
        rule: { id: "test-rule", description: "Test", impact: "serious" as const, check: () => ({ pass: false }) },
        element: target,
        impact: "serious" as const,
        message: "Test violation",
        suggestion: "Fix it",
      },
    ];

    const cleanup = checker.createOverlay(violations);
    const overlays = document.querySelectorAll("[data-a11y-overlay]");
    expect(overlays).toHaveLength(1);
    cleanup();
  });

  it("removes overlays when the cleanup function is called", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const violations = [
      {
        rule: { id: "r1", description: "desc", impact: "minor" as const, check: () => ({ pass: false }) },
        element: target,
        impact: "minor" as const,
        message: "minor issue",
      },
    ];

    const cleanup = checker.createOverlay(violations);
    expect(document.querySelectorAll("[data-a11y-overlay]")).toHaveLength(1);
    cleanup();
    expect(document.querySelectorAll("[data-a11y-overlay]")).toHaveLength(0);
  });

  it("handles an empty violations array gracefully", () => {
    const cleanup = checker.createOverlay([]);
    expect(document.querySelectorAll("[data-a11y-overlay]")).toHaveLength(0);
    cleanup();
  });

  it("sets role='tooltip' on each overlay for accessibility", () => {
    const target = document.createElement("button");
    document.body.appendChild(target);

    const violations = [
      {
        rule: { id: "r2", description: "d", impact: "critical" as const, check: () => ({ pass: false }) },
        element: target,
        impact: "critical" as const,
        message: "critical",
      },
    ];

    const cleanup = checker.createOverlay(violations);
    const overlay = document.querySelector("[data-a11y-overlay]");
    expect(overlay?.getAttribute("role")).toBe("tooltip");
    cleanup();
  });
});
