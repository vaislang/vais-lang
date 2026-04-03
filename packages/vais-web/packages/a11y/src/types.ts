/**
 * Core type definitions for @vaisx/a11y.
 * Designed for WCAG 2.1 AA compliance — axe-core-style rule engine pattern.
 */

/**
 * Impact severity of an accessibility violation, aligned with WCAG 2.1 conformance levels.
 * - critical: Completely blocks access for users with disabilities
 * - serious:  Severely impairs access; should be fixed before launch
 * - moderate: Causes difficulty but users may work around it
 * - minor:    Minor barriers; best-practice violations
 */
export type ImpactLevel = "critical" | "serious" | "moderate" | "minor";

/**
 * WCAG conformance level target.
 */
export type ConformanceLevel = "A" | "AA" | "AAA";

/**
 * The result of executing a single rule against a DOM node.
 */
export interface RuleResult {
  /** Whether the node passed the rule check. */
  pass: boolean;
  /** Human-readable explanation (populated on failure or incomplete). */
  message?: string;
  /** The DOM element that was evaluated. */
  element?: Element;
  /** Recommended fix for the violation. */
  suggestion?: string;
}

/**
 * A single accessibility rule in the axe-core style.
 * Each rule encapsulates a WCAG success criterion check.
 */
export interface A11yRule {
  /** Unique rule identifier (e.g. "img-alt", "aria-required-attr"). */
  id: string;
  /** Human-readable description of what the rule checks. */
  description: string;
  /** Severity of violations found by this rule. */
  impact: ImpactLevel;
  /**
   * Check function executed against a single DOM node.
   * Receives the element and returns a RuleResult.
   */
  check: (node: Element) => RuleResult;
}

/**
 * Engine configuration controlling which rules run and against which elements.
 */
export interface A11yConfig {
  /** The set of rules to run. */
  rules: A11yRule[];
  /** Minimum WCAG conformance level to enforce. */
  level: ConformanceLevel;
  /** CSS selector or element list to include in the scan (default: entire document). */
  include?: string | Element[];
  /** CSS selector or element list to exclude from the scan. */
  exclude?: string | Element[];
}

/**
 * A single accessibility violation — a rule that failed for a specific element.
 */
export interface Violation {
  /** The rule that was violated. */
  rule: A11yRule;
  /** The DOM element that caused the violation. */
  element: Element;
  /** Impact severity, copied from the rule for convenient access. */
  impact: ImpactLevel;
  /** Description of the violation. */
  message: string;
  /** Recommended remediation. */
  suggestion?: string;
}

/**
 * The full report produced after running the engine against a scope.
 */
export interface A11yReport {
  /** All violations found during the scan. */
  violations: Violation[];
  /** Number of rule/element pairs that passed. */
  passes: number;
  /** Number of rule/element pairs that could not be determined (not yet used). */
  incomplete: number;
  /** ISO 8601 timestamp of when the scan was completed. */
  timestamp: string;
}

/**
 * A lint diagnostic emitted by the static-analysis layer (e.g. template linting).
 */
export interface LintDiagnostic {
  /** Absolute or relative path to the source file. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
  /** Rule identifier that produced this diagnostic. */
  ruleId: string;
  /** Human-readable diagnostic message. */
  message: string;
  /** Diagnostic severity — maps to editor gutter icons and CI exit codes. */
  severity: "error" | "warning" | "info";
}
