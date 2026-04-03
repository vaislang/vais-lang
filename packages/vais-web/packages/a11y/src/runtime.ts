/**
 * RuntimeChecker — runtime accessibility checks for @vaisx/a11y.
 *
 * Provides:
 *  - checkContrast()    WCAG AA colour-contrast ratio (4.5:1 text, 3:1 large text)
 *  - checkKeyboardNav() Keyboard-navigation audit for interactive elements
 *  - detectFocusTrap()  Focus-trap detection inside a container
 *  - createOverlay()    Visual devtools overlay for violations
 */

import type { Violation } from "./types.js";

// ─── Colour utilities ────────────────────────────────────────────────────────

/**
 * Named CSS colours — a minimal set sufficient for testing and common use.
 * Values are [r, g, b] in the 0–255 range.
 */
const NAMED_COLOURS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  lime: [0, 255, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  aqua: [0, 255, 255],
  magenta: [255, 0, 255],
  fuchsia: [255, 0, 255],
  silver: [192, 192, 192],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  purple: [128, 0, 128],
  teal: [0, 128, 128],
  navy: [0, 0, 128],
  orange: [255, 165, 0],
  pink: [255, 192, 203],
  transparent: [255, 255, 255],
};

/**
 * Parses a CSS colour string into an [r, g, b] tuple (0–255 each).
 * Supports:
 *  - 3-digit hex  (#fff)
 *  - 6-digit hex  (#ffffff)
 *  - rgb()        rgb(255, 255, 255)
 *  - named colours (black, white, …)
 *
 * Throws if the colour cannot be parsed.
 */
export function parseColor(color: string): [number, number, number] {
  const s = color.trim().toLowerCase();

  // ── named colour ──────────────────────────────────────────────────────────
  if (Object.prototype.hasOwnProperty.call(NAMED_COLOURS, s)) {
    return [...NAMED_COLOURS[s]] as [number, number, number];
  }

  // ── 6-digit hex ───────────────────────────────────────────────────────────
  const hex6 = /^#([0-9a-f]{6})$/.exec(s);
  if (hex6) {
    const v = parseInt(hex6[1], 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  }

  // ── 3-digit hex ───────────────────────────────────────────────────────────
  const hex3 = /^#([0-9a-f]{3})$/.exec(s);
  if (hex3) {
    const [r, g, b] = hex3[1].split("").map((c) => parseInt(c + c, 16));
    return [r, g, b];
  }

  // ── rgb() ─────────────────────────────────────────────────────────────────
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(s);
  if (rgb) {
    return [parseInt(rgb[1], 10), parseInt(rgb[2], 10), parseInt(rgb[3], 10)];
  }

  throw new Error(`[a11y] Cannot parse colour: "${color}"`);
}

/**
 * Converts a single 8-bit channel value to its linear-light representation
 * using the W3C sRGB formula.
 */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Computes the relative luminance of an sRGB colour per WCAG 2.x / W3C.
 * Result is in the range [0, 1].
 */
export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(linearise);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Computes the contrast ratio between two relative luminances.
 * Formula: (L1 + 0.05) / (L2 + 0.05) where L1 >= L2.
 */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Contrast result ─────────────────────────────────────────────────────────

export interface ContrastResult {
  /** Calculated contrast ratio (e.g. 21 for black/white). */
  ratio: number;
  /** Whether the pair passes WCAG AA normal text (4.5:1). */
  passesAA: boolean;
  /** Whether the pair passes WCAG AA large text / UI components (3:1). */
  passesAALarge: boolean;
  /** Foreground relative luminance. */
  foregroundLuminance: number;
  /** Background relative luminance. */
  backgroundLuminance: number;
}

// ─── Keyboard-nav result ──────────────────────────────────────────────────────

export interface KeyboardNavIssue {
  /** The element with the issue. */
  element: Element;
  /** Issue description. */
  message: string;
  /** Recommended remediation. */
  suggestion: string;
}

export interface KeyboardNavResult {
  /** Whether no keyboard issues were found. */
  pass: boolean;
  /** List of individual issues (empty when pass === true). */
  issues: KeyboardNavIssue[];
}

// ─── Focus-trap result ────────────────────────────────────────────────────────

export interface FocusTrapResult {
  /** Whether a focus trap was detected. */
  hasTrap: boolean;
  /**
   * When hasTrap is true:
   *  - "intentional"   — the container has role="dialog" / role="alertdialog",
   *                      suggesting the trap is by design (e.g. a modal).
   *  - "unintentional" — the container has no modal semantics; the trap is
   *                      likely a bug.
   */
  type: "intentional" | "unintentional" | "none";
  /** Focusable elements found inside the container. */
  focusableElements: Element[];
  /** Human-readable description. */
  message: string;
}

// ─── RuntimeChecker class ─────────────────────────────────────────────────────

/**
 * Selectors that identify natively focusable elements (excluding
 * explicitly-removed elements via tabindex="-1").
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), ' +
  '[contenteditable="true"], details > summary';

/** Roles that indicate an intentional modal / dialog focus trap. */
const MODAL_ROLES = new Set(["dialog", "alertdialog"]);

/** Roles that designate custom interactive widgets requiring keyboard support. */
const CUSTOM_WIDGET_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "tab",
  "treeitem",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "slider",
  "spinbutton",
  "switch",
]);

