/**
 * @vaisx/a11y — Public API
 *
 * Accessibility rule engine for WCAG 2.1 AA compliance.
 * Zero runtime dependencies.
 */

// Core engine
export { RuleEngine, createEngine } from "./engine.js";
export type { RunOptions } from "./engine.js";

// Built-in rules
export { altTextRule, ariaAttrsRule, focusManagementRule, builtinRules } from "./rules/index.js";

// Compile-time linter
export { A11yLinter } from "./lint.js";
export type { A11yLintConfig, RuleSeverity } from "./lint.js";

// CLI audit logic
export { A11yAuditor } from "./cli.js";
export type { A11yAuditConfig, AuditReport, FileResult } from "./cli.js";

// Runtime checker
export {
  RuntimeChecker,
  runtimeChecker,
  parseColor,
  relativeLuminance,
  contrastRatio,
} from "./runtime.js";
export type {
  ContrastResult,
  KeyboardNavIssue,
  KeyboardNavResult,
  FocusTrapResult,
} from "./runtime.js";

// Type definitions
export type {
  A11yRule,
  RuleResult,
  A11yConfig,
  A11yReport,
  Violation,
  LintDiagnostic,
  ImpactLevel,
  ConformanceLevel,
} from "./types.js";

// ARIA component patterns — WAI-ARIA Authoring Practices 1.2
export {
  buttonPattern,
  inputPattern,
  modalPattern,
  dropdownPattern,
  applyPattern,
  validatePattern,
} from "./patterns.js";
export type { AriaPattern, PatternIssue, PatternResult } from "./patterns.js";

// Testing utilities — @testing-library/dom-style a11y query helpers
export {
  // getByRole family
  getByRole,
  getAllByRole,
  queryByRole,
  queryAllByRole,
  // getByLabelText family
  getByLabelText,
  getAllByLabelText,
  queryByLabelText,
  queryAllByLabelText,
  // getByAltText family
  getByAltText,
  getAllByAltText,
  queryByAltText,
  queryAllByAltText,
  // getByTitle family
  getByTitle,
  getAllByTitle,
  queryByTitle,
  queryAllByTitle,
  // Role map / accessibility helpers
  getRoles,
  isInaccessible,
  toBeAccessible,
} from "./testing.js";
export type { ByRoleOptions, AccessibleMatchResult } from "./testing.js";
