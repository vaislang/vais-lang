/**
 * Built-in accessibility rules for @vaisx/a11y.
 *
 * All rules conform to WCAG 2.1 AA and follow the axe-core rule format.
 */

export { altTextRule } from "./alt-text.js";
export { ariaAttrsRule } from "./aria-attrs.js";
export { focusManagementRule } from "./focus-management.js";

import { altTextRule } from "./alt-text.js";
import { ariaAttrsRule } from "./aria-attrs.js";
import { focusManagementRule } from "./focus-management.js";
import type { A11yRule } from "../types.js";

/**
 * The complete set of built-in rules, ready to pass to RuleEngine or
 * createEngine().
 */
export const builtinRules: A11yRule[] = [
  altTextRule,
  ariaAttrsRule,
  focusManagementRule,
];