/** Native tags that are already keyboard-accessible without extra ARIA. */
const NATIVE_INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
]);

export class RuntimeChecker {
  // ── Contrast ───────────────────────────────────────────────────────────────

  /**
   * Calculates the WCAG AA contrast ratio between two CSS colour strings.
   *
   * @param foreground — CSS colour of the text / foreground layer.
   * @param background — CSS colour of the background layer.
   * @returns ContrastResult with ratio and pass/fail flags.
   */
  checkContrast(foreground: string, background: string): ContrastResult {
    const fgRgb = parseColor(foreground);
    const bgRgb = parseColor(background);

    const fgLum = relativeLuminance(fgRgb);
    const bgLum = relativeLuminance(bgRgb);
    const ratio = contrastRatio(fgLum, bgLum);

    return {
      ratio: Math.round(ratio * 100) / 100,
      passesAA: ratio >= 4.5,
      passesAALarge: ratio >= 3.0,
      foregroundLuminance: fgLum,
      backgroundLuminance: bgLum,
    };
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  /**
   * Inspects an element (and its descendants) for common keyboard-navigation
   * problems.
   *
   * Checks performed:
   *  1. Non-native interactive elements with an ARIA widget role lack tabindex.
   *  2. Elements that have a click listener registered via data attribute
   *     convention but no keyboard event attributes.
   *  3. Elements with positive tabindex values (disrupts natural focus order).
   *  4. Elements with role="button" etc. that are not natively focusable.
   *
   * @param element — Root element to inspect (inclusive).
   * @returns KeyboardNavResult
   */
  checkKeyboardNav(element: Element): KeyboardNavResult {
    const issues: KeyboardNavIssue[] = [];

    // Collect the element itself plus all descendants.
    const candidates: Element[] = [element, ...Array.from(element.querySelectorAll("*"))];

    for (const el of candidates) {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const tabindexAttr = el.getAttribute("tabindex");
      const tabindex = tabindexAttr !== null ? parseInt(tabindexAttr, 10) : null;
      const isAriaHidden = el.getAttribute("aria-hidden") === "true";
      const isDisabled =
        el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";

      if (isAriaHidden || isDisabled) continue;

      // 1. Positive tabindex disrupts natural focus order.
      if (tabindex !== null && tabindex > 0) {
        issues.push({
          element: el,
          message: `Element <${tag}> has tabindex="${tabindex}" (positive value), which disrupts the natural tab order.`,
          suggestion: 'Use tabindex="0" to include the element in document order, or restructure the DOM.',
        });
      }

      // 2. Custom widget roles on non-native elements must have tabindex="0".
      if (
        role &&
        CUSTOM_WIDGET_ROLES.has(role) &&
        !NATIVE_INTERACTIVE_TAGS.has(tag) &&
        tabindex === null
      ) {
        issues.push({
          element: el,
          message: `Element <${tag}> has role="${role}" but is not natively focusable and lacks tabindex="0".`,
          suggestion: 'Add tabindex="0" so keyboard users can reach the element.',
        });
      }

      // 3. Elements with onclick but no keyboard event handling.
      //    We detect this via the "onclick" reflected attribute (set in HTML)
      //    and the absence of keyboard-handler attributes.
      const hasOnclick =
        el.hasAttribute("onclick") ||
        (el as HTMLElement).onclick !== null;
      const hasKeyboardAttr =
        el.hasAttribute("onkeydown") ||
        el.hasAttribute("onkeypress") ||
        el.hasAttribute("onkeyup");

      if (
        hasOnclick &&
        !hasKeyboardAttr &&
        !NATIVE_INTERACTIVE_TAGS.has(tag) &&
        (!role || !CUSTOM_WIDGET_ROLES.has(role))
      ) {
        issues.push({
          element: el,
          message: `Element <${tag}> has a click handler but no keyboard event handler (onkeydown/onkeypress).`,
          suggestion:
            "Add an onkeydown handler (or convert to a <button>) so keyboard users can activate the element.",
        });
      }
    }

    return {
      pass: issues.length === 0,
      issues,
    };
  }

  // ── Focus trap ─────────────────────────────────────────────────────────────

  /**
   * Detects whether a focus trap exists inside the given container.
   *
   * A "focus trap" is detected when the container has focusable descendants
   * but none of those descendants can move focus outside the container
   * (i.e. the container has no visible focusable element in the ancestor
   * chain or in the rest of the document).
   *
   * Intentional traps (role="dialog" / "alertdialog") are distinguished
   * from unintentional ones.
   *
   * @param container — The element to inspect.
   * @returns FocusTrapResult
   */
  detectFocusTrap(container: Element): FocusTrapResult {
    // Collect focusable elements inside the container.
    const focusableElements = Array.from(
      container.querySelectorAll<Element>(FOCUSABLE_SELECTOR)
    );

    // No focusable elements → no trap.
    if (focusableElements.length === 0) {
      return {
        hasTrap: false,
        type: "none",
        focusableElements: [],
        message: "No focusable elements found inside the container; no focus trap.",
      };
    }

    // Check whether focusable elements exist outside the container.
    const doc = container.ownerDocument ?? (typeof document !== "undefined" ? document : null);
    if (!doc) {
      return {
        hasTrap: false,
        type: "none",
        focusableElements,
        message: "Could not access ownerDocument to analyse focus scope.",
      };
    }

    const allFocusable = Array.from(doc.querySelectorAll<Element>(FOCUSABLE_SELECTOR));
    const outsideFocusable = allFocusable.filter((el) => !container.contains(el));

    // If there are no focusable elements outside → potential trap.
    if (outsideFocusable.length > 0) {
      return {
        hasTrap: false,
        type: "none",
        focusableElements,
        message: "Focusable elements exist outside the container; focus is not trapped.",
      };
    }

    // Trap confirmed — determine whether it is intentional.
    const role = container.getAttribute("role");
    const isModal = role !== null && MODAL_ROLES.has(role);

    // Also check aria-modal attribute as additional signal.
    const hasAriaModal = container.getAttribute("aria-modal") === "true";

    if (isModal || hasAriaModal) {
      return {
        hasTrap: true,
        type: "intentional",
        focusableElements,
        message:
          `Intentional focus trap detected inside role="${role ?? ""}${hasAriaModal ? " aria-modal" : ""}" container. ` +
          "Ensure an Escape key handler and an accessible close mechanism are provided.",
      };
    }

    return {
      hasTrap: true,
      type: "unintentional",
      focusableElements,
      message:
        "Unintentional focus trap detected: focus cannot leave the container and the container has no modal semantics. " +
        "This will prevent keyboard users from reaching the rest of the page.",
    };
  }

  // ── Devtools overlay ───────────────────────────────────────────────────────

  /**
   * Renders a visual overlay on each violated element for devtools inspection.
   * Each overlay is a fixed-position badge showing the rule id and message.
   *
   * The overlay elements are appended to document.body and can be removed by
   * calling the returned cleanup function.
   *
   * @param violations — Array of Violation objects (from RuleEngine.run()).
   * @returns A cleanup function that removes all created overlay elements.
   */
  createOverlay(violations: Violation[]): () => void {
    if (typeof document === "undefined") return () => {};

    const overlays: HTMLElement[] = [];

    for (const violation of violations) {
      const target = violation.element as HTMLElement;
      const rect = target.getBoundingClientRect?.();

      const overlay = document.createElement("div");
      overlay.setAttribute("data-a11y-overlay", "true");
      overlay.setAttribute("role", "tooltip");
      overlay.setAttribute("aria-label", `Accessibility violation: ${violation.message}`);

      Object.assign(overlay.style, {
        position: "fixed",
        top: rect ? `${rect.top}px` : "0",
        left: rect ? `${rect.left}px` : "0",
        width: rect ? `${Math.max(rect.width, 4)}px` : "4px",
        height: rect ? `${Math.max(rect.height, 4)}px` : "4px",
        outline: "3px solid red",
        background: "rgba(255, 0, 0, 0.15)",
        zIndex: "2147483647",
        pointerEvents: "none",
        boxSizing: "border-box",
      });

      // Badge label.
      const badge = document.createElement("span");
      Object.assign(badge.style, {
        position: "absolute",
        top: "0",
        left: "0",
        background: "red",
        color: "white",
        fontSize: "11px",
        fontFamily: "monospace",
        padding: "1px 4px",
        borderRadius: "0 0 3px 0",
        maxWidth: "300px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
      });
      badge.textContent = `[${violation.rule.id}] ${violation.message}`;
      overlay.appendChild(badge);

      document.body.appendChild(overlay);
      overlays.push(overlay);
    }

    return () => {
      for (const overlay of overlays) {
        overlay.parentNode?.removeChild(overlay);
      }
    };
  }
}

/**
 * Convenience singleton — import and use directly without instantiation.
 */
export const runtimeChecker = new RuntimeChecker();
