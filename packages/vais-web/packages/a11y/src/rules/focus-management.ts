/**
 * focus-management rule — WCAG 2.1 Success Criteria:
 *  - 2.1.1 Keyboard (Level A): All functionality must be keyboard-accessible.
 *  - 2.4.3 Focus Order (Level A): Focus order must preserve meaning.
 *  - 2.4.7 Focus Visible (Level AA): Any keyboard-operable UI component must
 *            have a visible keyboard focus indicator.
 *
 * Checks performed:
 *  1. Interactive elements (buttons, links, inputs) are not explicitly
 *     removed from tab order with tabindex="-1" unless they have a clear
 *     aria-hidden or disabled companion.
 *  2. Positive tabindex values (tabindex > 0) are flagged as an anti-pattern
 *     that disrupts the natural focus order.
 *  3. Elements with role="button" / role="link" that are not natively
 *     focusable must have tabindex="0".
 */

import type { A11yRule, RuleResult } from "../types.js";

// ─── Native interactive tags ───────────────────────────────────────────────────

const NATIVE_INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "tab",
  "treeitem",
]);

// ─── Rule check ───────────────────────────────────────────────────────────────

function checkFocusManagement(node: Element): RuleResult {
  const tag = node.tagName.toLowerCase();
  const tabindexAttr = node.getAttribute("tabindex");
  const tabindex = tabindexAttr !== null ? parseInt(tabindexAttr, 10) : null;
  const role = node.getAttribute("role");
  const isAriaHidden = node.getAttribute("aria-hidden") === "true";
  const isDisabled =
    node.hasAttribute("disabled") ||
    node.getAttribute("aria-disabled") === "true";

  // 1. Positive tabindex — disrupts natural focus order.
  if (tabindex !== null && tabindex > 0) {
    return {
      pass: false,
      element: node,
      message: `tabindex="${tabindex}" (positive value) disrupts the natural focus order. Avoid positive tabindex values.`,
      suggestion:
        'Use tabindex="0" to make an element focusable in document order, or tabindex="-1" to allow programmatic focus only.',
    };
  }

  // 2. Interactive elements with tabindex="-1" that are not aria-hidden or disabled.
  //    This removes them from the tab sequence without hiding them from AT.
  if (
    tabindex === -1 &&
    NATIVE_INTERACTIVE_TAGS.has(tag) &&
    !isAriaHidden &&
    !isDisabled
  ) {
    // <a> without href is non-interactive by default; skip.
    if (tag === "a" && !node.hasAttribute("href")) {
      return { pass: true };
    }
    return {
      pass: false,
      element: node,
      message: `<${tag}> has tabindex="-1", removing it from keyboard focus order without hiding it from assistive technology.`,
      suggestion:
        'Remove tabindex="-1" to keep the element in the tab order, or add aria-hidden="true" / disabled if it is intentionally non-interactive.',
    };
  }

  // 3. Custom interactive elements (by role) that lack tabindex="0".
  //    Non-native interactive elements must be manually made focusable.
  if (
    role &&
    INTERACTIVE_ROLES.has(role) &&
    !NATIVE_INTERACTIVE_TAGS.has(tag) &&
    tabindex === null &&
    !isAriaHidden &&
    !isDisabled
  ) {
    return {
      pass: false,
      element: node,
      message: `Element with role="${role}" (<${tag}>) is not natively focusable and is missing tabindex="0".`,
      suggestion:
        'Add tabindex="0" to include the element in the tab order and make it keyboard-accessible.',
    };
  }

  return { pass: true };
}

export const focusManagementRule: A11yRule = {
  id: "focus-management",
  description:
    "Interactive elements must be keyboard-accessible and must not disrupt the natural focus order (WCAG 2.1.1, 2.4.3, 2.4.7).",
  impact: "serious",
  check: checkFocusManagement,
};
