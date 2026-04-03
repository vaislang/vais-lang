/**
 * aria-attrs rule — WCAG 2.1 Success Criterion 4.1.2 (Name, Role, Value, Level A)
 *
 * Validates that:
 * 1. aria-* attributes used on an element are valid (recognised by the spec).
 * 2. Required aria-* attributes for a given role are present.
 * 3. aria-hidden="true" is not applied to focusable elements.
 */

import type { A11yRule, RuleResult } from "../types.js";

// ─── Valid ARIA attributes (subset covering ARIA 1.2 global + role-specific) ──

const VALID_ARIA_ATTRS = new Set([
  "aria-activedescendant",
  "aria-atomic",
  "aria-autocomplete",
  "aria-braillelabel",
  "aria-brailleroledescription",
  "aria-busy",
  "aria-checked",
  "aria-colcount",
  "aria-colindex",
  "aria-colindextext",
  "aria-colspan",
  "aria-controls",
  "aria-current",
  "aria-describedby",
  "aria-description",
  "aria-details",
  "aria-disabled",
  "aria-dropeffect",
  "aria-errormessage",
  "aria-expanded",
  "aria-flowto",
  "aria-grabbed",
  "aria-haspopup",
  "aria-hidden",
  "aria-invalid",
  "aria-keyshortcuts",
  "aria-label",
  "aria-labelledby",
  "aria-level",
  "aria-live",
  "aria-modal",
  "aria-multiline",
  "aria-multiselectable",
  "aria-orientation",
  "aria-owns",
  "aria-placeholder",
  "aria-posinset",
  "aria-pressed",
  "aria-readonly",
  "aria-relevant",
  "aria-required",
  "aria-roledescription",
  "aria-rowcount",
  "aria-rowindex",
  "aria-rowindextext",
  "aria-rowspan",
  "aria-selected",
  "aria-setsize",
  "aria-sort",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
]);

// ─── Required aria attributes per role ────────────────────────────────────────

const REQUIRED_ATTRS_BY_ROLE: Record<string, string[]> = {
  checkbox: ["aria-checked"],
  combobox: ["aria-expanded"],
  listbox: [],
  meter: ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
  option: ["aria-selected"],
  progressbar: [],
  radio: ["aria-checked"],
  scrollbar: ["aria-valuenow", "aria-valuemin", "aria-valuemax", "aria-controls", "aria-orientation"],
  separator: [],
  slider: ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
  spinbutton: ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
  switch: ["aria-checked"],
  tab: [],
  treeitem: ["aria-expanded"],
};

// ─── Focusable element detection ──────────────────────────────────────────────

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
];

function isFocusable(node: Element): boolean {
  return FOCUSABLE_SELECTORS.some((sel) => {
    try {
      return node.matches(sel);
    } catch {
      return false;
    }
  });
}

// ─── Rule check ───────────────────────────────────────────────────────────────

function checkAriaAttrs(node: Element): RuleResult {
  const attrs = Array.from(node.attributes).filter((a) =>
    a.name.startsWith("aria-")
  );

  // 1. Validate attribute names.
  for (const attr of attrs) {
    if (!VALID_ARIA_ATTRS.has(attr.name)) {
      return {
        pass: false,
        element: node,
        message: `"${attr.name}" is not a valid ARIA attribute on <${node.tagName.toLowerCase()}>.`,
        suggestion: `Remove or correct the attribute. See https://www.w3.org/TR/wai-aria-1.2/#state_prop_def for the full list of valid ARIA attributes.`,
      };
    }
  }

  // 2. Check aria-hidden on focusable elements.
  if (
    node.getAttribute("aria-hidden") === "true" &&
    isFocusable(node)
  ) {
    return {
      pass: false,
      element: node,
      message: `aria-hidden="true" must not be applied to a focusable element (<${node.tagName.toLowerCase()}>). This hides the element from assistive technology while keeping it keyboard-reachable, creating a confusing experience.`,
      suggestion:
        "Remove aria-hidden or remove focusability (tabindex=-1 / disabled) from the element.",
    };
  }

  // 3. Check required attributes for the element's role.
  const role = node.getAttribute("role");
  if (role && role in REQUIRED_ATTRS_BY_ROLE) {
    const required = REQUIRED_ATTRS_BY_ROLE[role] ?? [];
    for (const req of required) {
      if (!node.hasAttribute(req)) {
        return {
          pass: false,
          element: node,
          message: `Element with role="${role}" is missing required ARIA attribute "${req}".`,
          suggestion: `Add the ${req} attribute to the element (e.g. ${req}="…").`,
        };
      }
    }
  }

  return { pass: true };
}

export const ariaAttrsRule: A11yRule = {
  id: "aria-required-attr",
  description:
    "Elements must use valid ARIA attributes and provide all required attributes for their role (WCAG 4.1.2).",
  impact: "critical",
  check: checkAriaAttrs,
};
