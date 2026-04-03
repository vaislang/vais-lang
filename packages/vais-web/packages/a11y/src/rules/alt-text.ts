/**
 * alt-text rule — WCAG 2.1 Success Criterion 1.1.1 (Non-text Content, Level A)
 *
 * Every <img> element must have an alt attribute.
 * - Decorative images should use alt="" (empty string).
 * - Informative images must have a descriptive alt value.
 * - Images with role="presentation" or role="none" are exempt.
 */

import type { A11yRule, RuleResult } from "../types.js";

function checkAltText(node: Element): RuleResult {
  if (node.tagName.toLowerCase() !== "img") {
    return { pass: true };
  }

  const role = node.getAttribute("role");
  // Presentational roles exempt the image from needing a text alternative.
  if (role === "presentation" || role === "none") {
    return { pass: true };
  }

  if (!node.hasAttribute("alt")) {
    return {
      pass: false,
      element: node,
      message: `<img> element is missing an alt attribute. All images must have an alt attribute (use alt="" for decorative images).`,
      suggestion:
        'Add an alt attribute: alt="descriptive text" for informative images, or alt="" for decorative images.',
    };
  }

  const alt = node.getAttribute("alt") ?? "";

  // Heuristic: generic placeholder values are not meaningful.
  const genericValues = ["image", "photo", "picture", "img", "graphic", "icon"];
  if (genericValues.includes(alt.trim().toLowerCase())) {
    return {
      pass: false,
      element: node,
      message: `<img> alt="${alt}" is too generic and does not convey meaningful information.`,
      suggestion:
        "Replace the generic alt value with a concise description of the image content and its purpose.",
    };
  }

  return { pass: true };
}

export const altTextRule: A11yRule = {
  id: "img-alt",
  description:
    "Images must have text alternatives that describe their purpose or content (WCAG 1.1.1).",
  impact: "critical",
  check: checkAltText,
};
